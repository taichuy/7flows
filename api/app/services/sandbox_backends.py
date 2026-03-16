from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from functools import lru_cache
from typing import Any

import httpx

from app.core.config import Settings, get_settings

_SANDBOX_EXECUTION_CLASSES = ("sandbox", "microvm")
_SANDBOX_DEPENDENCY_MODES = ("builtin", "dependency_ref", "backend_managed")
_SANDBOX_HEALTH_STATUSES = {"healthy", "degraded", "offline"}


def _normalize_string_tuple(values: object) -> tuple[str, ...]:
    normalized: list[str] = []
    seen: set[str] = set()
    if isinstance(values, (list, tuple, set)):
        for value in values:
            if not isinstance(value, str):
                continue
            candidate = value.strip()
            lowered = candidate.lower()
            if not candidate or lowered in seen:
                continue
            normalized.append(candidate)
            seen.add(lowered)
    return tuple(normalized)


def _normalize_execution_classes(values: object) -> tuple[str, ...]:
    normalized: list[str] = []
    seen: set[str] = set()
    if isinstance(values, (list, tuple, set)):
        for value in values:
            if not isinstance(value, str):
                continue
            candidate = value.strip().lower()
            if candidate not in _SANDBOX_EXECUTION_CLASSES or candidate in seen:
                continue
            normalized.append(candidate)
            seen.add(candidate)
    return tuple(normalized)


def _normalize_dependency_modes(values: object) -> tuple[str, ...]:
    normalized: list[str] = []
    seen: set[str] = set()
    if isinstance(values, (list, tuple, set)):
        for value in values:
            if not isinstance(value, str):
                continue
            candidate = value.strip().lower()
            if candidate not in _SANDBOX_DEPENDENCY_MODES or candidate in seen:
                continue
            normalized.append(candidate)
            seen.add(candidate)
    return tuple(normalized)


@dataclass(frozen=True)
class SandboxBackendCapability:
    supported_execution_classes: tuple[str, ...] = field(default_factory=tuple)
    supported_languages: tuple[str, ...] = field(default_factory=tuple)
    supported_profiles: tuple[str, ...] = field(default_factory=tuple)
    supported_dependency_modes: tuple[str, ...] = field(default_factory=tuple)
    supports_builtin_package_sets: bool = False
    supports_backend_extensions: bool = False
    supports_network_policy: bool = False
    supports_filesystem_policy: bool = False

    def __post_init__(self) -> None:
        object.__setattr__(
            self,
            "supported_execution_classes",
            _normalize_execution_classes(self.supported_execution_classes),
        )
        object.__setattr__(
            self,
            "supported_languages",
            _normalize_string_tuple(self.supported_languages),
        )
        object.__setattr__(
            self,
            "supported_profiles",
            _normalize_string_tuple(self.supported_profiles),
        )
        object.__setattr__(
            self,
            "supported_dependency_modes",
            _normalize_dependency_modes(self.supported_dependency_modes),
        )

    @classmethod
    def from_payload(cls, payload: object) -> "SandboxBackendCapability":
        if not isinstance(payload, dict):
            return cls()
        return cls(
            supported_execution_classes=payload.get("supportedExecutionClasses") or (),
            supported_languages=payload.get("supportedLanguages") or (),
            supported_profiles=payload.get("supportedProfiles") or (),
            supported_dependency_modes=payload.get("supportedDependencyModes") or (),
            supports_builtin_package_sets=bool(payload.get("supportsBuiltinPackageSets", False)),
            supports_backend_extensions=bool(payload.get("supportsBackendExtensions", False)),
            supports_network_policy=bool(payload.get("supportsNetworkPolicy", False)),
            supports_filesystem_policy=bool(payload.get("supportsFilesystemPolicy", False)),
        )

    def as_dict(self) -> dict[str, Any]:
        return {
            "supported_execution_classes": list(self.supported_execution_classes),
            "supported_languages": list(self.supported_languages),
            "supported_profiles": list(self.supported_profiles),
            "supported_dependency_modes": list(self.supported_dependency_modes),
            "supports_builtin_package_sets": self.supports_builtin_package_sets,
            "supports_backend_extensions": self.supports_backend_extensions,
            "supports_network_policy": self.supports_network_policy,
            "supports_filesystem_policy": self.supports_filesystem_policy,
        }


@dataclass(frozen=True)
class SandboxBackendRegistration:
    id: str
    kind: str
    endpoint: str
    enabled: bool = True
    health_status: str = "degraded"
    healthcheck_path: str = "/healthz"
    capabilities_path: str = "/capabilities"
    execute_path: str = "/execute"
    api_key: str | None = None
    capability: SandboxBackendCapability = field(default_factory=SandboxBackendCapability)


@dataclass(frozen=True)
class SandboxBackendHealth:
    id: str
    kind: str
    endpoint: str
    enabled: bool
    status: str
    capability: SandboxBackendCapability = field(default_factory=SandboxBackendCapability)
    detail: str | None = None


@dataclass(frozen=True)
class SandboxExecutionRequest:
    execution_class: str
    language: str
    code: str
    node_input: dict[str, Any]
    trace_id: str
    profile: str | None = None
    timeout_ms: int | None = None
    network_policy: str | None = None
    filesystem_policy: str | None = None


@dataclass(frozen=True)
class SandboxExecutionResponse:
    backend_id: str
    executor_ref: str
    effective_execution_class: str
    result: Any
    stdout: str = ""
    stderr: str = ""


@dataclass(frozen=True)
class SandboxBackendSelection:
    available: bool
    backend_id: str | None = None
    executor_ref: str | None = None
    reason: str | None = None
    capability: SandboxBackendCapability = field(default_factory=SandboxBackendCapability)
    health_status: str | None = None


SandboxBackendClientFactory = Callable[[int | None], httpx.Client]


def default_sandbox_backend_client_factory(timeout_ms: int | None) -> httpx.Client:
    timeout_seconds = None if timeout_ms is None or timeout_ms <= 0 else timeout_ms / 1000
    return httpx.Client(timeout=timeout_seconds)


class SandboxBackendRegistry:
    def __init__(self) -> None:
        self._backends: dict[str, SandboxBackendRegistration] = {}

    def register_backend(self, registration: SandboxBackendRegistration) -> None:
        self._backends[registration.id] = registration

    def get_backend(self, backend_id: str) -> SandboxBackendRegistration | None:
        return self._backends.get(backend_id)

    def list_backends(self) -> list[SandboxBackendRegistration]:
        return list(self._backends.values())

    def unregister_backend(self, backend_id: str) -> None:
        self._backends.pop(backend_id, None)


class SandboxBackendHealthChecker:
    def __init__(self, *, client_factory: SandboxBackendClientFactory | None = None) -> None:
        self._client_factory = client_factory or default_sandbox_backend_client_factory

    def probe(self, registration: SandboxBackendRegistration) -> SandboxBackendHealth:
        if not registration.enabled:
            return SandboxBackendHealth(
                id=registration.id,
                kind=registration.kind,
                endpoint=registration.endpoint,
                enabled=False,
                status="offline",
                capability=registration.capability,
                detail="sandbox backend is disabled",
            )

        try:
            with self._client_factory(5_000) as client:
                health_response = client.get(
                    _join_endpoint(registration.endpoint, registration.healthcheck_path),
                    headers=_auth_headers(registration.api_key),
                )
                health_response.raise_for_status()
                health_body = _safe_json(health_response)
                capability_response = client.get(
                    _join_endpoint(registration.endpoint, registration.capabilities_path),
                    headers=_auth_headers(registration.api_key),
                )
                capability_response.raise_for_status()
                capability_body = _safe_json(capability_response)
        except (httpx.HTTPError, ValueError) as exc:
            return SandboxBackendHealth(
                id=registration.id,
                kind=registration.kind,
                endpoint=registration.endpoint,
                enabled=registration.enabled,
                status="offline",
                capability=registration.capability,
                detail=str(exc),
            )

        raw_status = str(health_body.get("status") or registration.health_status).strip().lower()
        status = raw_status if raw_status in _SANDBOX_HEALTH_STATUSES else "healthy"
        detail = str(health_body.get("detail") or "").strip() or None
        return SandboxBackendHealth(
            id=registration.id,
            kind=registration.kind,
            endpoint=registration.endpoint,
            enabled=registration.enabled,
            status=status,
            capability=SandboxBackendCapability.from_payload(capability_body),
            detail=detail,
        )

    def probe_all(self, registry: SandboxBackendRegistry) -> list[SandboxBackendHealth]:
        return [self.probe(registration) for registration in registry.list_backends()]


class SandboxBackendClient:
    def __init__(
        self,
        registry: SandboxBackendRegistry,
        *,
        health_checker: SandboxBackendHealthChecker | None = None,
        client_factory: SandboxBackendClientFactory | None = None,
    ) -> None:
        self._registry = registry
        self._health_checker = health_checker or SandboxBackendHealthChecker(
            client_factory=client_factory
        )
        self._client_factory = client_factory or default_sandbox_backend_client_factory

    def describe_execution_backend(
        self,
        request: SandboxExecutionRequest,
    ) -> SandboxBackendSelection:
        return self._describe_backend_selection(
            execution_class=request.execution_class,
            language=request.language,
            profile=request.profile,
            network_policy=request.network_policy,
            filesystem_policy=request.filesystem_policy,
        )

    def describe_tool_execution_backend(
        self,
        *,
        execution_class: str,
        profile: str | None = None,
        network_policy: str | None = None,
        filesystem_policy: str | None = None,
    ) -> SandboxBackendSelection:
        return self._describe_backend_selection(
            execution_class=execution_class,
            language=None,
            profile=profile,
            network_policy=network_policy,
            filesystem_policy=filesystem_policy,
        )

    def _describe_backend_selection(
        self,
        *,
        execution_class: str,
        language: str | None,
        profile: str | None,
        network_policy: str | None,
        filesystem_policy: str | None,
    ) -> SandboxBackendSelection:
        backend_healths = self._health_checker.probe_all(self._registry)
        if not backend_healths:
            return SandboxBackendSelection(
                available=False,
                reason=(
                    "No sandbox backend is registered. Strong-isolation paths must fail closed "
                    "until a compatible backend is available."
                ),
            )

        reasons: list[str] = []
        for health in backend_healths:
            registration = self._registry.get_backend(health.id)
            if registration is None or not registration.enabled:
                continue
            if health.status not in {"healthy", "degraded"}:
                reasons.append(f"{health.id}: {health.detail or 'backend is offline'}")
                continue
            capability = health.capability
            if execution_class not in capability.supported_execution_classes:
                reasons.append(
                    f"{health.id}: does not support execution class '{execution_class}'"
                )
                continue
            if language and capability.supported_languages and language not in capability.supported_languages:
                reasons.append(f"{health.id}: does not support language '{language}'")
                continue
            if (
                profile
                and capability.supported_profiles
                and profile not in capability.supported_profiles
            ):
                reasons.append(f"{health.id}: does not expose profile '{profile}'")
                continue
            if network_policy and not capability.supports_network_policy:
                reasons.append(f"{health.id}: does not support networkPolicy hints")
                continue
            if filesystem_policy and not capability.supports_filesystem_policy:
                reasons.append(f"{health.id}: does not support filesystemPolicy hints")
                continue
            return SandboxBackendSelection(
                available=True,
                backend_id=health.id,
                executor_ref=f"sandbox-backend:{health.id}",
                capability=capability,
                health_status=health.status,
            )

        detail = "; ".join(reasons) if reasons else "No compatible sandbox backend is healthy."
        return SandboxBackendSelection(
            available=False,
            reason=(
                "No compatible sandbox backend is currently available for the requested "
                f"execution class '{execution_class}'. {detail}"
            ),
        )

    def execute(self, request: SandboxExecutionRequest) -> SandboxExecutionResponse:
        selection = self.describe_execution_backend(request)
        if not selection.available or selection.backend_id is None:
            raise RuntimeError(selection.reason or "Sandbox backend is unavailable.")

        registration = self._registry.get_backend(selection.backend_id)
        if registration is None:
            raise RuntimeError(
                f"Sandbox backend '{selection.backend_id}' is no longer registered."
            )

        payload: dict[str, Any] = {
            "executionClass": request.execution_class,
            "language": request.language,
            "code": request.code,
            "input": request.node_input,
            "traceId": request.trace_id,
        }
        if request.profile is not None:
            payload["profile"] = request.profile
        if request.timeout_ms is not None:
            payload["timeoutMs"] = request.timeout_ms
        if request.network_policy is not None:
            payload["networkPolicy"] = request.network_policy
        if request.filesystem_policy is not None:
            payload["filesystemPolicy"] = request.filesystem_policy

        try:
            with self._client_factory(request.timeout_ms) as client:
                response = client.post(
                    _join_endpoint(registration.endpoint, registration.execute_path),
                    json=payload,
                    headers=_auth_headers(registration.api_key),
                )
                response.raise_for_status()
                body = _safe_json(response)
        except (httpx.HTTPError, ValueError) as exc:
            raise RuntimeError(
                f"Sandbox backend '{registration.id}' execution failed: {exc}"
            ) from exc

        ok = body.get("ok")
        status = str(body.get("status") or "").strip().lower()
        if ok is False or status in {"error", "failed"}:
            raise RuntimeError(
                str(body.get("error") or f"Sandbox backend '{registration.id}' execution failed.")
            )

        return SandboxExecutionResponse(
            backend_id=registration.id,
            executor_ref=str(body.get("executorRef") or f"sandbox-backend:{registration.id}"),
            effective_execution_class=str(
                body.get("effectiveExecutionClass") or request.execution_class
            ),
            result=body.get("result"),
            stdout=str(body.get("stdout") or ""),
            stderr=str(body.get("stderr") or ""),
        )


def build_sandbox_backend_registry(settings: Settings | None = None) -> SandboxBackendRegistry:
    app_settings = settings or get_settings()
    registry = SandboxBackendRegistry()
    if app_settings.sandbox_url.strip():
        registry.register_backend(
            SandboxBackendRegistration(
                id="sandbox-default",
                kind="official",
                endpoint=app_settings.sandbox_url,
                enabled=True,
                api_key=app_settings.sandbox_api_key,
            )
        )
    return registry


_sandbox_backend_registry: SandboxBackendRegistry | None = None


def reset_sandbox_backend_registry(settings: Settings | None = None) -> SandboxBackendRegistry:
    global _sandbox_backend_registry
    _sandbox_backend_registry = build_sandbox_backend_registry(settings)
    return _sandbox_backend_registry


def get_sandbox_backend_registry() -> SandboxBackendRegistry:
    global _sandbox_backend_registry
    if _sandbox_backend_registry is None:
        _sandbox_backend_registry = build_sandbox_backend_registry()
    return _sandbox_backend_registry


@lru_cache(maxsize=1)
def get_sandbox_backend_health_checker() -> SandboxBackendHealthChecker:
    return SandboxBackendHealthChecker()


@lru_cache(maxsize=1)
def get_sandbox_backend_client() -> SandboxBackendClient:
    return SandboxBackendClient(
        get_sandbox_backend_registry(),
        health_checker=get_sandbox_backend_health_checker(),
    )


def _join_endpoint(endpoint: str, path: str) -> str:
    return f"{endpoint.rstrip('/')}/{path.lstrip('/')}"


def _auth_headers(api_key: str | None) -> dict[str, str]:
    if not api_key:
        return {}
    return {"x-sevenflows-sandbox-key": api_key}


def _safe_json(response: httpx.Response) -> dict[str, Any]:
    body = response.json()
    if not isinstance(body, dict):
        raise ValueError("sandbox backend returned a non-object payload")
    return body

from datetime import UTC, datetime
from types import SimpleNamespace

from app.api.routes import system as system_routes
from app.models.run import NodeRun, Run, RunEvent
from app.models.scheduler import ScheduledTaskRunRecord
from app.schemas.plugin import PluginToolItem
from app.services.plugin_runtime import (
    CompatibilityAdapterHealth,
    PluginRegistry,
    PluginToolDefinition,
)
from app.services.sandbox_backends import (
    SandboxBackendCapability,
    SandboxBackendHealth,
    SandboxBackendRegistry,
)


class _HealthyRedis:
    def ping(self) -> bool:
        return True


class _HealthyS3Client:
    def list_buckets(self) -> dict:
        return {"Buckets": []}


class _StaticHealthChecker:
    def __init__(self, healths: list[CompatibilityAdapterHealth]) -> None:
        self._healths = healths

    def probe_all(self, registry: PluginRegistry) -> list[CompatibilityAdapterHealth]:
        return self._healths


class _StaticSandboxHealthChecker:
    def __init__(self, healths: list[SandboxBackendHealth]) -> None:
        self._healths = healths

    def probe_all(self, registry: SandboxBackendRegistry) -> list[SandboxBackendHealth]:
        return self._healths


def _build_settings(**overrides) -> SimpleNamespace:
    values = {
        "env": "test",
        "redis_url": "redis://example",
        "s3_endpoint": "http://example",
        "s3_access_key": "key",
        "s3_secret_key": "secret",
        "s3_region": "us-east-1",
        "s3_use_ssl": False,
        "callback_ticket_cleanup_schedule_enabled": True,
        "callback_ticket_cleanup_interval_seconds": 300,
        "waiting_resume_monitor_schedule_enabled": True,
        "waiting_resume_monitor_interval_seconds": 300,
    }
    values.update(overrides)
    return SimpleNamespace(**values)


def test_system_overview_includes_plugin_adapter_health(
    client,
    sqlite_session,
    monkeypatch,
) -> None:
    registry = PluginRegistry()
    sandbox_registry = SandboxBackendRegistry()
    registry.register_tool(
        PluginToolDefinition(
            id="compat:dify:plugin:demo/search",
            name="Demo Search",
            ecosystem="compat:dify",
            source="plugin",
        )
    )
    monkeypatch.setattr(system_routes, "get_settings", lambda: _build_settings())
    monkeypatch.setattr(system_routes, "check_database", lambda: True)
    monkeypatch.setattr(system_routes.redis, "from_url", lambda url: _HealthyRedis())
    monkeypatch.setattr(system_routes.boto3, "client", lambda *args, **kwargs: _HealthyS3Client())
    monkeypatch.setattr(system_routes, "get_plugin_registry", lambda: registry)
    monkeypatch.setattr(system_routes, "get_sandbox_backend_registry", lambda: sandbox_registry)
    monkeypatch.setattr(
        system_routes,
        "get_compatibility_adapter_health_checker",
        lambda: _StaticHealthChecker(
            [
                CompatibilityAdapterHealth(
                    id="dify-default",
                    ecosystem="compat:dify",
                    endpoint="http://adapter.local",
                    enabled=True,
                    status="up",
                )
            ]
        ),
    )
    monkeypatch.setattr(
        system_routes,
        "get_sandbox_backend_health_checker",
        lambda: _StaticSandboxHealthChecker(
            [
                SandboxBackendHealth(
                    id="sandbox-default",
                    kind="official",
                    endpoint="http://sandbox.local",
                    enabled=True,
                    status="healthy",
                    capability=SandboxBackendCapability(
                        supported_execution_classes=("sandbox",),
                        supported_languages=("python",),
                        supported_profiles=("python-safe",),
                        supported_dependency_modes=("builtin",),
                        supports_tool_execution=True,
                        supports_network_policy=True,
                        supports_filesystem_policy=True,
                    ),
                )
            ]
        ),
    )
    timestamp = datetime.now(UTC)
    sqlite_session.add_all(
        [
            ScheduledTaskRunRecord(
                id="task-run-cleanup",
                task_name="runtime.cleanup_callback_tickets",
                source="scheduler_cleanup",
                status="succeeded",
                matched_count=1,
                affected_count=1,
                detail="cleanup ok",
                summary_payload={},
                started_at=timestamp,
                finished_at=timestamp,
            ),
            ScheduledTaskRunRecord(
                id="task-run-monitor",
                task_name="runtime.monitor_waiting_resumes",
                source="scheduler_waiting_resume_monitor",
                status="succeeded",
                matched_count=2,
                affected_count=1,
                detail="monitor ok",
                summary_payload={},
                started_at=timestamp,
                finished_at=timestamp,
            ),
        ]
    )
    sqlite_session.commit()

    timestamp_value = timestamp.isoformat().replace("+00:00", "Z")

    response = client.get("/api/system/overview")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert "plugin-call-proxy-foundation" in body["capabilities"]
    assert "plugin-adapter-health-probe" in body["capabilities"]
    assert "sandbox-backend-registry" in body["capabilities"]
    assert "sandbox-readiness-summary" in body["capabilities"]
    assert "callback-waiting-automation-summary" in body["capabilities"]
    assert "callback-waiting-automation-health" in body["capabilities"]
    assert "plugin-tool-catalog-visible" in body["capabilities"]
    assert "runtime-events-visible" in body["capabilities"]
    assert body["plugin_adapters"] == [
        {
            "id": "dify-default",
            "ecosystem": "compat:dify",
            "endpoint": "http://adapter.local",
            "enabled": True,
            "status": "up",
            "detail": None,
        }
    ]
    assert body["sandbox_backends"] == [
        {
            "id": "sandbox-default",
            "kind": "official",
            "endpoint": "http://sandbox.local",
            "enabled": True,
            "status": "healthy",
            "detail": None,
            "capability": {
                "supported_execution_classes": ["sandbox"],
                "supported_languages": ["python"],
                "supported_profiles": ["python-safe"],
                "supported_dependency_modes": ["builtin"],
                "supports_tool_execution": True,
                "supports_builtin_package_sets": False,
                "supports_backend_extensions": False,
                "supports_network_policy": True,
                "supports_filesystem_policy": True,
            },
        }
    ]
    assert body["plugin_tools"] == [
        {
            "id": "compat:dify:plugin:demo/search",
            "name": "Demo Search",
            "ecosystem": "compat:dify",
            "source": "plugin",
            "callable": True,
        }
    ]
    assert body["sandbox_readiness"] == {
        "enabled_backend_count": 1,
        "healthy_backend_count": 1,
        "degraded_backend_count": 0,
        "offline_backend_count": 0,
        "execution_classes": [
            {
                "execution_class": "sandbox",
                "available": True,
                "backend_ids": ["sandbox-default"],
                "supported_languages": ["python"],
                "supported_profiles": ["python-safe"],
                "supported_dependency_modes": ["builtin"],
                "supports_tool_execution": True,
                "supports_builtin_package_sets": False,
                "supports_backend_extensions": False,
                "supports_network_policy": True,
                "supports_filesystem_policy": True,
                "reason": None,
            },
            {
                "execution_class": "microvm",
                "available": False,
                "backend_ids": [],
                "supported_languages": [],
                "supported_profiles": [],
                "supported_dependency_modes": [],
                "supports_tool_execution": False,
                "supports_builtin_package_sets": False,
                "supports_backend_extensions": False,
                "supports_network_policy": False,
                "supports_filesystem_policy": False,
                "reason": (
                    "Healthy sandbox backends do not currently advertise execution class "
                    "'microvm': sandbox-default."
                ),
            },
        ],
        "supported_languages": ["python"],
        "supported_profiles": ["python-safe"],
        "supported_dependency_modes": ["builtin"],
        "supports_tool_execution": True,
        "supports_builtin_package_sets": False,
        "supports_backend_extensions": False,
        "supports_network_policy": True,
        "supports_filesystem_policy": True,
        "affected_run_count": 0,
        "affected_workflow_count": 0,
        "primary_blocker_kind": "execution_class_blocked",
        "recommended_action": {
            "kind": "execution_class_blocked",
            "entry_key": "workflowLibrary",
            "href": "/workflows",
            "label": "查看 workflow 隔离需求",
        },
    }
    assert body["runtime_activity"] == {
        "summary": {
            "recent_run_count": 0,
            "recent_event_count": 0,
            "run_statuses": {},
            "event_types": {},
        },
        "recent_runs": [],
        "recent_events": [],
    }
    assert body["callback_waiting_automation"] == {
        "status": "configured",
        "scheduler_required": True,
        "detail": (
            "`WAITING_CALLBACK` 后台补偿链路已完成配置，"
            "但仍依赖独立 scheduler 进程实际运行。"
        ),
        "scheduler_health_status": "healthy",
        "scheduler_health_detail": "所有已启用的 callback waiting 后台任务都记录到了最近执行事实。",
        "steps": [
            {
                "key": "callback_ticket_cleanup",
                "label": "Expire stale callback tickets",
                "task": "runtime.cleanup_callback_tickets",
                "source": "scheduler_cleanup",
                "enabled": True,
                "interval_seconds": 300,
                "detail": (
                    "周期清理 stale callback ticket，"
                    "并在条件满足时沿同一事实链补发即时 resume。"
                ),
                "scheduler_health": {
                    "health_status": "healthy",
                    "detail": "最近一次 scheduler 执行事实仍在调度窗口内。",
                    "last_status": "succeeded",
                    "last_started_at": timestamp_value,
                    "last_finished_at": timestamp_value,
                    "matched_count": 1,
                    "affected_count": 1,
                },
            },
            {
                "key": "waiting_resume_monitor",
                "label": "Requeue due waiting callbacks",
                "task": "runtime.monitor_waiting_resumes",
                "source": "scheduler_waiting_resume_monitor",
                "enabled": True,
                "interval_seconds": 300,
                "detail": "周期扫描到期的 `WAITING_CALLBACK` node，并补发后台 requeue / resume。",
                "scheduler_health": {
                    "health_status": "healthy",
                    "detail": "最近一次 scheduler 执行事实仍在调度窗口内。",
                    "last_status": "succeeded",
                    "last_started_at": timestamp_value,
                    "last_finished_at": timestamp_value,
                    "matched_count": 2,
                    "affected_count": 1,
                },
            },
        ],
        "affected_run_count": 0,
        "affected_workflow_count": 0,
        "primary_blocker_kind": None,
        "recommended_action": None,
    }
    assert any(service["name"] == "plugin-adapter:dify-default" for service in body["services"])
    assert any(service["name"] == "sandbox-backend:sandbox-default" for service in body["services"])


def test_system_overview_treats_degraded_plugin_adapter_as_operable(
    client,
    sqlite_session,
    monkeypatch,
) -> None:
    monkeypatch.setattr(system_routes, "get_settings", lambda: _build_settings())
    monkeypatch.setattr(system_routes, "check_database", lambda: True)
    monkeypatch.setattr(system_routes.redis, "from_url", lambda url: _HealthyRedis())
    monkeypatch.setattr(system_routes.boto3, "client", lambda *args, **kwargs: _HealthyS3Client())
    monkeypatch.setattr(system_routes, "get_plugin_registry", lambda: PluginRegistry())
    monkeypatch.setattr(system_routes, "get_sandbox_backend_registry", lambda: SandboxBackendRegistry())
    monkeypatch.setattr(
        system_routes,
        "get_compatibility_adapter_health_checker",
        lambda: _StaticHealthChecker(
            [
                CompatibilityAdapterHealth(
                    id="dify-default",
                    ecosystem="compat:dify",
                    endpoint="http://adapter.local",
                    enabled=True,
                    status="degraded",
                    detail="proxy mode is partially available",
                )
            ]
        ),
    )
    monkeypatch.setattr(
        system_routes,
        "get_sandbox_backend_health_checker",
        lambda: _StaticSandboxHealthChecker([]),
    )

    response = client.get("/api/system/overview")

    assert response.status_code == 200
    body = response.json()
    assert any(
        service == {
            "name": "plugin-adapter:dify-default",
            "status": "up",
            "detail": "proxy mode is partially available",
        }
        for service in body["services"]
    )


def test_system_overview_reports_sandbox_readiness_gap_reason(client, monkeypatch) -> None:
    monkeypatch.setattr(
        system_routes,
        "get_settings",
        lambda: _build_settings(
            callback_ticket_cleanup_schedule_enabled=False,
            waiting_resume_monitor_schedule_enabled=False,
        ),
    )
    monkeypatch.setattr(system_routes, "check_database", lambda: True)
    monkeypatch.setattr(system_routes.redis, "from_url", lambda url: _HealthyRedis())
    monkeypatch.setattr(system_routes.boto3, "client", lambda *args, **kwargs: _HealthyS3Client())
    monkeypatch.setattr(system_routes, "get_plugin_registry", lambda: PluginRegistry())
    monkeypatch.setattr(
        system_routes,
        "get_sandbox_backend_registry",
        lambda: SandboxBackendRegistry(),
    )
    monkeypatch.setattr(
        system_routes,
        "get_compatibility_adapter_health_checker",
        lambda: _StaticHealthChecker([]),
    )
    monkeypatch.setattr(
        system_routes,
        "get_sandbox_backend_health_checker",
        lambda: _StaticSandboxHealthChecker(
            [
                SandboxBackendHealth(
                    id="sandbox-offline",
                    kind="official",
                    endpoint="http://sandbox.local",
                    enabled=True,
                    status="offline",
                    capability=SandboxBackendCapability(
                        supported_execution_classes=("sandbox", "microvm"),
                    ),
                    detail="connect timeout",
                )
            ]
        ),
    )

    response = client.get("/api/system/overview")

    assert response.status_code == 200
    body = response.json()
    assert body["sandbox_readiness"] == {
        "enabled_backend_count": 1,
        "healthy_backend_count": 0,
        "degraded_backend_count": 0,
        "offline_backend_count": 1,
        "execution_classes": [
            {
                "execution_class": "sandbox",
                "available": False,
                "backend_ids": [],
                "supported_languages": [],
                "supported_profiles": [],
                "supported_dependency_modes": [],
                "supports_tool_execution": False,
                "supports_builtin_package_sets": False,
                "supports_backend_extensions": False,
                "supports_network_policy": False,
                "supports_filesystem_policy": False,
                "reason": (
                    "Enabled sandbox backends are not currently healthy for 'sandbox': "
                    "sandbox-offline (offline)."
                ),
            },
            {
                "execution_class": "microvm",
                "available": False,
                "backend_ids": [],
                "supported_languages": [],
                "supported_profiles": [],
                "supported_dependency_modes": [],
                "supports_tool_execution": False,
                "supports_builtin_package_sets": False,
                "supports_backend_extensions": False,
                "supports_network_policy": False,
                "supports_filesystem_policy": False,
                "reason": (
                    "Enabled sandbox backends are not currently healthy for 'microvm': "
                    "sandbox-offline (offline)."
                ),
            },
        ],
        "supported_languages": [],
        "supported_profiles": [],
        "supported_dependency_modes": [],
        "supports_tool_execution": False,
        "supports_builtin_package_sets": False,
        "supports_backend_extensions": False,
        "supports_network_policy": False,
        "supports_filesystem_policy": False,
        "affected_run_count": 0,
        "affected_workflow_count": 0,
        "primary_blocker_kind": "execution_class_blocked",
        "recommended_action": {
            "kind": "execution_class_blocked",
            "entry_key": "workflowLibrary",
            "href": "/workflows",
            "label": "查看 workflow 隔离需求",
        },
    }
    assert body["callback_waiting_automation"] == {
        "status": "disabled",
        "scheduler_required": True,
        "detail": (
            "`WAITING_CALLBACK` 未启用后台补偿调度；"
            "当前仍依赖直接 callback、手动 cleanup 或手动 resume。"
        ),
        "scheduler_health_status": "disabled",
        "scheduler_health_detail": (
            "当前没有启用的 callback waiting 后台调度步骤，"
            "因此不存在 scheduler 新鲜度可检查项。"
        ),
        "steps": [
            {
                "key": "callback_ticket_cleanup",
                "label": "Expire stale callback tickets",
                "task": "runtime.cleanup_callback_tickets",
                "source": "scheduler_cleanup",
                "enabled": False,
                "interval_seconds": None,
                "detail": "当前未配置周期清理；过期 callback ticket 需要依赖手动治理入口。",
                "scheduler_health": {
                    "health_status": "disabled",
                    "detail": "当前未启用该周期任务，无需检查 scheduler 最近执行事实。",
                    "last_status": None,
                    "last_started_at": None,
                    "last_finished_at": None,
                    "matched_count": 0,
                    "affected_count": 0,
                },
            },
            {
                "key": "waiting_resume_monitor",
                "label": "Requeue due waiting callbacks",
                "task": "runtime.monitor_waiting_resumes",
                "source": "scheduler_waiting_resume_monitor",
                "enabled": False,
                "interval_seconds": None,
                "detail": (
                    "当前未配置周期 waiting resume monitor；"
                    "到期 waiting callback 仍需要依赖 callback 投递或手动恢复。"
                ),
                "scheduler_health": {
                    "health_status": "disabled",
                    "detail": "当前未启用该周期任务，无需检查 scheduler 最近执行事实。",
                    "last_status": None,
                    "last_started_at": None,
                    "last_finished_at": None,
                    "matched_count": 0,
                    "affected_count": 0,
                },
            },
        ],
        "affected_run_count": 0,
        "affected_workflow_count": 0,
        "primary_blocker_kind": "automation_disabled",
        "recommended_action": {
            "kind": "automation_disabled",
            "entry_key": "runLibrary",
            "href": "/runs",
            "label": "查看 callback recovery 状态",
        },
    }


def test_system_overview_reports_impacted_workload_follow_up_contract(
    client,
    sqlite_session,
    sample_workflow,
    monkeypatch,
) -> None:
    sample_workflow.definition = {
        "nodes": [
            {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
            {
                "id": "isolated_code",
                "type": "sandbox_code",
                "name": "Isolated Code",
                "config": {},
                "runtimePolicy": {"execution": {"class": "microvm"}},
            },
        ],
        "edges": [
            {"id": "edge-1", "sourceNodeId": "trigger", "targetNodeId": "isolated_code"}
        ],
    }
    sqlite_session.add(
        Run(
            id="run-microvm-blocked",
            workflow_id=sample_workflow.id,
            workflow_version=sample_workflow.version,
            compiled_blueprint_id=None,
            status="running",
            current_node_id="isolated_code",
            input_payload={},
            checkpoint_payload={},
            created_at=datetime.now(UTC),
        )
    )
    sqlite_session.add(
        Run(
            id="run-waiting-callback",
            workflow_id=sample_workflow.id,
            workflow_version=sample_workflow.version,
            compiled_blueprint_id=None,
            status="waiting",
            current_node_id="callback_node",
            input_payload={},
            checkpoint_payload={},
            created_at=datetime.now(UTC),
        )
    )
    sqlite_session.add(
        NodeRun(
            id="node-run-waiting-callback",
            run_id="run-waiting-callback",
            node_id="callback_node",
            node_name="Callback Node",
            node_type="agent",
            status="waiting_callback",
            phase="waiting_callback",
            input_payload={},
            checkpoint_payload={},
            working_context={},
            created_at=datetime.now(UTC),
        )
    )
    sqlite_session.commit()

    monkeypatch.setattr(
        system_routes,
        "get_settings",
        lambda: _build_settings(
            callback_ticket_cleanup_schedule_enabled=False,
            waiting_resume_monitor_schedule_enabled=False,
        ),
    )
    monkeypatch.setattr(system_routes, "check_database", lambda: True)
    monkeypatch.setattr(system_routes.redis, "from_url", lambda url: _HealthyRedis())
    monkeypatch.setattr(system_routes.boto3, "client", lambda *args, **kwargs: _HealthyS3Client())
    monkeypatch.setattr(system_routes, "get_plugin_registry", lambda: PluginRegistry())
    monkeypatch.setattr(
        system_routes,
        "get_sandbox_backend_registry",
        lambda: SandboxBackendRegistry(),
    )
    monkeypatch.setattr(
        system_routes,
        "get_compatibility_adapter_health_checker",
        lambda: _StaticHealthChecker([]),
    )
    monkeypatch.setattr(
        system_routes,
        "get_sandbox_backend_health_checker",
        lambda: _StaticSandboxHealthChecker(
            [
                SandboxBackendHealth(
                    id="sandbox-default",
                    kind="official",
                    endpoint="http://sandbox.local",
                    enabled=True,
                    status="healthy",
                    capability=SandboxBackendCapability(
                        supported_execution_classes=("sandbox",),
                    ),
                )
            ]
        ),
    )

    response = client.get("/api/system/overview")

    assert response.status_code == 200
    body = response.json()
    assert body["sandbox_readiness"]["affected_run_count"] == 2
    assert body["sandbox_readiness"]["affected_workflow_count"] == 1
    assert body["sandbox_readiness"]["primary_blocker_kind"] == "execution_class_blocked"
    assert body["sandbox_readiness"]["recommended_action"] == {
        "kind": "execution_class_blocked",
        "entry_key": "workflowLibrary",
        "href": "/workflows",
        "label": "查看受强隔离阻断的 workflows",
    }
    assert body["callback_waiting_automation"]["affected_run_count"] == 1
    assert body["callback_waiting_automation"]["affected_workflow_count"] == 1
    assert body["callback_waiting_automation"]["primary_blocker_kind"] == "automation_disabled"
    assert body["callback_waiting_automation"]["recommended_action"] == {
        "kind": "automation_disabled",
        "entry_key": "runLibrary",
        "href": "/runs",
        "label": "查看 waiting callback runs",
    }


def test_system_overview_aggregates_sandbox_capabilities_per_execution_class(
    client, monkeypatch
) -> None:
    monkeypatch.setattr(system_routes, "get_settings", lambda: _build_settings())
    monkeypatch.setattr(system_routes, "check_database", lambda: True)
    monkeypatch.setattr(system_routes.redis, "from_url", lambda url: _HealthyRedis())
    monkeypatch.setattr(system_routes.boto3, "client", lambda *args, **kwargs: _HealthyS3Client())
    monkeypatch.setattr(system_routes, "get_plugin_registry", lambda: PluginRegistry())
    monkeypatch.setattr(
        system_routes,
        "get_sandbox_backend_registry",
        lambda: SandboxBackendRegistry(),
    )
    monkeypatch.setattr(
        system_routes,
        "get_compatibility_adapter_health_checker",
        lambda: _StaticHealthChecker([]),
    )
    monkeypatch.setattr(
        system_routes,
        "get_sandbox_backend_health_checker",
        lambda: _StaticSandboxHealthChecker(
            [
                SandboxBackendHealth(
                    id="sandbox-default",
                    kind="official",
                    endpoint="http://sandbox.local",
                    enabled=True,
                    status="healthy",
                    capability=SandboxBackendCapability(
                        supported_execution_classes=("sandbox",),
                        supported_languages=("python",),
                        supported_profiles=("python-safe",),
                        supported_dependency_modes=("builtin",),
                        supports_tool_execution=True,
                        supports_builtin_package_sets=True,
                        supports_network_policy=True,
                        supports_filesystem_policy=True,
                    ),
                ),
                SandboxBackendHealth(
                    id="microvm-default",
                    kind="community",
                    endpoint="http://microvm.local",
                    enabled=True,
                    status="healthy",
                    capability=SandboxBackendCapability(
                        supported_execution_classes=("microvm",),
                        supported_languages=("python", "javascript"),
                        supported_dependency_modes=("dependency_ref",),
                        supports_tool_execution=False,
                        supports_backend_extensions=True,
                    ),
                ),
            ]
        ),
    )

    response = client.get("/api/system/overview")

    assert response.status_code == 200
    sandbox_readiness = response.json()["sandbox_readiness"]
    assert sandbox_readiness["supported_languages"] == ["javascript", "python"]
    assert sandbox_readiness["supported_profiles"] == ["python-safe"]
    assert sandbox_readiness["supported_dependency_modes"] == ["builtin", "dependency_ref"]
    assert sandbox_readiness["supports_tool_execution"] is True
    assert sandbox_readiness["supports_builtin_package_sets"] is True
    assert sandbox_readiness["supports_backend_extensions"] is True
    assert sandbox_readiness["supports_network_policy"] is True
    assert sandbox_readiness["supports_filesystem_policy"] is True
    assert sandbox_readiness["execution_classes"] == [
        {
            "execution_class": "sandbox",
            "available": True,
            "backend_ids": ["sandbox-default"],
            "supported_languages": ["python"],
            "supported_profiles": ["python-safe"],
            "supported_dependency_modes": ["builtin"],
            "supports_tool_execution": True,
            "supports_builtin_package_sets": True,
            "supports_backend_extensions": False,
            "supports_network_policy": True,
            "supports_filesystem_policy": True,
            "reason": None,
        },
        {
            "execution_class": "microvm",
            "available": True,
            "backend_ids": ["microvm-default"],
            "supported_languages": ["javascript", "python"],
            "supported_profiles": [],
            "supported_dependency_modes": ["dependency_ref"],
            "supports_tool_execution": False,
            "supports_builtin_package_sets": False,
            "supports_backend_extensions": True,
            "supports_network_policy": False,
            "supports_filesystem_policy": False,
            "reason": None,
        },
    ]


def test_list_plugin_adapters_returns_current_adapter_health(client, monkeypatch) -> None:
    monkeypatch.setattr(system_routes, "get_plugin_registry", lambda: PluginRegistry())
    monkeypatch.setattr(
        system_routes,
        "get_compatibility_adapter_health_checker",
        lambda: _StaticHealthChecker(
            [
                CompatibilityAdapterHealth(
                    id="dify-default",
                    ecosystem="compat:dify",
                    endpoint="http://adapter.local",
                    enabled=True,
                    status="down",
                    detail="connect timeout",
                )
            ]
        ),
    )

    response = client.get("/api/system/plugin-adapters")

    assert response.status_code == 200
    assert response.json() == [
        {
            "id": "dify-default",
            "ecosystem": "compat:dify",
            "endpoint": "http://adapter.local",
            "enabled": True,
            "status": "down",
            "detail": "connect timeout",
        }
    ]


def test_list_sandbox_backends_returns_current_backend_health(client, monkeypatch) -> None:
    monkeypatch.setattr(
        system_routes,
        "get_sandbox_backend_registry",
        lambda: SandboxBackendRegistry(),
    )
    monkeypatch.setattr(
        system_routes,
        "get_sandbox_backend_health_checker",
        lambda: _StaticSandboxHealthChecker(
            [
                SandboxBackendHealth(
                    id="sandbox-default",
                    kind="official",
                    endpoint="http://sandbox.local",
                    enabled=True,
                    status="offline",
                    capability=SandboxBackendCapability(
                        supported_execution_classes=("sandbox", "microvm"),
                        supported_languages=("python", "javascript"),
                    ),
                    detail="connect timeout",
                )
            ]
        ),
    )

    response = client.get("/api/system/sandbox-backends")

    assert response.status_code == 200
    assert response.json() == [
        {
            "id": "sandbox-default",
            "kind": "official",
            "endpoint": "http://sandbox.local",
            "enabled": True,
            "status": "offline",
            "detail": "connect timeout",
            "capability": {
                "supported_execution_classes": ["sandbox", "microvm"],
                "supported_languages": ["python", "javascript"],
                "supported_profiles": [],
                "supported_dependency_modes": [],
                "supports_tool_execution": False,
                "supports_builtin_package_sets": False,
                "supports_backend_extensions": False,
                "supports_network_policy": False,
                "supports_filesystem_policy": False,
            },
        }
    ]


def test_runtime_activity_returns_recent_runs_and_events(
    client,
    sqlite_session,
    sample_workflow,
    monkeypatch,
) -> None:
    created_at = datetime.now(UTC)
    sqlite_session.add(
        Run(
            id="run-demo",
            workflow_id=sample_workflow.id,
            workflow_version=sample_workflow.version,
            status="succeeded",
            input_payload={"topic": "diagnostics"},
            output_payload={"answer": "ok"},
            created_at=created_at,
            finished_at=created_at,
        )
    )
    sqlite_session.add(
        RunEvent(
            run_id="run-demo",
            node_run_id=None,
            event_type="run.completed",
            payload={"summary": "done"},
            created_at=created_at,
        )
    )
    sqlite_session.commit()

    monkeypatch.setattr(system_routes, "get_plugin_registry", lambda: PluginRegistry())
    response = client.get("/api/system/runtime-activity")
    created_at_text = created_at.isoformat().replace("+00:00", "")

    assert response.status_code == 200
    assert response.json() == {
        "summary": {
            "recent_run_count": 1,
            "recent_event_count": 1,
            "run_statuses": {"succeeded": 1},
            "event_types": {"run.completed": 1},
        },
        "recent_runs": [
            {
                "id": "run-demo",
                "workflow_id": sample_workflow.id,
                "workflow_name": sample_workflow.name,
                "workflow_version": sample_workflow.version,
                "status": "succeeded",
                "created_at": created_at_text,
                "finished_at": created_at_text,
                "event_count": 1,
                "tool_governance": {
                    "referenced_tool_ids": [],
                    "missing_tool_ids": [],
                    "governed_tool_count": 0,
                    "strong_isolation_tool_count": 0,
                },
            }
        ],
        "recent_events": [
            {
                "id": 1,
                "run_id": "run-demo",
                "node_run_id": None,
                "event_type": "run.completed",
                "payload_keys": ["summary"],
                "payload_preview": "{\"summary\": \"done\"}",
                "payload_size": 19,
                "created_at": created_at_text,
            }
        ],
    }


def test_runtime_activity_surfaces_recent_run_workflow_tool_governance(
    client,
    sqlite_session,
    sample_workflow,
    monkeypatch,
) -> None:
    created_at = datetime.now(UTC)
    sample_workflow.name = "Governance Workflow"
    sample_workflow.definition = {
        "nodes": [
            {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
            {
                "id": "tool",
                "type": "tool",
                "name": "Risk Search",
                "config": {
                    "tool": {
                        "toolId": "native.risk-search",
                        "ecosystem": "native",
                    }
                },
            },
            {
                "id": "agent",
                "type": "llm_agent",
                "name": "Planner",
                "config": {
                    "toolPolicy": {
                        "allowedToolIds": ["native.risk-search", "native.catalog-gap"]
                    }
                },
            },
        ],
        "edges": [
            {"id": "e1", "sourceNodeId": "trigger", "targetNodeId": "tool"},
            {"id": "e2", "sourceNodeId": "tool", "targetNodeId": "agent"},
        ],
    }
    sqlite_session.add(sample_workflow)
    sqlite_session.add(
        Run(
            id="run-governance",
            workflow_id=sample_workflow.id,
            workflow_version=sample_workflow.version,
            status="waiting_callback",
            input_payload={"topic": "catalog gap"},
            output_payload=None,
            created_at=created_at,
            finished_at=None,
        )
    )
    sqlite_session.commit()

    monkeypatch.setattr(system_routes, "get_plugin_registry", lambda: PluginRegistry())
    monkeypatch.setattr(
        system_routes,
        "load_workflow_view_tool_index",
        lambda db: {
            "native.risk-search": PluginToolItem(
                id="native.risk-search",
                name="Risk Search",
                ecosystem="native",
                description="Governed native tool.",
                source="native",
                callable=True,
                supported_execution_classes=["inline", "sandbox"],
                default_execution_class="sandbox",
                sensitivity_level="L2",
            )
        },
    )

    response = client.get("/api/system/runtime-activity")

    assert response.status_code == 200
    recent_run = response.json()["recent_runs"][0]
    assert recent_run["workflow_name"] == "Governance Workflow"
    assert recent_run["tool_governance"] == {
        "referenced_tool_ids": ["native.risk-search", "native.catalog-gap"],
        "missing_tool_ids": ["native.catalog-gap"],
        "governed_tool_count": 1,
        "strong_isolation_tool_count": 1,
    }

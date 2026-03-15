"""Tests for credential resolution integrated into the runtime execution chain."""

from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import patch

import pytest
from cryptography.fernet import Fernet
from sqlalchemy.orm import Session

from app.models.workflow import Workflow, WorkflowVersion
from app.services.compiled_blueprints import CompiledBlueprintService
from app.services.credential_store import CredentialStore
from app.services.plugin_runtime import (
    PluginCallProxy,
    PluginCallRequest,
    PluginCallResponse,
    PluginRegistry,
    PluginToolDefinition,
)
from app.services.run_resume_scheduler import RunResumeScheduler
from app.services.runtime import RuntimeService
from app.services.runtime_types import WorkflowExecutionError
from app.services.sensitive_access_control import SensitiveAccessControlService

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_TEST_KEY = Fernet.generate_key().decode("utf-8")


class _FakeSettings:
    credential_encryption_key = _TEST_KEY
    durable_agent_runtime_enabled = True
    plugin_default_timeout_ms = 30_000


def _patch_settings():
    return patch(
        "app.services.credential_encryption.get_settings",
        return_value=_FakeSettings(),
    )


def _create_workflow(
    db: Session,
    *,
    workflow_id: str,
    definition: dict,
) -> Workflow:
    blueprint_service = CompiledBlueprintService()
    workflow = Workflow(
        id=workflow_id,
        name=f"Test {workflow_id}",
        version="0.1.0",
        status="draft",
        definition=definition,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    workflow_version = WorkflowVersion(
        id=f"{workflow_id}-v1",
        workflow_id=workflow.id,
        version=workflow.version,
        definition=definition,
        created_at=datetime.now(UTC),
    )
    db.add(workflow)
    db.add(workflow_version)
    blueprint_service.ensure_for_workflow_version(db, workflow_version)
    db.commit()
    db.refresh(workflow)
    return workflow


def _make_tool_proxy(captured_credentials: list[dict]) -> PluginCallProxy:
    """Create a PluginCallProxy whose invoke captures credentials for assertion."""

    class _CapturingProxy(PluginCallProxy):
        def invoke(self, request: PluginCallRequest) -> PluginCallResponse:
            captured_credentials.append(dict(request.credentials or {}))
            return PluginCallResponse(
                status="success",
                output={
                    "status": "success",
                    "content_type": "json",
                    "structured": {"result": "ok"},
                    "summary": "ok",
                },
                duration_ms=1,
            )

    registry = PluginRegistry()
    registry.register_tool(
        PluginToolDefinition(id="test-tool", name="test-tool", ecosystem="native")
    )
    return _CapturingProxy(registry)


def _make_waiting_then_success_tool_proxy() -> PluginCallProxy:
    call_counter = {"count": 0}

    class _WaitingProxy(PluginCallProxy):
        def invoke(self, request: PluginCallRequest) -> PluginCallResponse:
            call_counter["count"] += 1
            if call_counter["count"] == 1:
                return PluginCallResponse(
                    status="success",
                    output={
                        "status": "waiting",
                        "content_type": "json",
                        "structured": {"ticket": "tool-node-1"},
                        "summary": "awaiting callback",
                        "meta": {
                            "tool_name": "test-tool",
                            "waiting_reason": "tool node callback pending",
                            "waiting_status": "waiting_callback",
                            "resume_after_seconds": 2,
                        },
                    },
                    duration_ms=1,
                )
            return PluginCallResponse(
                status="success",
                output={
                    "status": "success",
                    "content_type": "json",
                    "structured": {"result": "done"},
                    "summary": "done",
                },
                duration_ms=1,
            )

    registry = PluginRegistry()
    registry.register_tool(
        PluginToolDefinition(id="test-tool", name="test-tool", ecosystem="native")
    )
    return _WaitingProxy(registry)


# ---------------------------------------------------------------------------
# Tests: tool node credential resolution
# ---------------------------------------------------------------------------


def test_tool_node_resolves_credential_refs(
    sqlite_session: Session,
) -> None:
    """A tool node with credential:// refs should decrypt and pass resolved creds."""
    with _patch_settings():
        store = CredentialStore()
        cred = store.create(
            sqlite_session,
            name="Test API Key",
            credential_type="api_key",
            data={"api_key": "sk-secret-123", "api_secret": "sec-456"},
        )
        sqlite_session.flush()
        cred_id = cred.id

    captured: list[dict] = []
    proxy = _make_tool_proxy(captured)

    workflow = _create_workflow(
        sqlite_session,
        workflow_id="wf-cred-tool",
        definition={
            "nodes": [
                {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
                {
                    "id": "tool_node",
                    "type": "tool",
                    "name": "Tool With Creds",
                    "config": {
                        "tool": {
                            "toolId": "test-tool",
                            "credentials": {
                                "auth": f"credential://{cred_id}",
                            },
                        },
                    },
                },
                {"id": "output", "type": "output", "name": "Output", "config": {}},
            ],
            "edges": [
                {"id": "e1", "sourceNodeId": "trigger", "targetNodeId": "tool_node"},
                {"id": "e2", "sourceNodeId": "tool_node", "targetNodeId": "output"},
            ],
        },
    )

    with _patch_settings():
        service = RuntimeService(plugin_call_proxy=proxy)
        artifacts = service.execute_workflow(
            sqlite_session,
            workflow,
            {"query": "test"},
        )

    assert artifacts.run.status == "succeeded"
    assert len(captured) == 1
    assert captured[0]["api_key"] == "sk-secret-123"
    assert captured[0]["api_secret"] == "sec-456"


def test_tool_node_with_plain_credentials_passes_through(
    sqlite_session: Session,
) -> None:
    """Tool nodes with plain (non-credential://) credentials pass them through."""
    captured: list[dict] = []
    proxy = _make_tool_proxy(captured)

    workflow = _create_workflow(
        sqlite_session,
        workflow_id="wf-plain-cred",
        definition={
            "nodes": [
                {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
                {
                    "id": "tool_node",
                    "type": "tool",
                    "name": "Tool Plain Creds",
                    "config": {
                        "tool": {
                            "toolId": "test-tool",
                            "credentials": {
                                "api_key": "plain-key-value",
                            },
                        },
                    },
                },
                {"id": "output", "type": "output", "name": "Output", "config": {}},
            ],
            "edges": [
                {"id": "e1", "sourceNodeId": "trigger", "targetNodeId": "tool_node"},
                {"id": "e2", "sourceNodeId": "tool_node", "targetNodeId": "output"},
            ],
        },
    )

    service = RuntimeService(plugin_call_proxy=proxy)
    artifacts = service.execute_workflow(
        sqlite_session,
        workflow,
        {"query": "test"},
    )

    assert artifacts.run.status == "succeeded"
    assert len(captured) == 1
    assert captured[0]["api_key"] == "plain-key-value"


def test_tool_node_with_invalid_credential_ref_fails(
    sqlite_session: Session,
) -> None:
    """A tool node referencing a nonexistent credential should fail."""
    captured: list[dict] = []
    proxy = _make_tool_proxy(captured)

    workflow = _create_workflow(
        sqlite_session,
        workflow_id="wf-bad-cred",
        definition={
            "nodes": [
                {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
                {
                    "id": "tool_node",
                    "type": "tool",
                    "name": "Tool Bad Cred",
                    "config": {
                        "tool": {
                            "toolId": "test-tool",
                            "credentials": {
                                "auth": "credential://nonexistent-id",
                            },
                        },
                    },
                },
                {"id": "output", "type": "output", "name": "Output", "config": {}},
            ],
            "edges": [
                {"id": "e1", "sourceNodeId": "trigger", "targetNodeId": "tool_node"},
                {"id": "e2", "sourceNodeId": "tool_node", "targetNodeId": "output"},
            ],
        },
    )

    with _patch_settings():
        service = RuntimeService(plugin_call_proxy=proxy)
        with pytest.raises(WorkflowExecutionError, match="credential"):
            service.execute_workflow(
                sqlite_session,
                workflow,
                {"query": "test"},
            )


def test_tool_node_with_revoked_credential_fails(
    sqlite_session: Session,
) -> None:
    """Revoked credentials should not be resolvable."""
    with _patch_settings():
        store = CredentialStore()
        cred = store.create(
            sqlite_session,
            name="Revoked Key",
            credential_type="api_key",
            data={"api_key": "sk-revoked"},
        )
        store.revoke(sqlite_session, credential_id=cred.id)
        sqlite_session.flush()
        cred_id = cred.id

    captured: list[dict] = []
    proxy = _make_tool_proxy(captured)

    workflow = _create_workflow(
        sqlite_session,
        workflow_id="wf-revoked-cred",
        definition={
            "nodes": [
                {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
                {
                    "id": "tool_node",
                    "type": "tool",
                    "name": "Tool Revoked",
                    "config": {
                        "tool": {
                            "toolId": "test-tool",
                            "credentials": {
                                "auth": f"credential://{cred_id}",
                            },
                        },
                    },
                },
                {"id": "output", "type": "output", "name": "Output", "config": {}},
            ],
            "edges": [
                {"id": "e1", "sourceNodeId": "trigger", "targetNodeId": "tool_node"},
                {"id": "e2", "sourceNodeId": "tool_node", "targetNodeId": "output"},
            ],
        },
    )

    with _patch_settings():
        service = RuntimeService(plugin_call_proxy=proxy)
        with pytest.raises(WorkflowExecutionError, match="revoked"):
            service.execute_workflow(
                sqlite_session,
                workflow,
                {"query": "test"},
            )


def test_tool_node_with_empty_credential_ref_fails(
    sqlite_session: Session,
) -> None:
    """credential:// with empty ID should produce a clear error."""
    captured: list[dict] = []
    proxy = _make_tool_proxy(captured)

    workflow = _create_workflow(
        sqlite_session,
        workflow_id="wf-empty-cred",
        definition={
            "nodes": [
                {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
                {
                    "id": "tool_node",
                    "type": "tool",
                    "name": "Tool Empty Cred",
                    "config": {
                        "tool": {
                            "toolId": "test-tool",
                            "credentials": {
                                "auth": "credential://",
                            },
                        },
                    },
                },
                {"id": "output", "type": "output", "name": "Output", "config": {}},
            ],
            "edges": [
                {"id": "e1", "sourceNodeId": "trigger", "targetNodeId": "tool_node"},
                {"id": "e2", "sourceNodeId": "tool_node", "targetNodeId": "output"},
            ],
        },
    )

    with _patch_settings():
        service = RuntimeService(plugin_call_proxy=proxy)
        with pytest.raises(WorkflowExecutionError, match="empty"):
            service.execute_workflow(
                sqlite_session,
                workflow,
                {"query": "test"},
            )


# ---------------------------------------------------------------------------
# Tests: llm_agent node credential resolution
# ---------------------------------------------------------------------------


def test_llm_agent_node_resolves_model_credential(
    sqlite_session: Session,
) -> None:
    """An llm_agent node with a credential:// apiKey should resolve it."""
    with _patch_settings():
        store = CredentialStore()
        cred = store.create(
            sqlite_session,
            name="LLM API Key",
            credential_type="api_key",
            data={"apiKey": "sk-llm-secret"},
        )
        sqlite_session.flush()
        cred_id = cred.id

    workflow = _create_workflow(
        sqlite_session,
        workflow_id="wf-cred-llm",
        definition={
            "nodes": [
                {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
                {
                    "id": "agent",
                    "type": "llm_agent",
                    "name": "Agent",
                    "config": {
                        "model": {
                            "provider": "openai",
                            "modelId": "gpt-4",
                            "apiKey": f"credential://{cred_id}",
                        },
                        "prompt": "Summarize the input.",
                        "mockPlan": {
                            "toolCalls": [],
                            "needAssistant": False,
                            "finalizeFrom": "working_context",
                        },
                        "mockFinalOutput": {"result": "summary"},
                    },
                },
                {"id": "output", "type": "output", "name": "Output", "config": {}},
            ],
            "edges": [
                {"id": "e1", "sourceNodeId": "trigger", "targetNodeId": "agent"},
                {"id": "e2", "sourceNodeId": "agent", "targetNodeId": "output"},
            ],
        },
    )

    with _patch_settings():
        service = RuntimeService()
        artifacts = service.execute_workflow(
            sqlite_session,
            workflow,
            {"topic": "test"},
        )

    assert artifacts.run.status == "succeeded"
    agent_run = next(nr for nr in artifacts.node_runs if nr.node_id == "agent")
    assert agent_run.status == "succeeded"


def test_llm_agent_with_config_credentials_dict(
    sqlite_session: Session,
) -> None:
    """An llm_agent with config.credentials dict should resolve refs."""
    with _patch_settings():
        store = CredentialStore()
        cred = store.create(
            sqlite_session,
            name="Multi Key",
            credential_type="composite",
            data={"api_key": "key-a", "api_secret": "secret-b"},
        )
        sqlite_session.flush()
        cred_id = cred.id

    workflow = _create_workflow(
        sqlite_session,
        workflow_id="wf-cred-dict",
        definition={
            "nodes": [
                {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
                {
                    "id": "agent",
                    "type": "llm_agent",
                    "name": "Agent",
                    "config": {
                        "credentials": {
                            "auth": f"credential://{cred_id}",
                        },
                        "model": {"provider": "openai", "modelId": "gpt-4"},
                        "prompt": "Go.",
                        "mockPlan": {
                            "toolCalls": [],
                            "needAssistant": False,
                            "finalizeFrom": "working_context",
                        },
                        "mockFinalOutput": {"result": "done"},
                    },
                },
                {"id": "output", "type": "output", "name": "Output", "config": {}},
            ],
            "edges": [
                {"id": "e1", "sourceNodeId": "trigger", "targetNodeId": "agent"},
                {"id": "e2", "sourceNodeId": "agent", "targetNodeId": "output"},
            ],
        },
    )

    with _patch_settings():
        service = RuntimeService()
        artifacts = service.execute_workflow(
            sqlite_session,
            workflow,
            {"query": "test"},
        )

    assert artifacts.run.status == "succeeded"


def test_tool_node_with_mixed_credentials(
    sqlite_session: Session,
) -> None:
    """A mix of plain and credential:// refs should resolve the refs and pass plain through."""
    with _patch_settings():
        store = CredentialStore()
        cred = store.create(
            sqlite_session,
            name="Mixed Key",
            credential_type="api_key",
            data={"secret_token": "tok-abc"},
        )
        sqlite_session.flush()
        cred_id = cred.id

    captured: list[dict] = []
    proxy = _make_tool_proxy(captured)

    workflow = _create_workflow(
        sqlite_session,
        workflow_id="wf-mixed-cred",
        definition={
            "nodes": [
                {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
                {
                    "id": "tool_node",
                    "type": "tool",
                    "name": "Tool Mixed Creds",
                    "config": {
                        "tool": {
                            "toolId": "test-tool",
                            "credentials": {
                                "ref_key": f"credential://{cred_id}",
                                "plain_key": "plain-value",
                            },
                        },
                    },
                },
                {"id": "output", "type": "output", "name": "Output", "config": {}},
            ],
            "edges": [
                {"id": "e1", "sourceNodeId": "trigger", "targetNodeId": "tool_node"},
                {"id": "e2", "sourceNodeId": "tool_node", "targetNodeId": "output"},
            ],
        },
    )

    with _patch_settings():
        service = RuntimeService(plugin_call_proxy=proxy)
        artifacts = service.execute_workflow(
            sqlite_session,
            workflow,
            {"query": "test"},
        )

    assert artifacts.run.status == "succeeded"
    assert len(captured) == 1
    assert captured[0]["secret_token"] == "tok-abc"
    assert captured[0]["plain_key"] == "plain-value"


def test_tool_node_sensitive_credential_waits_for_approval_and_resumes(
    sqlite_session: Session,
) -> None:
    scheduled_resumes = []
    with _patch_settings():
        sensitive_access = SensitiveAccessControlService(
            resume_scheduler=RunResumeScheduler(dispatcher=scheduled_resumes.append)
        )
        store = CredentialStore(sensitive_access_service=sensitive_access)
        cred = store.create(
            sqlite_session,
            name="Sensitive Tool Key",
            credential_type="api_key",
            data={"api_key": "sk-sensitive"},
        )
        sensitive_access.create_resource(
            sqlite_session,
            label="Production Tool Credential",
            sensitivity_level="L3",
            source="credential",
            metadata={"credential_id": cred.id},
        )
        sqlite_session.commit()
        cred_id = cred.id

    captured: list[dict] = []
    proxy = _make_tool_proxy(captured)
    workflow = _create_workflow(
        sqlite_session,
        workflow_id="wf-sensitive-cred-tool",
        definition={
            "nodes": [
                {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
                {
                    "id": "tool_node",
                    "type": "tool",
                    "name": "Sensitive Tool",
                    "config": {
                        "tool": {
                            "toolId": "test-tool",
                            "credentials": {
                                "auth": f"credential://{cred_id}",
                            },
                        },
                    },
                },
                {"id": "output", "type": "output", "name": "Output", "config": {}},
            ],
            "edges": [
                {"id": "e1", "sourceNodeId": "trigger", "targetNodeId": "tool_node"},
                {"id": "e2", "sourceNodeId": "tool_node", "targetNodeId": "output"},
            ],
        },
    )

    with _patch_settings():
        service = RuntimeService(plugin_call_proxy=proxy, credential_store=store)
        first_pass = service.execute_workflow(sqlite_session, workflow, {"query": "test"})

    waiting_run = next(
        node_run for node_run in first_pass.node_runs if node_run.node_id == "tool_node"
    )
    approval_tickets = sensitive_access.list_approval_tickets(
        sqlite_session,
        run_id=first_pass.run.id,
    )
    assert first_pass.run.status == "waiting"
    assert waiting_run.status == "waiting_tool"
    assert waiting_run.phase == "waiting_tool"
    assert captured == []
    assert len(approval_tickets) == 1
    assert approval_tickets[0].status == "pending"
    assert len(sensitive_access.list_access_requests(sqlite_session, run_id=first_pass.run.id)) == 1

    sensitive_access.decide_ticket(
        sqlite_session,
        ticket_id=approval_tickets[0].id,
        status="approved",
        approved_by="ops-reviewer",
    )
    sqlite_session.commit()

    assert len(scheduled_resumes) == 1
    assert scheduled_resumes[0].run_id == first_pass.run.id
    assert scheduled_resumes[0].source == "sensitive_access_decision"

    with _patch_settings():
        resumed = service.resume_run(sqlite_session, first_pass.run.id, source="test")

    resumed_tool_run = next(
        node_run for node_run in resumed.node_runs if node_run.node_id == "tool_node"
    )
    assert resumed.run.status == "succeeded"
    assert resumed_tool_run.status == "succeeded"
    assert len(captured) == 1
    assert captured[0]["api_key"] == "sk-sensitive"
    assert len(sensitive_access.list_access_requests(sqlite_session, run_id=first_pass.run.id)) == 1


def test_tool_node_waiting_result_suspends_and_can_resume(
    sqlite_session: Session,
) -> None:
    workflow = _create_workflow(
        sqlite_session,
        workflow_id="wf-tool-node-waiting",
        definition={
            "nodes": [
                {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
                {
                    "id": "tool_node",
                    "type": "tool",
                    "name": "Waiting Tool",
                    "config": {
                        "tool": {
                            "toolId": "test-tool",
                        },
                    },
                },
                {"id": "output", "type": "output", "name": "Output", "config": {}},
            ],
            "edges": [
                {"id": "e1", "sourceNodeId": "trigger", "targetNodeId": "tool_node"},
                {"id": "e2", "sourceNodeId": "tool_node", "targetNodeId": "output"},
            ],
        },
    )

    scheduled_resumes = []
    runtime = RuntimeService(
        plugin_call_proxy=_make_waiting_then_success_tool_proxy(),
        resume_scheduler=RunResumeScheduler(dispatcher=scheduled_resumes.append),
    )

    first_pass = runtime.execute_workflow(sqlite_session, workflow, {"query": "waiting"})

    waiting_run = next(
        node_run for node_run in first_pass.node_runs if node_run.node_id == "tool_node"
    )
    assert first_pass.run.status == "waiting"
    assert waiting_run.status == "waiting_callback"
    assert waiting_run.phase == "waiting_callback"
    assert waiting_run.checkpoint_payload["scheduled_resume"]["delay_seconds"] == 2.0
    assert len(scheduled_resumes) == 1
    assert scheduled_resumes[0].delay_seconds == 2.0
    assert "tool.waiting" in [event.event_type for event in first_pass.events]

    resumed = runtime.resume_run(sqlite_session, first_pass.run.id, source="test")

    resumed_tool_run = next(
        node_run for node_run in resumed.node_runs if node_run.node_id == "tool_node"
    )
    assert resumed.run.status == "succeeded"
    assert resumed_tool_run.status == "succeeded"
    assert resumed.run.output_payload["tool_node"]["result"] == "done"

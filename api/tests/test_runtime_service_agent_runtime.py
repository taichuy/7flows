import json
from datetime import UTC, datetime, timedelta

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.run import NodeRun, Run, RunCallbackTicket, RunEvent
from app.models.workflow import Workflow, WorkflowVersion
from app.services.plugin_runtime import (
    CompatibilityAdapterRegistration,
    PluginCallProxy,
    PluginRegistry,
    PluginToolDefinition,
)
from app.services.run_resume_scheduler import RunResumeScheduler
from app.services.runtime import RuntimeService
from app.services.runtime_types import WorkflowExecutionError


def _compat_demo_search_constrained_ir() -> dict:
    return {
        "ir_version": "2026-03-10",
        "kind": "tool",
        "ecosystem": "compat:dify",
        "tool_id": "compat:dify:plugin:demo/search",
        "name": "Compat Search",
        "description": "Search via compat adapter",
        "input_schema": {
            "type": "object",
            "properties": {"query": {"type": "string"}},
            "required": ["query"],
            "additional_properties": False,
        },
        "output_schema": {"type": "object"},
        "source": "plugin",
        "input_contract": [
            {
                "name": "query",
                "required": True,
                "value_source": "llm",
                "json_schema": {"type": "string"},
            }
        ],
        "constraints": {
            "additional_properties": False,
            "credential_fields": [],
            "file_fields": [],
            "llm_fillable_fields": ["query"],
            "user_config_fields": [],
        },
        "plugin_meta": {"origin": "dify"},
    }


def test_llm_agent_without_assistant_keeps_legacy_like_output(sqlite_session: Session) -> None:
    workflow = Workflow(
        id="wf-agent-legacy",
        name="Agent Legacy Workflow",
        version="0.1.0",
        status="draft",
        definition={
            "nodes": [
                {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
                {
                    "id": "agent",
                    "type": "llm_agent",
                    "name": "Agent",
                    "config": {
                        "prompt": "Say hello",
                        "assistant": {"enabled": False},
                        "mock_output": {"answer": "legacy-compatible"},
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
    sqlite_session.add(workflow)
    sqlite_session.commit()

    artifacts = RuntimeService().execute_workflow(sqlite_session, workflow, {"topic": "agent"})

    agent_run = next(node_run for node_run in artifacts.node_runs if node_run.node_id == "agent")
    assert artifacts.run.status == "succeeded"
    assert agent_run.output_payload == {"answer": "legacy-compatible"}
    assert agent_run.evidence_context is None
    assert agent_run.phase == "emit_output"
    assert not artifacts.tool_calls
    assert [record.role for record in artifacts.ai_calls] == ["main_plan", "main_finalize"]


def test_llm_agent_with_assistant_distills_tool_results_into_evidence(
    sqlite_session: Session,
) -> None:
    workflow = Workflow(
        id="wf-agent-assistant",
        name="Agent Assistant Workflow",
        version="0.1.0",
        status="draft",
        definition={
            "nodes": [
                {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
                {
                    "id": "agent",
                    "type": "llm_agent",
                    "name": "Agent",
                    "config": {
                        "assistant": {"enabled": True, "trigger": "always"},
                        "toolPolicy": {"allowedToolIds": ["native.search"]},
                        "mockPlan": {
                            "toolCalls": [
                                {
                                    "toolId": "native.search",
                                    "inputs": {"query": "sevenflows"},
                                }
                            ],
                            "needAssistant": True,
                        },
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
    sqlite_session.add(workflow)
    sqlite_session.commit()

    registry = PluginRegistry()
    registry.register_tool(
        PluginToolDefinition(id="native.search", name="Native Search"),
        invoker=lambda request: {
            "status": "success",
            "content_type": "json",
            "summary": "search hits ready",
            "structured": {"documents": ["alpha"], "query": request.inputs["query"]},
            "meta": {"tool_name": "Native Search"},
        },
    )

    artifacts = RuntimeService(plugin_call_proxy=PluginCallProxy(registry)).execute_workflow(
        sqlite_session,
        workflow,
        {"topic": "agent"},
    )

    agent_run = next(node_run for node_run in artifacts.node_runs if node_run.node_id == "agent")
    assert artifacts.run.status == "succeeded"
    assert artifacts.run.output_payload["agent"]["decision_basis"] == "evidence"
    assert agent_run.evidence_context["summary"] == "search hits ready"
    assert any(artifact.artifact_kind == "tool_result" for artifact in artifacts.artifacts)
    assert any(artifact.artifact_kind == "evidence_pack" for artifact in artifacts.artifacts)
    assert len(artifacts.tool_calls) == 1
    assert [record.role for record in artifacts.ai_calls] == [
        "main_plan",
        "assistant_distill",
        "main_finalize",
    ]
    assert "assistant.completed" in [event.event_type for event in artifacts.events]


def test_llm_agent_tool_policy_execution_fail_closes_explicit_native_isolation(
    sqlite_session: Session,
) -> None:
    workflow = Workflow(
        id="wf-agent-tool-execution",
        name="Agent Tool Execution Workflow",
        version="0.1.0",
        status="draft",
        definition={
            "nodes": [
                {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
                {
                    "id": "agent",
                    "type": "llm_agent",
                    "name": "Agent",
                    "config": {
                        "assistant": {"enabled": False},
                        "toolPolicy": {
                            "allowedToolIds": ["native.search"],
                            "execution": {
                                "class": "sandbox",
                                "profile": "risk-reviewed",
                                "timeoutMs": 15000,
                            },
                        },
                        "mockPlan": {
                            "toolCalls": [
                                {
                                    "toolId": "native.search",
                                    "inputs": {"query": "tool-execution"},
                                }
                            ]
                        },
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
    sqlite_session.add(workflow)
    sqlite_session.commit()

    registry = PluginRegistry()
    registry.register_tool(
        PluginToolDefinition(id="native.search", name="Native Search"),
        invoker=lambda request: {
            "status": "success",
            "content_type": "json",
            "summary": "tool execution traced",
            "structured": {"documents": ["alpha"], "query": request.inputs["query"]},
            "meta": {"tool_name": "Native Search"},
        },
    )

    with pytest.raises(
        WorkflowExecutionError,
        match="does not support requested execution class 'sandbox'",
    ):
        RuntimeService(plugin_call_proxy=PluginCallProxy(registry)).execute_workflow(
            sqlite_session,
            workflow,
            {"topic": "agent"},
        )

    run = sqlite_session.scalars(
        select(Run).where(Run.workflow_id == workflow.id).order_by(Run.created_at.desc())
    ).first()
    assert run is not None
    assert run.status == "failed"

    agent_run = sqlite_session.scalars(
        select(NodeRun)
        .where(NodeRun.run_id == run.id, NodeRun.node_id == "agent")
        .order_by(NodeRun.started_at.desc())
    ).first()
    assert agent_run is not None

    events = sqlite_session.scalars(
        select(RunEvent)
        .where(RunEvent.run_id == run.id, RunEvent.node_run_id == agent_run.id)
        .order_by(RunEvent.id.asc())
    ).all()

    dispatched_event = next(
        event for event in events if event.event_type == "tool.execution.dispatched"
    )
    assert dispatched_event.payload == {
        "node_id": "agent",
        "tool_id": "native.search",
        "tool_name": "native.search",
        "requested_execution_class": "sandbox",
        "effective_execution_class": "inline",
        "execution_source": "tool_policy",
        "requested_execution_profile": "risk-reviewed",
        "requested_execution_timeout_ms": 15000,
        "requested_network_policy": None,
        "requested_filesystem_policy": None,
        "executor_ref": "tool:native-inline",
    }

    blocked_event = next(
        event for event in events if event.event_type == "tool.execution.blocked"
    )
    assert blocked_event.payload == {
        "node_id": "agent",
        "tool_id": "native.search",
        "tool_name": "native.search",
        "requested_execution_class": "sandbox",
        "effective_execution_class": "inline",
        "execution_source": "tool_policy",
        "requested_execution_profile": "risk-reviewed",
        "requested_execution_timeout_ms": 15000,
        "requested_network_policy": None,
        "requested_filesystem_policy": None,
        "executor_ref": "tool:native-inline",
        "reason": (
            "Native tool 'native.search' does not support requested execution class "
            "'sandbox'. Supported classes: inline."
        ),
    }


def test_llm_agent_tool_call_execution_override_fail_closes_native_isolation(
    sqlite_session: Session,
) -> None:
    workflow = Workflow(
        id="wf-agent-tool-execution-override",
        name="Agent Tool Execution Override Workflow",
        version="0.1.0",
        status="draft",
        definition={
            "nodes": [
                {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
                {
                    "id": "agent",
                    "type": "llm_agent",
                    "name": "Agent",
                    "config": {
                        "assistant": {"enabled": False},
                        "toolPolicy": {
                            "allowedToolIds": ["native.search"],
                            "execution": {
                                "class": "sandbox",
                                "profile": "risk-reviewed",
                                "timeoutMs": 15000,
                            },
                        },
                        "mockPlan": {
                            "toolCalls": [
                                {
                                    "toolId": "native.search",
                                    "inputs": {"query": "tool-execution-override"},
                                    "execution": {
                                        "class": "microvm",
                                        "profile": "per-call-override",
                                        "timeoutMs": 5000,
                                        "networkPolicy": "isolated",
                                        "filesystemPolicy": "ephemeral",
                                    },
                                }
                            ]
                        },
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
    sqlite_session.add(workflow)
    sqlite_session.commit()

    registry = PluginRegistry()
    registry.register_tool(
        PluginToolDefinition(id="native.search", name="Native Search"),
        invoker=lambda request: {
            "status": "success",
            "content_type": "json",
            "summary": "tool execution override traced",
            "structured": {"documents": ["alpha"], "query": request.inputs["query"]},
            "meta": {"tool_name": "Native Search"},
        },
    )

    with pytest.raises(
        WorkflowExecutionError,
        match="does not support requested execution class 'microvm'",
    ):
        RuntimeService(plugin_call_proxy=PluginCallProxy(registry)).execute_workflow(
            sqlite_session,
            workflow,
            {"topic": "agent"},
        )

    run = sqlite_session.scalars(
        select(Run).where(Run.workflow_id == workflow.id).order_by(Run.created_at.desc())
    ).first()
    assert run is not None
    assert run.status == "failed"

    agent_run = sqlite_session.scalars(
        select(NodeRun)
        .where(NodeRun.run_id == run.id, NodeRun.node_id == "agent")
        .order_by(NodeRun.started_at.desc())
    ).first()
    assert agent_run is not None

    events = sqlite_session.scalars(
        select(RunEvent)
        .where(RunEvent.run_id == run.id, RunEvent.node_run_id == agent_run.id)
        .order_by(RunEvent.id.asc())
    ).all()

    dispatched_event = next(
        event for event in events if event.event_type == "tool.execution.dispatched"
    )
    assert dispatched_event.payload == {
        "node_id": "agent",
        "tool_id": "native.search",
        "tool_name": "native.search",
        "requested_execution_class": "microvm",
        "effective_execution_class": "inline",
        "execution_source": "tool_call",
        "requested_execution_profile": "per-call-override",
        "requested_execution_timeout_ms": 5000,
        "requested_network_policy": "isolated",
        "requested_filesystem_policy": "ephemeral",
        "executor_ref": "tool:native-inline",
    }

    blocked_event = next(
        event for event in events if event.event_type == "tool.execution.blocked"
    )
    assert blocked_event.payload == {
        "node_id": "agent",
        "tool_id": "native.search",
        "tool_name": "native.search",
        "requested_execution_class": "microvm",
        "effective_execution_class": "inline",
        "execution_source": "tool_call",
        "requested_execution_profile": "per-call-override",
        "requested_execution_timeout_ms": 5000,
        "requested_network_policy": "isolated",
        "requested_filesystem_policy": "ephemeral",
        "executor_ref": "tool:native-inline",
        "reason": (
            "Native tool 'native.search' does not support requested execution class "
            "'microvm'. Supported classes: inline."
        ),
    }


def test_llm_agent_tool_call_execution_override_fail_closes_for_unsupported_compat_execution(
    sqlite_session: Session,
) -> None:
    workflow = Workflow(
        id="wf-agent-tool-execution-compat",
        name="Agent Compat Tool Execution Workflow",
        version="0.1.0",
        status="draft",
        definition={
            "nodes": [
                {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
                {
                    "id": "agent",
                    "type": "llm_agent",
                    "name": "Agent",
                    "config": {
                        "assistant": {"enabled": False},
                        "toolPolicy": {
                            "allowedToolIds": ["compat:dify:plugin:demo/search"],
                            "execution": {
                                "class": "sandbox",
                                "profile": "workspace-default",
                                "timeoutMs": 15000,
                            },
                        },
                        "mockPlan": {
                            "toolCalls": [
                                {
                                    "toolId": "compat:dify:plugin:demo/search",
                                    "ecosystem": "compat:dify",
                                    "adapterId": "dify-default",
                                    "inputs": {"query": "tool-execution-compat"},
                                    "execution": {
                                        "class": "microvm",
                                        "profile": "per-call-compat",
                                        "timeoutMs": 4000,
                                        "networkPolicy": "isolated",
                                        "filesystemPolicy": "ephemeral",
                                    },
                                }
                            ]
                        },
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
    sqlite_session.add(workflow)
    sqlite_session.commit()

    registry = PluginRegistry()
    registry.register_tool(
        PluginToolDefinition(
            id="compat:dify:plugin:demo/search",
            name="Compat Search",
            ecosystem="compat:dify",
            source="plugin",
            constrained_ir=_compat_demo_search_constrained_ir(),
        )
    )
    registry.register_adapter(
        CompatibilityAdapterRegistration(
            id="dify-default",
            ecosystem="compat:dify",
            endpoint="http://adapter.local/dify",
        )
    )

    captured_payloads: list[dict] = []

    def handler(request: httpx.Request) -> httpx.Response:
        payload = json.loads(request.content.decode())
        captured_payloads.append(payload)
        return httpx.Response(
            200,
            json={
                "status": "success",
                "output": {
                    "status": "success",
                    "content_type": "json",
                    "summary": "compat tool execution override forwarded",
                    "structured": {"documents": ["alpha"]},
                    "meta": {"tool_name": "Compat Search"},
                },
                "durationMs": 11,
            },
        )

    runtime = RuntimeService(
        plugin_call_proxy=PluginCallProxy(
            registry,
            client_factory=lambda timeout_ms: httpx.Client(
                transport=httpx.MockTransport(handler),
                timeout=timeout_ms / 1000,
            ),
        )
    )

    with pytest.raises(
        WorkflowExecutionError,
        match="does not support requested execution class 'microvm'",
    ):
        runtime.execute_workflow(sqlite_session, workflow, {"topic": "agent"})

    assert captured_payloads == []

    run = sqlite_session.scalars(
        select(Run).where(Run.workflow_id == workflow.id).order_by(Run.created_at.desc())
    ).first()
    assert run is not None

    agent_run = sqlite_session.scalars(
        select(NodeRun)
        .where(NodeRun.run_id == run.id, NodeRun.node_id == "agent")
        .order_by(NodeRun.started_at.desc())
    ).first()
    assert agent_run is not None

    events = sqlite_session.scalars(
        select(RunEvent)
        .where(RunEvent.run_id == run.id, RunEvent.node_run_id == agent_run.id)
        .order_by(RunEvent.id.asc())
    ).all()

    dispatched_event = next(
        event for event in events if event.event_type == "tool.execution.dispatched"
    )
    assert dispatched_event.payload == {
        "node_id": "agent",
        "tool_id": "compat:dify:plugin:demo/search",
        "tool_name": "compat:dify:plugin:demo/search",
        "requested_execution_class": "microvm",
        "effective_execution_class": "subprocess",
        "execution_source": "tool_call",
        "requested_execution_profile": "per-call-compat",
        "requested_execution_timeout_ms": 4000,
        "requested_network_policy": "isolated",
        "requested_filesystem_policy": "ephemeral",
        "executor_ref": "tool:compat-adapter:dify-default",
    }

    blocked_event = next(
        event for event in events if event.event_type == "tool.execution.blocked"
    )
    assert blocked_event.payload == {
        "node_id": "agent",
        "tool_id": "compat:dify:plugin:demo/search",
        "tool_name": "compat:dify:plugin:demo/search",
        "requested_execution_class": "microvm",
        "effective_execution_class": "subprocess",
        "execution_source": "tool_call",
        "requested_execution_profile": "per-call-compat",
        "requested_execution_timeout_ms": 4000,
        "requested_network_policy": "isolated",
        "requested_filesystem_policy": "ephemeral",
        "executor_ref": "tool:compat-adapter:dify-default",
        "reason": (
            "Compatibility adapter 'dify-default' does not support requested execution class "
            "'microvm'. Supported classes: subprocess."
        ),
    }


def test_llm_agent_waiting_tool_can_resume(sqlite_session: Session) -> None:
    workflow = Workflow(
        id="wf-agent-resume",
        name="Agent Resume Workflow",
        version="0.1.0",
        status="draft",
        definition={
            "nodes": [
                {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
                {
                    "id": "agent",
                    "type": "llm_agent",
                    "name": "Agent",
                    "config": {
                        "assistant": {"enabled": False},
                        "toolPolicy": {"allowedToolIds": ["native.search"]},
                        "mockPlan": {
                            "toolCalls": [
                                {
                                    "toolId": "native.search",
                                    "inputs": {"query": "resume-me"},
                                }
                            ]
                        },
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
    workflow_version = WorkflowVersion(
        id="wf-agent-resume-v1",
        workflow_id=workflow.id,
        version=workflow.version,
        definition=workflow.definition,
    )
    sqlite_session.add(workflow)
    sqlite_session.add(workflow_version)
    sqlite_session.commit()

    call_counter = {"count": 0}

    def _resume_capable_tool(request):
        call_counter["count"] += 1
        if call_counter["count"] == 1:
            return {
                "status": "waiting",
                "content_type": "json",
                "summary": "awaiting callback",
                "structured": {"ticket": "tool-123"},
                "meta": {"tool_name": "Native Search", "waiting_reason": "callback pending"},
            }
        return {
            "status": "success",
            "content_type": "json",
            "summary": "callback finished",
            "structured": {"documents": ["done"], "query": request.inputs["query"]},
            "meta": {"tool_name": "Native Search"},
        }

    registry = PluginRegistry()
    registry.register_tool(
        PluginToolDefinition(id="native.search", name="Native Search"),
        invoker=_resume_capable_tool,
    )
    runtime = RuntimeService(plugin_call_proxy=PluginCallProxy(registry))

    first_pass = runtime.execute_workflow(sqlite_session, workflow, {"topic": "resume"})

    waiting_run = next(node_run for node_run in first_pass.node_runs if node_run.node_id == "agent")
    assert first_pass.run.status == "waiting"
    assert waiting_run.status == "waiting_tool"
    assert waiting_run.waiting_reason == "callback pending"
    assert first_pass.run.current_node_id == "agent"
    assert "run.waiting" in [event.event_type for event in first_pass.events]

    resumed = runtime.resume_run(sqlite_session, first_pass.run.id)

    resumed_agent_run = next(
        node_run for node_run in resumed.node_runs if node_run.node_id == "agent"
    )
    assert resumed.run.status == "succeeded"
    assert resumed_agent_run.status == "succeeded"
    assert resumed_agent_run.output_payload["decision_basis"] == "tool_results"
    assert resumed.run.output_payload["agent"]["result"] == "callback finished"
    assert "run.resumed" in [event.event_type for event in resumed.events]


def test_runtime_service_schedules_retry_resume_with_backoff(
    sqlite_session: Session,
) -> None:
    workflow = Workflow(
        id="wf-retry-scheduled",
        name="Retry Scheduled Workflow",
        version="0.1.0",
        status="draft",
        definition={
            "nodes": [
                {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
                {
                    "id": "flaky_tool",
                    "type": "tool",
                    "name": "Flaky Tool",
                    "config": {
                        "mock_error_sequence": ["temporary outage"],
                        "mock_output": {"answer": "recovered"},
                    },
                    "runtimePolicy": {
                        "retry": {
                            "maxAttempts": 2,
                            "backoffSeconds": 5,
                        }
                    },
                },
                {"id": "output", "type": "output", "name": "Output", "config": {}},
            ],
            "edges": [
                {"id": "e1", "sourceNodeId": "trigger", "targetNodeId": "flaky_tool"},
                {"id": "e2", "sourceNodeId": "flaky_tool", "targetNodeId": "output"},
            ],
        },
    )
    workflow_version = WorkflowVersion(
        id="wf-retry-scheduled-v1",
        workflow_id=workflow.id,
        version=workflow.version,
        definition=workflow.definition,
    )
    sqlite_session.add(workflow)
    sqlite_session.add(workflow_version)
    sqlite_session.commit()

    scheduled_resumes = []
    runtime = RuntimeService(
        resume_scheduler=RunResumeScheduler(dispatcher=scheduled_resumes.append),
    )

    first_pass = runtime.execute_workflow(sqlite_session, workflow, {"topic": "retry"})

    retry_run = next(
        node_run for node_run in first_pass.node_runs if node_run.node_id == "flaky_tool"
    )
    assert first_pass.run.status == "waiting"
    assert retry_run.status == "retrying"
    assert retry_run.waiting_reason == "Retry 2/2 scheduled in 5s after error: temporary outage"
    assert retry_run.checkpoint_payload["retry_state"]["next_attempt_number"] == 2
    assert retry_run.checkpoint_payload["scheduled_resume"]["delay_seconds"] == 5.0
    assert len(scheduled_resumes) == 1
    assert scheduled_resumes[0].run_id == first_pass.run.id
    assert scheduled_resumes[0].delay_seconds == 5.0
    assert "run.resume.scheduled" in [event.event_type for event in first_pass.events]

    resumed = runtime.resume_run(sqlite_session, first_pass.run.id, source="test")

    resumed_retry_run = next(
        node_run for node_run in resumed.node_runs if node_run.node_id == "flaky_tool"
    )
    assert resumed.run.status == "succeeded"
    assert resumed_retry_run.status == "succeeded"
    assert resumed_retry_run.retry_count == 1
    assert "retry_state" not in resumed_retry_run.checkpoint_payload
    assert "scheduled_resume" not in resumed_retry_run.checkpoint_payload


def test_llm_agent_waiting_callback_can_schedule_resume(
    sqlite_session: Session,
) -> None:
    workflow = Workflow(
        id="wf-agent-scheduled-resume",
        name="Agent Scheduled Resume Workflow",
        version="0.1.0",
        status="draft",
        definition={
            "nodes": [
                {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
                {
                    "id": "agent",
                    "type": "llm_agent",
                    "name": "Agent",
                    "config": {
                        "assistant": {"enabled": False},
                        "toolPolicy": {"allowedToolIds": ["native.search"]},
                        "mockPlan": {
                            "toolCalls": [
                                {
                                    "toolId": "native.search",
                                    "inputs": {"query": "schedule-me"},
                                }
                            ]
                        },
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
    workflow_version = WorkflowVersion(
        id="wf-agent-scheduled-resume-v1",
        workflow_id=workflow.id,
        version=workflow.version,
        definition=workflow.definition,
    )
    sqlite_session.add(workflow)
    sqlite_session.add(workflow_version)
    sqlite_session.commit()

    call_counter = {"count": 0}

    def _scheduled_resume_tool(request):
        call_counter["count"] += 1
        if call_counter["count"] == 1:
            return {
                "status": "waiting",
                "content_type": "json",
                "summary": "awaiting callback",
                "structured": {"ticket": "tool-456"},
                "meta": {
                    "tool_name": "Native Search",
                    "waiting_reason": "callback pending",
                    "waiting_status": "waiting_callback",
                    "resume_after_seconds": 3,
                },
            }
        return {
            "status": "success",
            "content_type": "json",
            "summary": "callback finished",
            "structured": {"documents": ["done"], "query": request.inputs["query"]},
            "meta": {"tool_name": "Native Search"},
        }

    registry = PluginRegistry()
    registry.register_tool(
        PluginToolDefinition(id="native.search", name="Native Search"),
        invoker=_scheduled_resume_tool,
    )
    scheduled_resumes = []
    runtime = RuntimeService(
        plugin_call_proxy=PluginCallProxy(registry),
        resume_scheduler=RunResumeScheduler(dispatcher=scheduled_resumes.append),
    )

    first_pass = runtime.execute_workflow(sqlite_session, workflow, {"topic": "resume"})

    waiting_run = next(node_run for node_run in first_pass.node_runs if node_run.node_id == "agent")
    assert first_pass.run.status == "waiting"
    assert waiting_run.status == "waiting_callback"
    assert waiting_run.phase == "waiting_callback"
    assert waiting_run.checkpoint_payload["scheduled_resume"]["delay_seconds"] == 3.0
    assert len(scheduled_resumes) == 1
    assert scheduled_resumes[0].delay_seconds == 3.0
    assert "run.resume.scheduled" in [event.event_type for event in first_pass.events]

    resumed = runtime.resume_run(sqlite_session, first_pass.run.id, source="test")

    resumed_agent_run = next(
        node_run for node_run in resumed.node_runs if node_run.node_id == "agent"
    )
    assert resumed.run.status == "succeeded"
    assert resumed_agent_run.status == "succeeded"
    assert resumed.run.output_payload["agent"]["result"] == "callback finished"


def test_llm_agent_waiting_callback_can_resume_from_callback_ticket(
    sqlite_session: Session,
) -> None:
    workflow = Workflow(
        id="wf-agent-callback-ticket",
        name="Agent Callback Ticket Workflow",
        version="0.1.0",
        status="draft",
        definition={
            "nodes": [
                {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
                {
                    "id": "agent",
                    "type": "llm_agent",
                    "name": "Agent",
                    "config": {
                        "assistant": {"enabled": False},
                        "toolPolicy": {"allowedToolIds": ["native.search"]},
                        "mockPlan": {
                            "toolCalls": [
                                {
                                    "toolId": "native.search",
                                    "inputs": {"query": "callback-ticket"},
                                }
                            ]
                        },
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
    workflow_version = WorkflowVersion(
        id="wf-agent-callback-ticket-v1",
        workflow_id=workflow.id,
        version=workflow.version,
        definition=workflow.definition,
    )
    sqlite_session.add(workflow)
    sqlite_session.add(workflow_version)
    sqlite_session.commit()

    registry = PluginRegistry()
    registry.register_tool(
        PluginToolDefinition(id="native.search", name="Native Search"),
        invoker=lambda _request: {
            "status": "waiting",
            "content_type": "json",
            "summary": "waiting for external callback",
            "structured": {"ticket": "external-123"},
            "meta": {
                "tool_name": "Native Search",
                "waiting_reason": "external callback pending",
                "waiting_status": "waiting_callback",
            },
        },
    )
    runtime = RuntimeService(plugin_call_proxy=PluginCallProxy(registry))

    first_pass = runtime.execute_workflow(sqlite_session, workflow, {"topic": "callback"})

    waiting_run = next(node_run for node_run in first_pass.node_runs if node_run.node_id == "agent")
    callback_ticket = waiting_run.checkpoint_payload["callback_ticket"]
    assert first_pass.run.status == "waiting"
    assert waiting_run.status == "waiting_callback"
    assert callback_ticket["ticket"]

    callback_result = runtime.receive_callback(
        sqlite_session,
        callback_ticket["ticket"],
        payload={
            "status": "success",
            "content_type": "json",
            "summary": "callback completed",
            "structured": {"documents": ["done"], "query": "callback-ticket"},
            "meta": {"tool_name": "Native Search"},
        },
        source="test_callback",
    )

    resumed_agent_run = next(
        node_run for node_run in callback_result.artifacts.node_runs if node_run.node_id == "agent"
    )
    ticket_record = sqlite_session.get(RunCallbackTicket, callback_ticket["ticket"])

    assert callback_result.callback_status == "accepted"
    assert callback_result.artifacts.run.status == "succeeded"
    assert resumed_agent_run.status == "succeeded"
    assert resumed_agent_run.output_payload["result"] == "callback completed"
    assert "callback_ticket" not in resumed_agent_run.checkpoint_payload
    assert ticket_record is not None
    assert ticket_record.status == "consumed"
    assert "run.callback.received" in [
        event.event_type for event in callback_result.artifacts.events
    ]

    duplicate = runtime.receive_callback(
        sqlite_session,
        callback_ticket["ticket"],
        payload={
            "status": "success",
            "content_type": "json",
            "summary": "duplicate callback",
            "structured": {"documents": ["ignored"]},
            "meta": {},
        },
        source="test_callback",
    )

    assert duplicate.callback_status == "already_consumed"
    assert duplicate.artifacts.run.status == "succeeded"


def test_expired_callback_ticket_is_rejected_and_schedules_waiting_run_resume(
    sqlite_session: Session,
) -> None:
    workflow = Workflow(
        id="wf-agent-callback-expired",
        name="Agent Callback Expired Workflow",
        version="0.1.0",
        status="draft",
        definition={
            "nodes": [
                {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
                {
                    "id": "agent",
                    "type": "llm_agent",
                    "name": "Agent",
                    "config": {
                        "assistant": {"enabled": False},
                        "toolPolicy": {"allowedToolIds": ["native.search"]},
                        "mockPlan": {
                            "toolCalls": [
                                {
                                    "toolId": "native.search",
                                    "inputs": {"query": "expired-ticket"},
                                }
                            ]
                        },
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
    workflow_version = WorkflowVersion(
        id="wf-agent-callback-expired-v1",
        workflow_id=workflow.id,
        version=workflow.version,
        definition=workflow.definition,
    )
    sqlite_session.add(workflow)
    sqlite_session.add(workflow_version)
    sqlite_session.commit()

    registry = PluginRegistry()
    registry.register_tool(
        PluginToolDefinition(id="native.search", name="Native Search"),
        invoker=lambda _request: {
            "status": "waiting",
            "content_type": "json",
            "summary": "waiting for external callback",
            "structured": {"ticket": "external-expired"},
            "meta": {
                "tool_name": "Native Search",
                "waiting_reason": "external callback pending",
                "waiting_status": "waiting_callback",
            },
        },
    )
    scheduled_resumes = []
    runtime = RuntimeService(
        plugin_call_proxy=PluginCallProxy(registry),
        resume_scheduler=RunResumeScheduler(dispatcher=scheduled_resumes.append),
    )

    first_pass = runtime.execute_workflow(sqlite_session, workflow, {"topic": "callback"})
    waiting_run = next(node_run for node_run in first_pass.node_runs if node_run.node_id == "agent")
    callback_ticket = waiting_run.checkpoint_payload["callback_ticket"]
    ticket_record = sqlite_session.get(RunCallbackTicket, callback_ticket["ticket"])
    assert ticket_record is not None
    ticket_record.expires_at = datetime.now(UTC) - timedelta(minutes=1)
    sqlite_session.commit()

    callback_result = runtime.receive_callback(
        sqlite_session,
        callback_ticket["ticket"],
        payload={
            "status": "success",
            "content_type": "json",
            "summary": "callback arrived too late",
            "structured": {"documents": ["ignored"]},
            "meta": {"tool_name": "Native Search"},
        },
        source="expired_callback_test",
    )

    sqlite_session.refresh(ticket_record)
    refreshed_run = sqlite_session.get(type(first_pass.run), first_pass.run.id)
    assert refreshed_run is not None

    assert callback_result.callback_status == "expired"
    assert refreshed_run.status == "waiting"
    assert len(scheduled_resumes) == 1
    assert scheduled_resumes[0].run_id == first_pass.run.id
    assert scheduled_resumes[0].delay_seconds == 0.0
    assert scheduled_resumes[0].reason == "external callback pending"
    assert scheduled_resumes[0].source == "expired_callback_test"
    assert ticket_record.status == "expired"
    assert ticket_record.expired_at is not None
    assert ticket_record.callback_payload == {
        "reason": "callback_ticket_expired",
        "source": "expired_callback_test",
        "cleanup": False,
    }
    assert "run.callback.ticket.expired" in [
        event.event_type for event in callback_result.artifacts.events
    ]

from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.models.workflow import Workflow, WorkflowVersion
from app.services.compiled_blueprints import CompiledBlueprintService
from app.services.plugin_runtime import PluginCallProxy, PluginRegistry, PluginToolDefinition
from app.services.run_resume_scheduler import RunResumeScheduler
from app.services.runtime import RuntimeService
from app.services.sensitive_access_control import SensitiveAccessControlService


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


def _make_capturing_proxy(
    *,
    tool_id: str,
    tool_name: str,
    captured_calls: list[dict],
) -> PluginCallProxy:
    registry = PluginRegistry()

    def _invoke(request):
        captured_calls.append(
            {
                "tool_id": request.tool_id,
                "inputs": dict(request.inputs or {}),
                "credentials": dict(request.credentials or {}),
            }
        )
        return {
            "status": "success",
            "content_type": "json",
            "summary": f"{tool_name} finished",
            "structured": {"result": "ok", "toolId": request.tool_id},
            "meta": {"tool_name": tool_name},
        }

    registry.register_tool(
        PluginToolDefinition(id=tool_id, name=tool_name, ecosystem="native"),
        invoker=_invoke,
    )
    return PluginCallProxy(registry)


def test_tool_gateway_sensitive_tool_node_waits_for_approval_and_resumes(
    sqlite_session: Session,
) -> None:
    scheduled_resumes = []
    captured_calls: list[dict] = []
    sensitive_access = SensitiveAccessControlService(
        resume_scheduler=RunResumeScheduler(dispatcher=scheduled_resumes.append)
    )
    workflow = _create_workflow(
        sqlite_session,
        workflow_id="wf-sensitive-tool-node",
        definition={
            "nodes": [
                {"id": "startNode", "type": "startNode", "name": "startNode", "config": {}},
                {
                    "id": "tool_node",
                    "type": "toolNode",
                    "name": "Sensitive Tool",
                    "config": {"tool": {"toolId": "test-tool"}},
                },
                {"id": "endNode", "type": "endNode", "name": "endNode", "config": {}},
            ],
            "edges": [
                {"id": "e1", "sourceNodeId": "startNode", "targetNodeId": "tool_node"},
                {"id": "e2", "sourceNodeId": "tool_node", "targetNodeId": "endNode"},
            ],
        },
    )
    sensitive_access.create_resource(
        sqlite_session,
        label="Sensitive Search Capability",
        sensitivity_level="L3",
        source="local_capability",
        metadata={
            "workflow_id": workflow.id,
            "tool_id": "test-tool",
        },
    )
    sqlite_session.commit()

    runtime = RuntimeService(
        plugin_call_proxy=_make_capturing_proxy(
            tool_id="test-tool",
            tool_name="Test Tool",
            captured_calls=captured_calls,
        ),
        sensitive_access_service=sensitive_access,
    )

    first_pass = runtime.execute_workflow(sqlite_session, workflow, {"query": "approval"})

    waiting_run = next(
        node_run for node_run in first_pass.node_runs if node_run.node_id == "tool_node"
    )
    approval_tickets = sensitive_access.list_approval_tickets(
        sqlite_session,
        run_id=first_pass.run.id,
    )
    access_requests = sensitive_access.list_access_requests(
        sqlite_session,
        run_id=first_pass.run.id,
    )

    assert first_pass.run.status == "waiting"
    assert waiting_run.status == "waiting_tool"
    assert waiting_run.phase == "waiting_tool"
    assert waiting_run.checkpoint_payload["sensitive_access"]["access_target"] == "tool_invoke"
    assert waiting_run.checkpoint_payload["sensitive_access"]["tool_id"] == "test-tool"
    assert len(approval_tickets) == 1
    assert approval_tickets[0].status == "pending"
    assert len(access_requests) == 1
    assert access_requests[0].action_type == "invoke"
    assert access_requests[0].requester_type == "tool"
    assert access_requests[0].requester_id == "test-tool"
    assert captured_calls == []
    assert first_pass.tool_calls == []

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

    resumed = runtime.resume_run(sqlite_session, first_pass.run.id, source="test")

    resumed_tool_run = next(
        node_run for node_run in resumed.node_runs if node_run.node_id == "tool_node"
    )
    assert resumed.run.status == "succeeded"
    assert resumed_tool_run.status == "succeeded"
    assert resumed.run.output_payload["tool_node"]["result"] == "ok"
    assert len(captured_calls) == 1
    assert len(resumed.tool_calls) == 1


def test_tool_gateway_sensitive_agent_tool_waits_for_approval_and_resumes(
    sqlite_session: Session,
) -> None:
    scheduled_resumes = []
    captured_calls: list[dict] = []
    sensitive_access = SensitiveAccessControlService(
        resume_scheduler=RunResumeScheduler(dispatcher=scheduled_resumes.append)
    )
    workflow = _create_workflow(
        sqlite_session,
        workflow_id="wf-sensitive-agent-tool",
        definition={
            "nodes": [
                {"id": "startNode", "type": "startNode", "name": "startNode", "config": {}},
                {
                    "id": "agent",
                    "type": "llmAgentNode",
                    "name": "Agent",
                    "config": {
                        "assistant": {"enabled": False},
                        "toolPolicy": {"allowedToolIds": ["native.search"]},
                        "mockPlan": {
                            "toolCalls": [
                                {
                                    "toolId": "native.search",
                                    "inputs": {"query": "sensitive search"},
                                }
                            ]
                        },
                    },
                },
                {"id": "endNode", "type": "endNode", "name": "endNode", "config": {}},
            ],
            "edges": [
                {"id": "e1", "sourceNodeId": "startNode", "targetNodeId": "agent"},
                {"id": "e2", "sourceNodeId": "agent", "targetNodeId": "endNode"},
            ],
        },
    )
    sensitive_access.create_resource(
        sqlite_session,
        label="Sensitive Native Search",
        sensitivity_level="L3",
        source="local_capability",
        metadata={
            "workflow_id": workflow.id,
            "tool_id": "native.search",
        },
    )
    sqlite_session.commit()

    runtime = RuntimeService(
        plugin_call_proxy=_make_capturing_proxy(
            tool_id="native.search",
            tool_name="Native Search",
            captured_calls=captured_calls,
        ),
        sensitive_access_service=sensitive_access,
        resume_scheduler=RunResumeScheduler(dispatcher=scheduled_resumes.append),
    )

    first_pass = runtime.execute_workflow(sqlite_session, workflow, {"topic": "agent"})

    waiting_run = next(node_run for node_run in first_pass.node_runs if node_run.node_id == "agent")
    approval_tickets = sensitive_access.list_approval_tickets(
        sqlite_session,
        run_id=first_pass.run.id,
    )
    access_requests = sensitive_access.list_access_requests(
        sqlite_session,
        run_id=first_pass.run.id,
    )

    assert first_pass.run.status == "waiting"
    assert waiting_run.status == "waiting_tool"
    assert waiting_run.phase == "waiting_tool"
    assert waiting_run.checkpoint_payload["sensitive_access"]["access_target"] == "tool_invoke"
    assert waiting_run.checkpoint_payload["sensitive_access"]["tool_id"] == "native.search"
    assert len(approval_tickets) == 1
    assert access_requests[0].action_type == "invoke"
    assert access_requests[0].requester_id == "native.search"
    assert captured_calls == []
    assert first_pass.tool_calls == []

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

    resumed = runtime.resume_run(sqlite_session, first_pass.run.id, source="test")

    resumed_agent_run = next(
        node_run for node_run in resumed.node_runs if node_run.node_id == "agent"
    )
    assert resumed.run.status == "succeeded"
    assert resumed_agent_run.status == "succeeded"
    assert len(captured_calls) == 1
    assert captured_calls[0]["inputs"] == {"query": "sensitive search"}
    assert len(resumed.tool_calls) == 1

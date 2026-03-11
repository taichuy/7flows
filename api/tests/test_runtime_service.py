import pytest
from sqlalchemy.orm import Session

from app.models.run import RunCallbackTicket
from app.models.workflow import Workflow, WorkflowVersion
from app.services.plugin_runtime import PluginCallProxy, PluginRegistry, PluginToolDefinition
from app.services.run_resume_scheduler import RunResumeScheduler
from app.services.runtime import RuntimeService, WorkflowExecutionError


def test_runtime_service_executes_linear_workflow(
    sqlite_session: Session,
    sample_workflow: Workflow,
) -> None:
    service = RuntimeService()

    artifacts = service.execute_workflow(
        sqlite_session,
        sample_workflow,
        {"topic": "hello"},
    )

    assert artifacts.run.status == "succeeded"
    assert artifacts.run.workflow_version == "0.1.0"
    assert artifacts.run.output_payload == {"mock_tool": {"answer": "done"}}
    assert len(artifacts.node_runs) == 3
    assert [event.event_type for event in artifacts.events] == [
        "run.started",
        "node.started",
        "node.output.completed",
        "node.started",
        "node.output.completed",
        "node.started",
        "node.output.completed",
        "run.completed",
    ]


def test_runtime_service_only_executes_selected_condition_branch(sqlite_session: Session) -> None:
    workflow = Workflow(
        id="wf-condition",
        name="Condition Workflow",
        version="0.1.0",
        status="draft",
        definition={
            "nodes": [
                {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
                {
                    "id": "branch",
                    "type": "condition",
                    "name": "Branch",
                    "config": {"selected": "true"},
                },
                {
                    "id": "true_path",
                    "type": "tool",
                    "name": "True Path",
                    "config": {"mock_output": {"answer": "yes"}},
                },
                {
                    "id": "false_path",
                    "type": "tool",
                    "name": "False Path",
                    "config": {"mock_output": {"answer": "no"}},
                },
                {"id": "output", "type": "output", "name": "Output", "config": {}},
            ],
            "edges": [
                {"id": "e1", "sourceNodeId": "trigger", "targetNodeId": "branch"},
                {
                    "id": "e2",
                    "sourceNodeId": "branch",
                    "targetNodeId": "true_path",
                    "condition": "true",
                },
                {
                    "id": "e3",
                    "sourceNodeId": "branch",
                    "targetNodeId": "false_path",
                    "condition": "false",
                },
                {"id": "e4", "sourceNodeId": "true_path", "targetNodeId": "output"},
                {"id": "e5", "sourceNodeId": "false_path", "targetNodeId": "output"},
            ],
        },
    )
    sqlite_session.add(workflow)
    sqlite_session.commit()

    artifacts = RuntimeService().execute_workflow(sqlite_session, workflow, {"topic": "branch"})

    assert artifacts.run.status == "succeeded"
    assert artifacts.run.output_payload == {"true_path": {"answer": "yes"}}
    assert {node_run.node_id: node_run.status for node_run in artifacts.node_runs} == {
        "trigger": "succeeded",
        "branch": "succeeded",
        "true_path": "succeeded",
        "false_path": "skipped",
        "output": "succeeded",
    }
    assert "node.skipped" in [event.event_type for event in artifacts.events]


def test_runtime_service_selects_condition_branch_from_trigger_input(
    sqlite_session: Session,
) -> None:
    workflow = Workflow(
        id="wf-condition-selector",
        name="Condition Selector Workflow",
        version="0.1.0",
        status="draft",
        definition={
            "nodes": [
                {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
                {
                    "id": "branch",
                    "type": "condition",
                    "name": "Branch",
                    "config": {
                        "selector": {
                            "rules": [
                                {
                                    "key": "urgent",
                                    "path": "trigger_input.priority",
                                    "operator": "eq",
                                    "value": "high",
                                }
                            ]
                        }
                    },
                },
                {
                    "id": "urgent_path",
                    "type": "tool",
                    "name": "Urgent Path",
                    "config": {"mock_output": {"answer": "rush"}},
                },
                {
                    "id": "normal_path",
                    "type": "tool",
                    "name": "Normal Path",
                    "config": {"mock_output": {"answer": "later"}},
                },
                {"id": "output", "type": "output", "name": "Output", "config": {}},
            ],
            "edges": [
                {"id": "e1", "sourceNodeId": "trigger", "targetNodeId": "branch"},
                {
                    "id": "e2",
                    "sourceNodeId": "branch",
                    "targetNodeId": "urgent_path",
                    "condition": "urgent",
                },
                {"id": "e3", "sourceNodeId": "branch", "targetNodeId": "normal_path"},
                {"id": "e4", "sourceNodeId": "urgent_path", "targetNodeId": "output"},
                {"id": "e5", "sourceNodeId": "normal_path", "targetNodeId": "output"},
            ],
        },
    )
    sqlite_session.add(workflow)
    sqlite_session.commit()

    artifacts = RuntimeService().execute_workflow(sqlite_session, workflow, {"priority": "high"})

    assert artifacts.run.status == "succeeded"
    assert artifacts.run.output_payload == {"urgent_path": {"answer": "rush"}}
    assert {node_run.node_id: node_run.status for node_run in artifacts.node_runs} == {
        "trigger": "succeeded",
        "branch": "succeeded",
        "urgent_path": "succeeded",
        "normal_path": "skipped",
        "output": "succeeded",
    }
    branch_run = next(node_run for node_run in artifacts.node_runs if node_run.node_id == "branch")
    assert branch_run.output_payload["selected"] == "urgent"
    assert branch_run.output_payload["selector"]["matchedRule"]["path"] == "trigger_input.priority"


def test_runtime_service_uses_default_branch_when_selector_rules_do_not_match(
    sqlite_session: Session,
) -> None:
    workflow = Workflow(
        id="wf-condition-selector-default",
        name="Condition Selector Default Workflow",
        version="0.1.0",
        status="draft",
        definition={
            "nodes": [
                {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
                {
                    "id": "branch",
                    "type": "router",
                    "name": "Branch",
                    "config": {
                        "selector": {
                            "rules": [
                                {
                                    "key": "research",
                                    "path": "trigger_input.intent",
                                    "operator": "eq",
                                    "value": "research",
                                }
                            ]
                        }
                    },
                },
                {
                    "id": "research_path",
                    "type": "tool",
                    "name": "Research Path",
                    "config": {"mock_output": {"answer": "search docs"}},
                },
                {
                    "id": "default_path",
                    "type": "tool",
                    "name": "Default Path",
                    "config": {"mock_output": {"answer": "chat"}},
                },
                {"id": "output", "type": "output", "name": "Output", "config": {}},
            ],
            "edges": [
                {"id": "e1", "sourceNodeId": "trigger", "targetNodeId": "branch"},
                {
                    "id": "e2",
                    "sourceNodeId": "branch",
                    "targetNodeId": "research_path",
                    "condition": "research",
                },
                {"id": "e3", "sourceNodeId": "branch", "targetNodeId": "default_path"},
                {"id": "e4", "sourceNodeId": "research_path", "targetNodeId": "output"},
                {"id": "e5", "sourceNodeId": "default_path", "targetNodeId": "output"},
            ],
        },
    )
    sqlite_session.add(workflow)
    sqlite_session.commit()

    artifacts = RuntimeService().execute_workflow(sqlite_session, workflow, {"intent": "chat"})

    assert artifacts.run.status == "succeeded"
    assert artifacts.run.output_payload == {"default_path": {"answer": "chat"}}
    assert {node_run.node_id: node_run.status for node_run in artifacts.node_runs} == {
        "trigger": "succeeded",
        "branch": "succeeded",
        "research_path": "skipped",
        "default_path": "succeeded",
        "output": "succeeded",
    }
    branch_run = next(node_run for node_run in artifacts.node_runs if node_run.node_id == "branch")
    assert branch_run.output_payload["selected"] == "default"
    assert branch_run.output_payload["selector"]["defaultUsed"] is True


def test_runtime_service_selects_condition_branch_from_expression(
    sqlite_session: Session,
) -> None:
    workflow = Workflow(
        id="wf-condition-expression",
        name="Condition Expression Workflow",
        version="0.1.0",
        status="draft",
        definition={
            "nodes": [
                {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
                {
                    "id": "branch",
                    "type": "condition",
                    "name": "Branch",
                    "config": {
                        "expression": "trigger_input.priority == 'high' and "
                        "not upstream.branch_override"
                    },
                },
                {
                    "id": "true_path",
                    "type": "tool",
                    "name": "True Path",
                    "config": {"mock_output": {"answer": "expedite"}},
                },
                {
                    "id": "false_path",
                    "type": "tool",
                    "name": "False Path",
                    "config": {"mock_output": {"answer": "queue"}},
                },
                {"id": "output", "type": "output", "name": "Output", "config": {}},
            ],
            "edges": [
                {"id": "e1", "sourceNodeId": "trigger", "targetNodeId": "branch"},
                {
                    "id": "e2",
                    "sourceNodeId": "branch",
                    "targetNodeId": "true_path",
                    "condition": "true",
                },
                {
                    "id": "e3",
                    "sourceNodeId": "branch",
                    "targetNodeId": "false_path",
                    "condition": "false",
                },
                {"id": "e4", "sourceNodeId": "true_path", "targetNodeId": "output"},
                {"id": "e5", "sourceNodeId": "false_path", "targetNodeId": "output"},
            ],
        },
    )
    sqlite_session.add(workflow)
    sqlite_session.commit()

    artifacts = RuntimeService().execute_workflow(sqlite_session, workflow, {"priority": "high"})

    assert artifacts.run.status == "succeeded"
    assert artifacts.run.output_payload == {"true_path": {"answer": "expedite"}}
    assert {node_run.node_id: node_run.status for node_run in artifacts.node_runs} == {
        "trigger": "succeeded",
        "branch": "succeeded",
        "true_path": "succeeded",
        "false_path": "skipped",
        "output": "succeeded",
    }
    branch_run = next(node_run for node_run in artifacts.node_runs if node_run.node_id == "branch")
    assert branch_run.output_payload["selected"] == "true"
    assert branch_run.output_payload["expression"]["value"] is True


def test_runtime_service_routes_router_expression_to_matching_branch(
    sqlite_session: Session,
) -> None:
    workflow = Workflow(
        id="wf-router-expression",
        name="Router Expression Workflow",
        version="0.1.0",
        status="draft",
        definition={
            "nodes": [
                {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
                {
                    "id": "branch",
                    "type": "router",
                    "name": "Branch",
                    "config": {
                        "expression": "trigger_input.intent if trigger_input.intent else 'default'"
                    },
                },
                {
                    "id": "search_path",
                    "type": "tool",
                    "name": "Search Path",
                    "config": {"mock_output": {"answer": "search mode"}},
                },
                {
                    "id": "chat_path",
                    "type": "tool",
                    "name": "Chat Path",
                    "config": {"mock_output": {"answer": "chat mode"}},
                },
                {"id": "output", "type": "output", "name": "Output", "config": {}},
            ],
            "edges": [
                {"id": "e1", "sourceNodeId": "trigger", "targetNodeId": "branch"},
                {
                    "id": "e2",
                    "sourceNodeId": "branch",
                    "targetNodeId": "search_path",
                    "condition": "search",
                },
                {"id": "e3", "sourceNodeId": "branch", "targetNodeId": "chat_path"},
                {"id": "e4", "sourceNodeId": "search_path", "targetNodeId": "output"},
                {"id": "e5", "sourceNodeId": "chat_path", "targetNodeId": "output"},
            ],
        },
    )
    sqlite_session.add(workflow)
    sqlite_session.commit()

    artifacts = RuntimeService().execute_workflow(sqlite_session, workflow, {"intent": "search"})

    assert artifacts.run.status == "succeeded"
    assert artifacts.run.output_payload == {"search_path": {"answer": "search mode"}}
    branch_run = next(node_run for node_run in artifacts.node_runs if node_run.node_id == "branch")
    assert branch_run.output_payload["selected"] == "search"
    assert branch_run.output_payload["expression"]["defaultUsed"] is False


def test_runtime_service_gates_regular_edges_with_condition_expression(
    sqlite_session: Session,
) -> None:
    workflow = Workflow(
        id="wf-edge-expression",
        name="Edge Expression Workflow",
        version="0.1.0",
        status="draft",
        definition={
            "nodes": [
                {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
                {
                    "id": "scorer",
                    "type": "tool",
                    "name": "Scorer",
                    "config": {"mock_output": {"score": 92, "approved": True}},
                },
                {
                    "id": "approve",
                    "type": "tool",
                    "name": "Approve",
                    "config": {"mock_output": {"answer": "approved"}},
                },
                {
                    "id": "reject",
                    "type": "tool",
                    "name": "Reject",
                    "config": {"mock_output": {"answer": "rejected"}},
                },
                {"id": "output", "type": "output", "name": "Output", "config": {}},
            ],
            "edges": [
                {"id": "e1", "sourceNodeId": "trigger", "targetNodeId": "scorer"},
                {
                    "id": "e2",
                    "sourceNodeId": "scorer",
                    "targetNodeId": "approve",
                    "conditionExpression": "source_output.approved and source_output.score >= 90",
                },
                {
                    "id": "e3",
                    "sourceNodeId": "scorer",
                    "targetNodeId": "reject",
                    "conditionExpression": "not source_output.approved",
                },
                {"id": "e4", "sourceNodeId": "approve", "targetNodeId": "output"},
                {"id": "e5", "sourceNodeId": "reject", "targetNodeId": "output"},
            ],
        },
    )
    sqlite_session.add(workflow)
    sqlite_session.commit()

    artifacts = RuntimeService().execute_workflow(sqlite_session, workflow, {"topic": "gate"})

    assert artifacts.run.status == "succeeded"
    assert artifacts.run.output_payload == {"approve": {"answer": "approved"}}
    assert {node_run.node_id: node_run.status for node_run in artifacts.node_runs} == {
        "trigger": "succeeded",
        "scorer": "succeeded",
        "approve": "succeeded",
        "reject": "skipped",
        "output": "succeeded",
    }


def test_runtime_service_applies_edge_mapping_to_target_input(
    sqlite_session: Session,
) -> None:
    workflow = Workflow(
        id="wf-edge-mapping",
        name="Edge Mapping Workflow",
        version="0.1.0",
        status="draft",
        definition={
            "nodes": [
                {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
                {
                    "id": "planner",
                    "type": "tool",
                    "name": "Planner",
                    "config": {"mock_output": {"plan": {"title": "Draft"}, "priority": "7"}},
                },
                {
                    "id": "formatter",
                    "type": "tool",
                    "name": "Formatter",
                    "config": {"mode": "summary"},
                },
                {"id": "output", "type": "output", "name": "Output", "config": {}},
            ],
            "edges": [
                {"id": "e1", "sourceNodeId": "trigger", "targetNodeId": "planner"},
                {
                    "id": "e2",
                    "sourceNodeId": "planner",
                    "targetNodeId": "formatter",
                    "mapping": [
                        {"sourceField": "plan.title", "targetField": "prompt"},
                        {
                            "sourceField": "priority",
                            "targetField": "config.priority",
                            "transform": {"type": "toNumber"},
                        },
                        {
                            "sourceField": "missing",
                            "targetField": "metadata.note",
                            "fallback": "n/a",
                            "template": "value={{value}}",
                        },
                    ],
                },
                {"id": "e3", "sourceNodeId": "formatter", "targetNodeId": "output"},
            ],
        },
    )
    sqlite_session.add(workflow)
    sqlite_session.commit()

    artifacts = RuntimeService().execute_workflow(sqlite_session, workflow, {"topic": "mapping"})

    assert artifacts.run.status == "succeeded"
    formatter_run = next(
        node_run for node_run in artifacts.node_runs if node_run.node_id == "formatter"
    )
    assert formatter_run.input_payload["prompt"] == "Draft"
    assert formatter_run.input_payload["config"]["priority"] == 7
    assert formatter_run.input_payload["metadata"]["note"] == "value=n/a"
    assert formatter_run.input_payload["mapped"] == {
        "prompt": "Draft",
        "config": {"priority": 7},
        "metadata": {"note": "value=n/a"},
    }


def test_runtime_service_appends_conflicting_mapped_values_when_merge_strategy_is_append(
    sqlite_session: Session,
) -> None:
    workflow = Workflow(
        id="wf-edge-mapping-append",
        name="Edge Mapping Append Workflow",
        version="0.1.0",
        status="draft",
        definition={
            "nodes": [
                {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
                {
                    "id": "planner",
                    "type": "tool",
                    "name": "Planner",
                    "config": {"mock_output": {"topic": "plan"}},
                },
                {
                    "id": "researcher",
                    "type": "tool",
                    "name": "Researcher",
                    "config": {"mock_output": {"topic": "facts"}},
                },
                {
                    "id": "joiner",
                    "type": "tool",
                    "name": "Joiner",
                    "config": {},
                    "runtimePolicy": {
                        "join": {"mode": "all", "mergeStrategy": "append"}
                    },
                },
                {"id": "output", "type": "output", "name": "Output", "config": {}},
            ],
            "edges": [
                {"id": "e1", "sourceNodeId": "trigger", "targetNodeId": "planner"},
                {"id": "e2", "sourceNodeId": "trigger", "targetNodeId": "researcher"},
                {
                    "id": "e3",
                    "sourceNodeId": "planner",
                    "targetNodeId": "joiner",
                    "mapping": [{"sourceField": "topic", "targetField": "inputs.topics"}],
                },
                {
                    "id": "e4",
                    "sourceNodeId": "researcher",
                    "targetNodeId": "joiner",
                    "mapping": [{"sourceField": "topic", "targetField": "inputs.topics"}],
                },
                {"id": "e5", "sourceNodeId": "joiner", "targetNodeId": "output"},
            ],
        },
    )
    sqlite_session.add(workflow)
    sqlite_session.commit()

    artifacts = RuntimeService().execute_workflow(sqlite_session, workflow, {"topic": "append"})

    assert artifacts.run.status == "succeeded"
    joiner_run = next(node_run for node_run in artifacts.node_runs if node_run.node_id == "joiner")
    assert joiner_run.input_payload["join"]["mergeStrategy"] == "append"
    assert joiner_run.input_payload["inputs"]["topics"] == ["plan", "facts"]


def test_runtime_service_rejects_conflicting_mapped_values_without_merge_strategy(
    sqlite_session: Session,
) -> None:
    workflow = Workflow(
        id="wf-edge-mapping-conflict",
        name="Edge Mapping Conflict Workflow",
        version="0.1.0",
        status="draft",
        definition={
            "nodes": [
                {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
                {
                    "id": "planner",
                    "type": "tool",
                    "name": "Planner",
                    "config": {"mock_output": {"topic": "plan"}},
                },
                {
                    "id": "researcher",
                    "type": "tool",
                    "name": "Researcher",
                    "config": {"mock_output": {"topic": "facts"}},
                },
                {
                    "id": "joiner",
                    "type": "tool",
                    "name": "Joiner",
                    "config": {},
                    "runtimePolicy": {"join": {"mode": "all"}},
                },
                {"id": "output", "type": "output", "name": "Output", "config": {}},
            ],
            "edges": [
                {"id": "e1", "sourceNodeId": "trigger", "targetNodeId": "planner"},
                {"id": "e2", "sourceNodeId": "trigger", "targetNodeId": "researcher"},
                {
                    "id": "e3",
                    "sourceNodeId": "planner",
                    "targetNodeId": "joiner",
                    "mapping": [{"sourceField": "topic", "targetField": "inputs.topic"}],
                },
                {
                    "id": "e4",
                    "sourceNodeId": "researcher",
                    "targetNodeId": "joiner",
                    "mapping": [{"sourceField": "topic", "targetField": "inputs.topic"}],
                },
                {"id": "e5", "sourceNodeId": "joiner", "targetNodeId": "output"},
            ],
        },
    )
    sqlite_session.add(workflow)
    sqlite_session.commit()

    with pytest.raises(WorkflowExecutionError, match="conflicting field mapping"):
        RuntimeService().execute_workflow(sqlite_session, workflow, {"topic": "conflict"})


def test_runtime_service_executes_join_all_after_all_required_sources_arrive(
    sqlite_session: Session,
) -> None:
    workflow = Workflow(
        id="wf-join-all-success",
        name="Join All Workflow",
        version="0.1.0",
        status="draft",
        definition={
            "nodes": [
                {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
                {
                    "id": "planner",
                    "type": "tool",
                    "name": "Planner",
                    "config": {"mock_output": {"plan": "outline"}},
                },
                {
                    "id": "researcher",
                    "type": "tool",
                    "name": "Researcher",
                    "config": {"mock_output": {"facts": ["a", "b"]}},
                },
                {
                    "id": "joiner",
                    "type": "tool",
                    "name": "Joiner",
                    "config": {"mock_output": {"answer": "combined"}},
                    "runtimePolicy": {"join": {"mode": "all"}},
                },
                {"id": "output", "type": "output", "name": "Output", "config": {}},
            ],
            "edges": [
                {"id": "e1", "sourceNodeId": "trigger", "targetNodeId": "planner"},
                {"id": "e2", "sourceNodeId": "trigger", "targetNodeId": "researcher"},
                {"id": "e3", "sourceNodeId": "planner", "targetNodeId": "joiner"},
                {"id": "e4", "sourceNodeId": "researcher", "targetNodeId": "joiner"},
                {"id": "e5", "sourceNodeId": "joiner", "targetNodeId": "output"},
            ],
        },
    )
    sqlite_session.add(workflow)
    sqlite_session.commit()

    artifacts = RuntimeService().execute_workflow(sqlite_session, workflow, {"topic": "join"})

    assert artifacts.run.status == "succeeded"
    assert artifacts.run.output_payload == {"joiner": {"answer": "combined"}}
    joiner_run = next(node_run for node_run in artifacts.node_runs if node_run.node_id == "joiner")
    assert joiner_run.input_payload["join"] == {
        "mode": "all",
        "onUnmet": "skip",
        "mergeStrategy": "error",
        "expectedSourceIds": ["planner", "researcher"],
        "activatedSourceIds": ["planner", "researcher"],
        "missingSourceIds": [],
    }
    assert [event.event_type for event in artifacts.events].count("node.join.ready") == 1


def test_runtime_service_blocks_when_join_all_missing_required_source_and_fail_policy(
    sqlite_session: Session,
) -> None:
    workflow = Workflow(
        id="wf-join-all-fail",
        name="Join All Fail Workflow",
        version="0.1.0",
        status="draft",
        definition={
            "nodes": [
                {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
                {
                    "id": "branch",
                    "type": "router",
                    "name": "Branch",
                    "config": {"selected": "planner"},
                },
                {
                    "id": "planner",
                    "type": "tool",
                    "name": "Planner",
                    "config": {"mock_output": {"plan": "outline"}},
                },
                {
                    "id": "researcher",
                    "type": "tool",
                    "name": "Researcher",
                    "config": {"mock_output": {"facts": ["a", "b"]}},
                },
                {
                    "id": "joiner",
                    "type": "tool",
                    "name": "Joiner",
                    "config": {"mock_output": {"answer": "combined"}},
                    "runtimePolicy": {"join": {"mode": "all", "onUnmet": "fail"}},
                },
                {"id": "output", "type": "output", "name": "Output", "config": {}},
            ],
            "edges": [
                {"id": "e1", "sourceNodeId": "trigger", "targetNodeId": "branch"},
                {
                    "id": "e2",
                    "sourceNodeId": "branch",
                    "targetNodeId": "planner",
                    "condition": "planner",
                },
                {
                    "id": "e3",
                    "sourceNodeId": "branch",
                    "targetNodeId": "researcher",
                    "condition": "researcher",
                },
                {"id": "e4", "sourceNodeId": "planner", "targetNodeId": "joiner"},
                {"id": "e5", "sourceNodeId": "researcher", "targetNodeId": "joiner"},
                {"id": "e6", "sourceNodeId": "joiner", "targetNodeId": "output"},
            ],
        },
    )
    sqlite_session.add(workflow)
    sqlite_session.commit()

    service = RuntimeService()
    with pytest.raises(
        WorkflowExecutionError,
        match="Missing required upstream nodes: researcher",
    ):
        service.execute_workflow(sqlite_session, workflow, {"topic": "join fail"})

    persisted_run = service.list_workflow_runs(sqlite_session, workflow.id)[0]
    artifacts = service.load_run(sqlite_session, persisted_run.id)
    assert artifacts is not None
    assert artifacts.run.status == "failed"
    joiner_run = next(node_run for node_run in artifacts.node_runs if node_run.node_id == "joiner")
    assert joiner_run.status == "blocked"
    assert "researcher" in (joiner_run.error_message or "")
    assert [event.event_type for event in artifacts.events].count("node.join.unmet") == 1


def test_runtime_service_can_continue_through_failure_branch(sqlite_session: Session) -> None:
    workflow = Workflow(
        id="wf-failure-branch",
        name="Failure Branch Workflow",
        version="0.1.0",
        status="draft",
        definition={
            "nodes": [
                {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
                {
                    "id": "explode",
                    "type": "tool",
                    "name": "Explode",
                    "config": {"mock_error": "boom"},
                },
                {
                    "id": "success_path",
                    "type": "tool",
                    "name": "Success Path",
                    "config": {"mock_output": {"answer": "unexpected"}},
                },
                {
                    "id": "fallback",
                    "type": "tool",
                    "name": "Fallback",
                    "config": {"mock_output": {"answer": "recovered"}},
                },
                {"id": "output", "type": "output", "name": "Output", "config": {}},
            ],
            "edges": [
                {"id": "e1", "sourceNodeId": "trigger", "targetNodeId": "explode"},
                {"id": "e2", "sourceNodeId": "explode", "targetNodeId": "success_path"},
                {
                    "id": "e3",
                    "sourceNodeId": "explode",
                    "targetNodeId": "fallback",
                    "condition": "failed",
                },
                {"id": "e4", "sourceNodeId": "success_path", "targetNodeId": "output"},
                {"id": "e5", "sourceNodeId": "fallback", "targetNodeId": "output"},
            ],
        },
    )
    sqlite_session.add(workflow)
    sqlite_session.commit()

    artifacts = RuntimeService().execute_workflow(sqlite_session, workflow, {"topic": "errors"})

    assert artifacts.run.status == "succeeded"
    assert artifacts.run.output_payload == {"fallback": {"answer": "recovered"}}
    assert {node_run.node_id: node_run.status for node_run in artifacts.node_runs} == {
        "trigger": "succeeded",
        "explode": "failed",
        "success_path": "skipped",
        "fallback": "succeeded",
        "output": "succeeded",
    }
    assert [event.event_type for event in artifacts.events].count("node.failed") == 1
    assert artifacts.run.error_message is None


def test_runtime_service_retries_node_before_succeeding(sqlite_session: Session) -> None:
    workflow = Workflow(
        id="wf-retry-success",
        name="Retry Success Workflow",
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
                            "backoffSeconds": 0,
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
    sqlite_session.add(workflow)
    sqlite_session.commit()

    artifacts = RuntimeService().execute_workflow(sqlite_session, workflow, {"topic": "retry"})

    assert artifacts.run.status == "succeeded"
    assert artifacts.run.output_payload == {"flaky_tool": {"answer": "recovered"}}
    assert {node_run.node_id: node_run.status for node_run in artifacts.node_runs} == {
        "trigger": "succeeded",
        "flaky_tool": "succeeded",
        "output": "succeeded",
    }
    flaky_tool_run = next(
        node_run for node_run in artifacts.node_runs if node_run.node_id == "flaky_tool"
    )
    assert flaky_tool_run.input_payload["attempt"] == {"current": 2, "max": 2}
    assert [event.event_type for event in artifacts.events].count("node.retrying") == 1
    assert "node.failed" not in [event.event_type for event in artifacts.events]


def test_runtime_service_routes_to_failure_branch_after_retries_exhausted(
    sqlite_session: Session,
) -> None:
    workflow = Workflow(
        id="wf-retry-failure-branch",
        name="Retry Failure Branch Workflow",
        version="0.1.0",
        status="draft",
        definition={
            "nodes": [
                {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
                {
                    "id": "explode",
                    "type": "tool",
                    "name": "Explode",
                    "config": {"mock_error": "boom"},
                    "runtimePolicy": {
                        "retry": {
                            "maxAttempts": 3,
                            "backoffSeconds": 0,
                        }
                    },
                },
                {
                    "id": "fallback",
                    "type": "tool",
                    "name": "Fallback",
                    "config": {"mock_output": {"answer": "recovered after retries"}},
                },
                {"id": "output", "type": "output", "name": "Output", "config": {}},
            ],
            "edges": [
                {"id": "e1", "sourceNodeId": "trigger", "targetNodeId": "explode"},
                {
                    "id": "e2",
                    "sourceNodeId": "explode",
                    "targetNodeId": "fallback",
                    "condition": "failed",
                },
                {"id": "e3", "sourceNodeId": "fallback", "targetNodeId": "output"},
            ],
        },
    )
    sqlite_session.add(workflow)
    sqlite_session.commit()

    artifacts = RuntimeService().execute_workflow(
        sqlite_session,
        workflow,
        {"topic": "retry failure"},
    )

    assert artifacts.run.status == "succeeded"
    assert artifacts.run.output_payload == {"fallback": {"answer": "recovered after retries"}}
    assert {node_run.node_id: node_run.status for node_run in artifacts.node_runs} == {
        "trigger": "succeeded",
        "explode": "failed",
        "fallback": "succeeded",
        "output": "succeeded",
    }
    assert [event.event_type for event in artifacts.events].count("node.retrying") == 2
    assert [event.event_type for event in artifacts.events].count("node.failed") == 1


def test_runtime_service_injects_authorized_context_and_executes_mcp_query(
    sqlite_session: Session,
) -> None:
    workflow = Workflow(
        id="wf-mcp-query",
        name="MCP Query Workflow",
        version="0.1.0",
        status="draft",
        definition={
            "nodes": [
                {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
                {
                    "id": "planner",
                    "type": "tool",
                    "name": "Planner",
                    "config": {"mock_output": {"plan": "collect facts"}},
                },
                {
                    "id": "search",
                    "type": "tool",
                    "name": "Search",
                    "config": {"mock_output": {"docs": ["a", "b"]}},
                },
                {
                    "id": "reader",
                    "type": "mcp_query",
                    "name": "Reader",
                    "config": {
                        "contextAccess": {
                            "readableNodeIds": ["planner"],
                            "readableArtifacts": [
                                {"nodeId": "search", "artifactType": "json"},
                            ],
                        },
                        "query": {
                            "type": "authorized_context",
                            "sourceNodeIds": ["planner", "search"],
                            "artifactTypes": ["json"],
                        },
                    },
                },
                {"id": "output", "type": "output", "name": "Output", "config": {}},
            ],
            "edges": [
                {"id": "e1", "sourceNodeId": "trigger", "targetNodeId": "planner"},
                {"id": "e2", "sourceNodeId": "planner", "targetNodeId": "search"},
                {"id": "e3", "sourceNodeId": "search", "targetNodeId": "reader"},
                {"id": "e4", "sourceNodeId": "reader", "targetNodeId": "output"},
            ],
        },
    )
    sqlite_session.add(workflow)
    sqlite_session.commit()

    artifacts = RuntimeService().execute_workflow(sqlite_session, workflow, {"topic": "mcp"})

    assert artifacts.run.status == "succeeded"
    assert artifacts.run.output_payload == {
        "reader": {
            "query": {
                "type": "authorized_context",
                "sourceNodeIds": ["planner", "search"],
                "artifactTypes": ["json"],
            },
            "results": [
                {"nodeId": "planner", "artifactType": "json", "content": {"plan": "collect facts"}},
                {"nodeId": "search", "artifactType": "json", "content": {"docs": ["a", "b"]}},
            ],
        }
    }
    reader_run = next(node_run for node_run in artifacts.node_runs if node_run.node_id == "reader")
    assert reader_run.input_payload["authorized_context"] == {
        "currentNodeId": "reader",
        "readableNodeIds": ["planner", "search"],
        "readableArtifacts": [
            {"nodeId": "planner", "artifactType": "json"},
            {"nodeId": "search", "artifactType": "json"},
        ],
    }
    assert [event.event_type for event in artifacts.events].count("node.context.read") == 1


def test_runtime_service_rejects_unauthorized_mcp_query_source(sqlite_session: Session) -> None:
    workflow = Workflow(
        id="wf-mcp-query-unauthorized",
        name="Unauthorized MCP Query Workflow",
        version="0.1.0",
        status="draft",
        definition={
            "nodes": [
                {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
                {
                    "id": "planner",
                    "type": "tool",
                    "name": "Planner",
                    "config": {"mock_output": {"plan": "collect facts"}},
                },
                {
                    "id": "reader",
                    "type": "mcp_query",
                    "name": "Reader",
                    "config": {
                        "contextAccess": {
                            "readableNodeIds": ["planner"],
                        },
                        "query": {
                            "type": "authorized_context",
                            "sourceNodeIds": ["planner", "search"],
                            "artifactTypes": ["json"],
                        },
                    },
                },
                {"id": "output", "type": "output", "name": "Output", "config": {}},
            ],
            "edges": [
                {"id": "e1", "sourceNodeId": "trigger", "targetNodeId": "planner"},
                {"id": "e2", "sourceNodeId": "planner", "targetNodeId": "reader"},
                {"id": "e3", "sourceNodeId": "reader", "targetNodeId": "output"},
            ],
        },
    )
    sqlite_session.add(workflow)
    sqlite_session.commit()

    with pytest.raises(WorkflowExecutionError, match="missing source node 'search'"):
        RuntimeService().execute_workflow(sqlite_session, workflow, {"topic": "mcp"})


def test_runtime_service_rejects_loop_nodes(sqlite_session: Session) -> None:
    workflow = Workflow(
        id="wf-loop",
        name="Loop Workflow",
        version="0.1.0",
        status="draft",
        definition={
            "nodes": [{"id": "loop", "type": "loop", "name": "Loop", "config": {}}],
            "edges": [],
        },
    )
    sqlite_session.add(workflow)
    sqlite_session.commit()

    service = RuntimeService()

    with pytest.raises(WorkflowExecutionError):
        service.execute_workflow(sqlite_session, workflow, {})


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

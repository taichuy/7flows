from datetime import UTC, datetime

from app.models.run import NodeRun, Run
from app.services.operator_run_follow_up import build_operator_run_follow_up_summary


def test_build_operator_run_follow_up_summary_counts_all_affected_runs(
    sqlite_session,
    sample_workflow,
):
    runs = [
        Run(
            id="run-follow-up-waiting",
            workflow_id=sample_workflow.id,
            workflow_version=sample_workflow.version,
            compiled_blueprint_id=None,
            status="waiting",
            current_node_id="mock_tool",
            input_payload={},
            checkpoint_payload={},
            created_at=datetime.now(UTC),
        ),
        Run(
            id="run-follow-up-running",
            workflow_id=sample_workflow.id,
            workflow_version=sample_workflow.version,
            compiled_blueprint_id=None,
            status="running",
            current_node_id="mock_tool",
            input_payload={},
            checkpoint_payload={},
            created_at=datetime.now(UTC),
        ),
        Run(
            id="run-follow-up-succeeded",
            workflow_id=sample_workflow.id,
            workflow_version=sample_workflow.version,
            compiled_blueprint_id=None,
            status="succeeded",
            current_node_id="output",
            input_payload={},
            checkpoint_payload={},
            created_at=datetime.now(UTC),
        ),
        Run(
            id="run-follow-up-failed",
            workflow_id=sample_workflow.id,
            workflow_version=sample_workflow.version,
            compiled_blueprint_id=None,
            status="failed",
            current_node_id="mock_tool",
            input_payload={},
            checkpoint_payload={},
            created_at=datetime.now(UTC),
        ),
    ]
    sqlite_session.add_all(runs)
    sqlite_session.add_all(
        [
            NodeRun(
                id="node-run-follow-up-waiting",
                run_id="run-follow-up-waiting",
                node_id="mock_tool",
                node_name="Mock Tool",
                node_type="tool",
                status="waiting",
                phase="waiting",
                input_payload={},
                checkpoint_payload={},
                working_context={},
                waiting_reason="waiting approval",
                created_at=datetime.now(UTC),
            ),
            NodeRun(
                id="node-run-follow-up-running",
                run_id="run-follow-up-running",
                node_id="mock_tool",
                node_name="Mock Tool",
                node_type="tool",
                status="running",
                phase="executing",
                input_payload={},
                checkpoint_payload={},
                working_context={},
                created_at=datetime.now(UTC),
            ),
            NodeRun(
                id="node-run-follow-up-succeeded",
                run_id="run-follow-up-succeeded",
                node_id="output",
                node_name="Output",
                node_type="output",
                status="succeeded",
                phase="completed",
                input_payload={},
                checkpoint_payload={},
                working_context={},
                finished_at=datetime.now(UTC),
                created_at=datetime.now(UTC),
            ),
            NodeRun(
                id="node-run-follow-up-failed",
                run_id="run-follow-up-failed",
                node_id="mock_tool",
                node_name="Mock Tool",
                node_type="tool",
                status="failed",
                phase="failed",
                input_payload={},
                checkpoint_payload={},
                working_context={},
                finished_at=datetime.now(UTC),
                created_at=datetime.now(UTC),
            ),
        ]
    )
    sqlite_session.commit()

    summary = build_operator_run_follow_up_summary(
        sqlite_session,
        [run.id for run in runs],
        sample_limit=3,
    )

    assert summary.affected_run_count == 4
    assert summary.sampled_run_count == 3
    assert summary.waiting_run_count == 1
    assert summary.running_run_count == 1
    assert summary.succeeded_run_count == 1
    assert summary.failed_run_count == 1
    assert summary.unknown_run_count == 0
    assert [item.run_id for item in summary.sampled_runs] == [
        "run-follow-up-waiting",
        "run-follow-up-running",
        "run-follow-up-succeeded",
    ]
    assert summary.sampled_runs[0].snapshot is not None
    assert summary.sampled_runs[0].snapshot.waiting_reason == "waiting approval"


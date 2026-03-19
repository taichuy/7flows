from datetime import UTC, datetime

from app.models.run import NodeRun, Run, RunArtifact, RunEvent, ToolCallRecord
from app.services.callback_waiting_lifecycle import (
    build_callback_waiting_scheduled_resume,
    record_callback_resume_schedule,
    record_callback_ticket_issued,
)
from app.services.operator_run_follow_up import (
    build_operator_run_follow_up_summary,
    load_operator_run_snapshot,
)


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
    assert summary.sampled_runs[0].snapshot.execution_focus_reason == "blocking_node_run"
    assert summary.sampled_runs[0].snapshot.execution_focus_node_id == "mock_tool"
    assert summary.sampled_runs[0].snapshot.execution_focus_node_run_id == (
        "node-run-follow-up-waiting"
    )
    assert summary.sampled_runs[0].snapshot.execution_focus_explanation.model_dump() == {
        "primary_signal": "等待原因：waiting approval",
        "follow_up": (
            "下一步：优先沿 waiting / callback 事实链排查，不要只盯单次 invocation 返回。"
        ),
    }
    assert summary.explanation is not None
    assert summary.explanation.model_dump() == {
        "primary_signal": (
            "本次影响 4 个 run；整体状态分布：waiting 1、running 1、succeeded 1、failed 1。"
            "已回读 3 个样本。"
        ),
        "follow_up": (
            "run run-follow-up-waiting：当前 run 状态：waiting。 当前节点：mock_tool。 "
            "重点信号：等待原因：waiting approval 后续动作："
            "下一步：优先沿 waiting / callback 事实链排查，"
            "不要只盯单次 invocation 返回。 "
            "run run-follow-up-running：当前 run 状态：running。 当前节点：mock_tool。 "
            "run run-follow-up-succeeded：当前 run 状态：succeeded。 当前节点：output。 "
            "其余 1 个 run 可继续到对应 run detail / inbox slice 查看后续推进。"
        ),
    }


def test_load_operator_run_snapshot_surfaces_execution_fallback_focus(
    sqlite_session,
    sample_workflow,
):
    run = Run(
        id="run-follow-up-fallback",
        workflow_id=sample_workflow.id,
        workflow_version=sample_workflow.version,
        compiled_blueprint_id=None,
        status="succeeded",
        current_node_id=None,
        input_payload={},
        checkpoint_payload={},
        created_at=datetime.now(UTC),
    )
    node_run = NodeRun(
        id="node-run-follow-up-fallback",
        run_id=run.id,
        node_id="mock_tool",
        node_name="Mock Tool",
        node_type="tool",
        status="succeeded",
        phase="completed",
        input_payload={},
        checkpoint_payload={},
        working_context={},
        finished_at=datetime.now(UTC),
        created_at=datetime.now(UTC),
    )
    sqlite_session.add_all(
        [
            run,
            node_run,
            RunEvent(
                run_id=run.id,
                node_run_id=node_run.id,
                event_type="tool.execution.fallback",
                payload={
                    "node_id": node_run.node_id,
                    "requested_execution_class": "microvm",
                    "effective_execution_class": "inline",
                    "executor_ref": "runtime:inline-fallback:microvm",
                    "reason": "execution_class_not_implemented_for_node_type",
                },
                created_at=datetime.now(UTC),
            ),
        ]
    )
    sqlite_session.commit()

    snapshot = load_operator_run_snapshot(sqlite_session, run.id)

    assert snapshot is not None
    assert snapshot.workflow_id == sample_workflow.id
    assert snapshot.status == "succeeded"
    assert snapshot.current_node_id is None
    assert snapshot.waiting_reason is None
    assert snapshot.execution_focus_reason == "fallback_node"
    assert snapshot.execution_focus_node_id == "mock_tool"
    assert snapshot.execution_focus_node_run_id == "node-run-follow-up-fallback"
    assert snapshot.execution_focus_explanation.model_dump() == {
        "primary_signal": (
            "执行降级：当前节点尚未实现请求的 execution class，已临时回退到 inline。"
        ),
        "follow_up": (
            "下一步：如果这条节点需要受控执行或强隔离，应补齐对应 execution adapter；"
            "不要把当前 fallback 当成长期默认。"
        ),
    }


def test_load_operator_run_snapshot_surfaces_focus_evidence_samples(
    sqlite_session,
    sample_workflow,
):
    now = datetime.now(UTC)
    run = Run(
        id="run-follow-up-evidence",
        workflow_id=sample_workflow.id,
        workflow_version=sample_workflow.version,
        compiled_blueprint_id=None,
        status="succeeded",
        current_node_id="mock_tool",
        input_payload={},
        checkpoint_payload={},
        created_at=now,
    )
    artifact = RunArtifact(
        id="artifact-follow-up-evidence",
        run_id=run.id,
        node_run_id="node-run-follow-up-evidence",
        artifact_kind="tool_result",
        content_type="application/json",
        summary="sandbox tool raw payload",
        metadata_payload={},
        created_at=now,
    )
    node_run = NodeRun(
        id="node-run-follow-up-evidence",
        run_id=run.id,
        node_id="mock_tool",
        node_name="Mock Tool",
        node_type="tool",
        status="succeeded",
        phase="completed",
        input_payload={},
        checkpoint_payload={},
        working_context={},
        artifact_refs=[f"artifact://{artifact.id}"],
        finished_at=now,
        created_at=now,
    )
    tool_call = ToolCallRecord(
        id="tool-call-follow-up-evidence",
        run_id=run.id,
        node_run_id=node_run.id,
        tool_id="mock_tool",
        tool_name="Mock Tool",
        phase="execute",
        status="succeeded",
        request_summary="call tool",
        execution_trace={
            "effective_execution_class": "microvm",
            "sandbox_backend_id": "sandbox-default",
            "sandbox_runner_kind": "container",
        },
        response_summary="tool completed",
        response_content_type="application/json",
        response_meta={},
        raw_artifact_id=artifact.id,
        created_at=now,
        finished_at=now,
    )
    sqlite_session.add_all([run, artifact, node_run, tool_call])
    sqlite_session.add(
        RunEvent(
            run_id=run.id,
            node_run_id=node_run.id,
            event_type="tool.execution.dispatched",
            payload={
                "node_id": node_run.node_id,
                "requested_execution_class": "microvm",
                "effective_execution_class": "microvm",
                "executor_ref": "tool:compat-adapter:dify-default",
                "sandbox_backend_id": "sandbox-default",
                "sandbox_runner_kind": "container",
            },
            created_at=now,
        )
    )
    sqlite_session.add(
        RunEvent(
            run_id=run.id,
            node_run_id=node_run.id,
            event_type="agent.skill.references.loaded",
            payload={
                "node_id": node_run.node_id,
                "phase": "main_plan",
                "references": [
                    {
                        "skill_id": "skill-research-brief",
                        "skill_name": "Research Brief",
                        "reference_id": "ref-handoff",
                        "reference_name": "Operator Handoff",
                        "load_source": "skill_binding",
                        "retrieval_http_path": (
                            "/api/skills/skill-research-brief/references/ref-handoff"
                            "?workspace_id=default"
                        ),
                        "retrieval_mcp_method": "skills.get_reference",
                        "retrieval_mcp_params": {
                            "skill_id": "skill-research-brief",
                            "reference_id": "ref-handoff",
                            "workspace_id": "default",
                        },
                    },
                    {
                        "skill_id": "skill-research-brief",
                        "skill_name": "Research Brief",
                        "reference_id": "ref-budget",
                        "reference_name": "Budget Control",
                        "load_source": "retrieval_query_match",
                        "fetch_reason": "Matched query terms: budget, guardrails",
                        "retrieval_http_path": (
                            "/api/skills/skill-research-brief/references/ref-budget"
                            "?workspace_id=default"
                        ),
                        "retrieval_mcp_method": "skills.get_reference",
                        "retrieval_mcp_params": {
                            "skill_id": "skill-research-brief",
                            "reference_id": "ref-budget",
                            "workspace_id": "default",
                        },
                    },
                ],
            },
            created_at=now,
        )
    )
    sqlite_session.commit()

    snapshot = load_operator_run_snapshot(sqlite_session, run.id)

    assert snapshot is not None
    assert snapshot.execution_focus_node_name == "Mock Tool"
    assert snapshot.execution_focus_node_type == "tool"
    assert snapshot.execution_focus_artifact_count == 1
    assert snapshot.execution_focus_artifact_ref_count == 1
    assert snapshot.execution_focus_tool_call_count == 1
    assert snapshot.execution_focus_raw_ref_count == 1
    assert snapshot.execution_focus_artifact_refs == [f"artifact://{artifact.id}"]
    assert snapshot.execution_focus_artifacts[0].model_dump() == {
        "artifact_kind": "tool_result",
        "content_type": "application/json",
        "summary": "sandbox tool raw payload",
        "uri": f"artifact://{artifact.id}",
    }
    assert snapshot.execution_focus_tool_calls[0].model_dump() == {
        "id": tool_call.id,
        "tool_id": "mock_tool",
        "tool_name": "Mock Tool",
        "phase": "execute",
        "status": "succeeded",
        "effective_execution_class": "microvm",
        "execution_sandbox_backend_id": "sandbox-default",
        "execution_sandbox_runner_kind": "container",
        "execution_blocking_reason": None,
        "execution_fallback_reason": None,
        "response_summary": "tool completed",
        "response_content_type": "application/json",
        "raw_ref": f"artifact://{artifact.id}",
    }
    assert snapshot.execution_focus_skill_trace is not None
    assert snapshot.execution_focus_skill_trace.model_dump() == {
        "reference_count": 2,
        "phase_counts": {"main_plan": 2},
        "source_counts": {
            "retrieval_query_match": 1,
            "skill_binding": 1,
        },
        "loads": [
            {
                "phase": "main_plan",
                "references": [
                    {
                        "skill_id": "skill-research-brief",
                        "skill_name": "Research Brief",
                        "reference_id": "ref-handoff",
                        "reference_name": "Operator Handoff",
                        "load_source": "skill_binding",
                        "fetch_reason": None,
                        "fetch_request_index": None,
                        "fetch_request_total": None,
                        "retrieval_http_path": (
                            "/api/skills/skill-research-brief/"
                            "references/ref-handoff?workspace_id=default"
                        ),
                        "retrieval_mcp_method": "skills.get_reference",
                        "retrieval_mcp_params": {
                            "skill_id": "skill-research-brief",
                            "reference_id": "ref-handoff",
                            "workspace_id": "default",
                        },
                    },
                    {
                        "skill_id": "skill-research-brief",
                        "skill_name": "Research Brief",
                        "reference_id": "ref-budget",
                        "reference_name": "Budget Control",
                        "load_source": "retrieval_query_match",
                        "fetch_reason": "Matched query terms: budget, guardrails",
                        "fetch_request_index": None,
                        "fetch_request_total": None,
                        "retrieval_http_path": (
                            "/api/skills/skill-research-brief/"
                            "references/ref-budget?workspace_id=default"
                        ),
                        "retrieval_mcp_method": "skills.get_reference",
                        "retrieval_mcp_params": {
                            "skill_id": "skill-research-brief",
                            "reference_id": "ref-budget",
                            "workspace_id": "default",
                        },
                    },
                ],
            }
        ],
    }


def test_load_operator_run_snapshot_prefers_callback_waiting_explanation(
    sqlite_session,
    sample_workflow,
):
    scheduled_at = datetime(2026, 3, 20, 10, 0, tzinfo=UTC)
    checkpoint_payload = record_callback_ticket_issued(
        {},
        reason="Waiting for external callback",
        issued_at=scheduled_at,
    )
    checkpoint_payload = record_callback_resume_schedule(
        checkpoint_payload,
        delay_seconds=30,
        reason="callback pending",
        source="callback_ticket_monitor",
        backoff_attempt=1,
    )
    checkpoint_payload = {
        **checkpoint_payload,
        "scheduled_resume": build_callback_waiting_scheduled_resume(
            delay_seconds=30,
            reason="callback pending",
            source="callback_ticket_monitor",
            waiting_status="waiting_callback",
            backoff_attempt=1,
            scheduled_at=scheduled_at,
        ),
    }

    run = Run(
        id="run-follow-up-callback-waiting",
        workflow_id=sample_workflow.id,
        workflow_version=sample_workflow.version,
        compiled_blueprint_id=None,
        status="waiting",
        current_node_id="mock_tool",
        input_payload={},
        checkpoint_payload={},
        created_at=datetime.now(UTC),
    )
    node_run = NodeRun(
        id="node-run-follow-up-callback-waiting",
        run_id=run.id,
        node_id="mock_tool",
        node_name="Mock Tool",
        node_type="tool",
        status="waiting",
        phase="waiting",
        input_payload={},
        checkpoint_payload=checkpoint_payload,
        working_context={},
        waiting_reason="Waiting for callback",
        created_at=datetime.now(UTC),
    )
    sqlite_session.add_all([run, node_run])
    sqlite_session.commit()

    summary = build_operator_run_follow_up_summary(sqlite_session, [run.id])

    snapshot = summary.sampled_runs[0].snapshot
    assert snapshot is not None
    assert snapshot.execution_focus_explanation is not None
    assert snapshot.execution_focus_explanation.model_dump() == {
        "primary_signal": "等待原因：Waiting for callback",
        "follow_up": (
            "下一步：当前节点已安排自动 resume（30.0s），预计在 2026-03-20T10:00:30Z 左右触发，"
            "优先观察调度补偿是否恢复。"
        ),
    }
    assert snapshot.callback_waiting_explanation is not None
    assert snapshot.callback_waiting_explanation.model_dump() == {
        "primary_signal": "系统已经安排 30s 后再次尝试恢复 callback waiting。",
        "follow_up": (
            "下一步：先观察自动恢复链路；只有在需要绕过当前 backoff 时，再手动 resume 或 cleanup。"
        ),
    }
    assert summary.explanation is not None
    assert summary.explanation.model_dump() == {
        "primary_signal": "本次影响 1 个 run；整体状态分布：waiting 1。已回读 1 个样本。",
        "follow_up": (
            "run run-follow-up-callback-waiting：当前 run 状态：waiting。 当前节点：mock_tool。 "
            "重点信号：系统已经安排 30s 后再次尝试恢复 callback waiting。 "
            "后续动作：下一步：先观察自动恢复链路；"
            "只有在需要绕过当前 backoff 时，再手动 resume 或 cleanup。"
        ),
    }

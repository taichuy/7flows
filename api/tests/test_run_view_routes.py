from datetime import UTC, datetime

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.run import (
    AICallRecord,
    NodeRun,
    Run,
    RunArtifact,
    RunCallbackTicket,
    RunEvent,
    ToolCallRecord,
)
from app.models.sensitive_access import (
    ApprovalTicketRecord,
    NotificationDispatchRecord,
    SensitiveAccessRequestRecord,
    SensitiveResourceRecord,
)
from app.models.workflow import Workflow


def test_get_run_execution_view_returns_grouped_runtime_facts(
    client: TestClient,
    sqlite_session: Session,
    sample_workflow: Workflow,
) -> None:
    run = Run(
        id="run-execution-view",
        workflow_id=sample_workflow.id,
        workflow_version=sample_workflow.version,
        compiled_blueprint_id="bp-execution-view",
        status="waiting",
        input_payload={"message": "inspect execution"},
        created_at=datetime(2026, 3, 11, 10, 0, tzinfo=UTC),
    )
    node_run = NodeRun(
        id="node-run-agent",
        run_id=run.id,
        node_id="agent_plan",
        node_name="Agent Plan",
        node_type="llm_agent",
        status="waiting_callback",
        phase="waiting_callback",
        retry_count=1,
        checkpoint_payload={
            "callback_waiting_lifecycle": {
                "wait_cycle_count": 2,
                "issued_ticket_count": 2,
                "expired_ticket_count": 1,
                "consumed_ticket_count": 0,
                "canceled_ticket_count": 0,
                "late_callback_count": 1,
                "resume_schedule_count": 1,
                "last_ticket_status": "pending",
                "last_ticket_reason": "search callback pending",
                "last_ticket_updated_at": "2026-03-11T10:01:00Z",
                "last_late_callback_status": "expired",
                "last_late_callback_reason": "callback_ticket_expired",
                "last_late_callback_at": "2026-03-11T10:05:00Z",
                "last_resume_delay_seconds": 5.0,
                "last_resume_reason": "search callback pending",
                "last_resume_source": "callback_ticket_monitor",
                "last_resume_backoff_attempt": 2,
            },
            "scheduled_resume": {
                "delay_seconds": 0,
                "reason": "search callback pending",
                "source": "callback_ticket_monitor",
                "waiting_status": "waiting_callback",
                "backoff_attempt": 2,
                "scheduled_at": "2026-03-11T10:05:00Z",
                "due_at": "2026-03-11T10:05:00Z",
            },
        },
        artifact_refs=["artifact://artifact-tool", "artifact://artifact-evidence"],
        waiting_reason="Waiting for external search callback.",
        started_at=datetime(2026, 3, 11, 10, 0, tzinfo=UTC),
        phase_started_at=datetime(2026, 3, 11, 10, 1, tzinfo=UTC),
        created_at=datetime(2026, 3, 11, 10, 0, tzinfo=UTC),
    )
    sqlite_session.add_all(
        [
            run,
            node_run,
            RunArtifact(
                id="artifact-tool",
                run_id=run.id,
                node_run_id=node_run.id,
                artifact_kind="tool_result",
                content_type="json",
                summary="Tool returned pending callback metadata.",
                payload={"status": "waiting"},
                created_at=datetime(2026, 3, 11, 10, 1, tzinfo=UTC),
            ),
            RunArtifact(
                id="artifact-evidence",
                run_id=run.id,
                node_run_id=node_run.id,
                artifact_kind="evidence_pack",
                content_type="json",
                summary="Assistant highlighted missing facts.",
                payload={"summary": "Need callback result."},
                created_at=datetime(2026, 3, 11, 10, 2, tzinfo=UTC),
            ),
            ToolCallRecord(
                id="tool-call-agent",
                run_id=run.id,
                node_run_id=node_run.id,
                tool_id="compat:dify:plugin/search",
                tool_name="search",
                phase="tool_execute",
                status="waiting",
                request_summary="Search pending callback.",
                response_summary="Waiting for callback payload.",
                raw_artifact_id="artifact-tool",
                latency_ms=1200,
                retry_count=0,
                created_at=datetime(2026, 3, 11, 10, 1, tzinfo=UTC),
            ),
            AICallRecord(
                id="ai-call-main",
                run_id=run.id,
                node_run_id=node_run.id,
                role="main_plan",
                status="succeeded",
                provider="mock-provider",
                model_id="mock-model",
                input_summary="Plan request",
                output_summary="Tool call plan",
                latency_ms=300,
                assistant=False,
                created_at=datetime(2026, 3, 11, 10, 0, tzinfo=UTC),
            ),
            AICallRecord(
                id="ai-call-assistant",
                run_id=run.id,
                node_run_id=node_run.id,
                role="assistant_distill",
                status="succeeded",
                provider="mock-provider",
                model_id="mock-model",
                input_summary="Summarize tool result",
                output_summary="Missing callback data",
                latency_ms=180,
                assistant=True,
                created_at=datetime(2026, 3, 11, 10, 2, tzinfo=UTC),
            ),
            RunCallbackTicket(
                id="ticket-agent",
                run_id=run.id,
                node_run_id=node_run.id,
                tool_call_id="tool-call-agent",
                tool_id="compat:dify:plugin/search",
                tool_call_index=0,
                waiting_status="waiting_callback",
                status="pending",
                reason="search callback pending",
                created_at=datetime(2026, 3, 11, 10, 1, tzinfo=UTC),
                expires_at=datetime(2026, 3, 12, 10, 1, tzinfo=UTC),
            ),
            SensitiveResourceRecord(
                id="resource-search-tool",
                label="Search Tool",
                description="Search adapter requires approval.",
                sensitivity_level="L3",
                source="local_capability",
                metadata_payload={"tool_id": "compat:dify:plugin/search"},
                created_at=datetime(2026, 3, 11, 9, 59, tzinfo=UTC),
                updated_at=datetime(2026, 3, 11, 9, 59, tzinfo=UTC),
            ),
            SensitiveAccessRequestRecord(
                id="access-request-agent",
                run_id=run.id,
                node_run_id=node_run.id,
                requester_type="workflow",
                requester_id=node_run.node_id,
                resource_id="resource-search-tool",
                action_type="invoke",
                purpose_text="Invoke search tool for external retrieval.",
                decision="require_approval",
                reason_code="approval_required_high_sensitive_access",
                created_at=datetime(2026, 3, 11, 10, 0, 30, tzinfo=UTC),
                decided_at=None,
            ),
            ApprovalTicketRecord(
                id="approval-ticket-agent",
                access_request_id="access-request-agent",
                run_id=run.id,
                node_run_id=node_run.id,
                status="pending",
                waiting_status="waiting",
                approved_by=None,
                decided_at=None,
                expires_at=datetime(2026, 3, 12, 10, 1, tzinfo=UTC),
                created_at=datetime(2026, 3, 11, 10, 0, 31, tzinfo=UTC),
            ),
            NotificationDispatchRecord(
                id="notification-agent",
                approval_ticket_id="approval-ticket-agent",
                channel="in_app",
                target="sensitive-access-inbox",
                status="delivered",
                delivered_at=datetime(2026, 3, 11, 10, 0, 32, tzinfo=UTC),
                error=None,
                created_at=datetime(2026, 3, 11, 10, 0, 32, tzinfo=UTC),
            ),
            RunEvent(
                run_id=run.id,
                event_type="run.started",
                payload={"input": {"message": "inspect execution"}},
                created_at=datetime(2026, 3, 11, 10, 0, tzinfo=UTC),
            ),
            RunEvent(
                run_id=run.id,
                node_run_id=node_run.id,
                event_type="tool.waiting",
                payload={"tool_id": "compat:dify:plugin/search"},
                created_at=datetime(2026, 3, 11, 10, 1, tzinfo=UTC),
            ),
            RunEvent(
                run_id=run.id,
                node_run_id=node_run.id,
                event_type="run.callback.ticket.issued",
                payload={"ticket": "ticket-agent"},
                created_at=datetime(2026, 3, 11, 10, 1, tzinfo=UTC),
            ),
        ]
    )
    sqlite_session.commit()

    response = client.get(f"/api/runs/{run.id}/execution-view")

    assert response.status_code == 200
    body = response.json()
    assert body["run_id"] == run.id
    assert body["compiled_blueprint_id"] == "bp-execution-view"
    assert body["summary"]["node_run_count"] == 1
    assert body["summary"]["waiting_node_count"] == 1
    assert body["summary"]["artifact_count"] == 2
    assert body["summary"]["tool_call_count"] == 1
    assert body["summary"]["ai_call_count"] == 2
    assert body["summary"]["assistant_call_count"] == 1
    assert body["summary"]["callback_ticket_count"] == 1
    assert body["summary"]["sensitive_access_request_count"] == 1
    assert body["summary"]["sensitive_access_approval_ticket_count"] == 1
    assert body["summary"]["sensitive_access_notification_count"] == 1
    assert body["summary"]["artifact_kind_counts"] == {
        "evidence_pack": 1,
        "tool_result": 1,
    }
    assert body["summary"]["callback_ticket_status_counts"] == {"pending": 1}
    assert body["summary"]["sensitive_access_decision_counts"] == {
        "require_approval": 1
    }
    assert body["summary"]["sensitive_access_approval_status_counts"] == {
        "pending": 1
    }
    assert body["summary"]["sensitive_access_notification_status_counts"] == {
        "delivered": 1
    }
    assert body["summary"]["callback_waiting"] == {
        "node_count": 1,
        "terminated_node_count": 0,
        "issued_ticket_count": 2,
        "expired_ticket_count": 1,
        "consumed_ticket_count": 0,
        "canceled_ticket_count": 0,
        "late_callback_count": 1,
        "resume_schedule_count": 1,
        "scheduled_resume_pending_node_count": 1,
        "scheduled_resume_requeued_node_count": 0,
        "resume_source_counts": {"callback_ticket_monitor": 1},
        "scheduled_resume_source_counts": {"callback_ticket_monitor": 1},
        "termination_reason_counts": {},
    }
    assert body["blocking_node_run_id"] == node_run.id
    assert body["execution_focus_reason"] == "blocking_node_run"
    assert body["execution_focus_node"]["node_run_id"] == node_run.id
    assert body["execution_focus_explanation"] == {
        "primary_signal": "等待原因：Waiting for external search callback.",
        "follow_up": (
            "下一步：优先处理这条 sensitive access 审批票据，"
            "再观察 waiting 节点是否恢复。"
        ),
    }
    assert body["skill_trace"] is None
    assert len(body["nodes"]) == 1
    node = body["nodes"][0]
    assert node["node_run_id"] == node_run.id
    assert node["phase"] == "waiting_callback"
    assert node["event_count"] == 2
    assert node["event_type_counts"] == {
        "run.callback.ticket.issued": 1,
        "tool.waiting": 1,
    }
    assert node["last_event_type"] == "run.callback.ticket.issued"
    assert len(node["artifacts"]) == 2
    assert len(node["tool_calls"]) == 1
    assert len(node["ai_calls"]) == 2
    assert len(node["callback_tickets"]) == 1
    assert len(node["sensitive_access_entries"]) == 1
    assert node["callback_tickets"][0]["ticket"] == "ticket-agent"
    assert node["callback_tickets"][0]["expires_at"] == "2026-03-12T10:01:00Z"
    assert node["callback_tickets"][0]["expired_at"] is None
    assert node["sensitive_access_entries"][0]["resource"]["label"] == "Search Tool"
    assert node["sensitive_access_entries"][0]["request"]["decision"] == "require_approval"
    assert (
        node["sensitive_access_entries"][0]["request"]["decision_label"]
        == "Approval required"
    )
    assert node["sensitive_access_entries"][0]["request"]["action_type"] == "invoke"
    assert (
        node["sensitive_access_entries"][0]["request"]["reason_label"]
        == "High-sensitivity access requires approval"
    )
    assert (
        node["sensitive_access_entries"][0]["request"]["policy_summary"]
        == "High-sensitivity access must be reviewed by an operator before the workflow can resume."
    )
    assert node["sensitive_access_entries"][0]["approval_ticket"]["status"] == "pending"
    assert node["sensitive_access_entries"][0]["notifications"] == [
        {
            "id": "notification-agent",
            "approval_ticket_id": "approval-ticket-agent",
            "channel": "in_app",
            "target": "sensitive-access-inbox",
            "status": "delivered",
            "delivered_at": "2026-03-11T10:00:32",
            "error": None,
            "created_at": "2026-03-11T10:00:32",
        }
    ]


    assert node["callback_waiting_lifecycle"] == {
        "wait_cycle_count": 2,
        "issued_ticket_count": 2,
        "expired_ticket_count": 1,
        "consumed_ticket_count": 0,
        "canceled_ticket_count": 0,
        "late_callback_count": 1,
        "resume_schedule_count": 1,
        "max_expired_ticket_count": 0,
        "terminated": False,
        "termination_reason": None,
        "terminated_at": None,
        "last_ticket_status": "pending",
        "last_ticket_reason": "search callback pending",
        "last_ticket_updated_at": "2026-03-11T10:01:00Z",
        "last_late_callback_status": "expired",
        "last_late_callback_reason": "callback_ticket_expired",
        "last_late_callback_at": "2026-03-11T10:05:00Z",
        "last_resume_delay_seconds": 5.0,
        "last_resume_reason": "search callback pending",
        "last_resume_source": "callback_ticket_monitor",
        "last_resume_backoff_attempt": 2,
    }
    assert node["scheduled_resume_delay_seconds"] == 0
    assert node["scheduled_resume_reason"] == "search callback pending"
    assert node["scheduled_resume_source"] == "callback_ticket_monitor"
    assert node["scheduled_waiting_status"] == "waiting_callback"
    assert node["scheduled_resume_scheduled_at"] == "2026-03-11T10:05:00Z"
    assert node["scheduled_resume_due_at"] == "2026-03-11T10:05:00Z"


def test_get_run_execution_view_includes_dependency_contract_fields(
    client: TestClient,
    sqlite_session: Session,
    sample_workflow: Workflow,
) -> None:
    run = Run(
        id="run-execution-contract",
        workflow_id=sample_workflow.id,
        workflow_version=sample_workflow.version,
        compiled_blueprint_id="bp-execution-contract",
        status="running",
        input_payload={"message": "inspect dependency contract"},
        created_at=datetime(2026, 3, 18, 9, 0, tzinfo=UTC),
    )
    node_run = NodeRun(
        id="node-run-sandbox-contract",
        run_id=run.id,
        node_id="sandbox_eval",
        node_name="Sandbox Eval",
        node_type="sandbox_code",
        status="running",
        phase="executing",
        input_payload={
            "execution": {
                "class": "sandbox",
                "source": "runtime_policy",
                "profile": "python-safe",
                "timeoutMs": 15000,
                "networkPolicy": "restricted",
                "filesystemPolicy": "ephemeral",
                "dependencyMode": "dependency_ref",
                "dependencyRef": "bundle:finance-safe-v1",
                "backendExtensions": {"mountPreset": "finance", "gpu": False},
            }
        },
        created_at=datetime(2026, 3, 18, 9, 0, tzinfo=UTC),
        started_at=datetime(2026, 3, 18, 9, 0, tzinfo=UTC),
        phase_started_at=datetime(2026, 3, 18, 9, 0, tzinfo=UTC),
    )
    sqlite_session.add_all([run, node_run])
    sqlite_session.commit()

    response = client.get(f"/api/runs/{run.id}/execution-view")

    assert response.status_code == 200
    body = response.json()
    node = body["nodes"][0]
    assert node["execution_class"] == "sandbox"
    assert node["execution_source"] == "runtime_policy"
    assert node["execution_profile"] == "python-safe"
    assert node["execution_timeout_ms"] == 15000
    assert node["execution_network_policy"] == "restricted"
    assert node["execution_filesystem_policy"] == "ephemeral"
    assert node["execution_dependency_mode"] == "dependency_ref"
    assert node["execution_builtin_package_set"] is None
    assert node["execution_dependency_ref"] == "bundle:finance-safe-v1"
    assert node["execution_backend_extensions"] == {
        "mountPreset": "finance",
        "gpu": False,
    }


def test_get_run_execution_view_surfaces_skill_reference_loads(
    client: TestClient,
    sqlite_session: Session,
    sample_workflow: Workflow,
) -> None:
    run = Run(
        id="run-skill-reference-view",
        workflow_id=sample_workflow.id,
        workflow_version=sample_workflow.version,
        status="running",
        input_payload={"message": "inspect skill trace"},
        created_at=datetime(2026, 3, 17, 16, 0, tzinfo=UTC),
    )
    node_run = NodeRun(
        id="node-run-skill-agent",
        run_id=run.id,
        node_id="agent_skill",
        node_name="Agent Skill",
        node_type="llm_agent",
        status="running",
        phase="running_main",
        input_payload={"execution": {"class": "inline"}},
        created_at=datetime(2026, 3, 17, 16, 0, tzinfo=UTC),
    )
    sqlite_session.add_all(
        [
            run,
            node_run,
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
                created_at=datetime(2026, 3, 17, 16, 0, 30, tzinfo=UTC),
            ),
        ]
    )
    sqlite_session.commit()

    response = client.get(f"/api/runs/{run.id}/execution-view")

    assert response.status_code == 200
    body = response.json()
    assert body["summary"]["skill_reference_load_count"] == 2
    assert body["summary"]["skill_reference_phase_counts"] == {"main_plan": 2}
    assert body["summary"]["skill_reference_source_counts"] == {
        "retrieval_query_match": 1,
        "skill_binding": 1,
    }
    assert body["blocking_node_run_id"] is None
    assert body["execution_focus_reason"] is None
    assert body["execution_focus_node"] is None
    assert body["execution_focus_explanation"] is None
    assert body["skill_trace"] == {
        "scope": "run",
        "reference_count": 2,
        "phase_counts": {"main_plan": 2},
        "source_counts": {
            "retrieval_query_match": 1,
            "skill_binding": 1,
        },
        "nodes": [
            {
                "node_run_id": "node-run-skill-agent",
                "node_id": "agent_skill",
                "node_name": "Agent Skill",
                "reference_count": 2,
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
        ],
    }
    assert len(body["nodes"]) == 1
    node = body["nodes"][0]
    assert node["skill_reference_load_count"] == 2
    assert len(node["skill_reference_loads"]) == 1
    load = node["skill_reference_loads"][0]
    assert load["phase"] == "main_plan"
    assert len(load["references"]) == 2
    first_reference, second_reference = load["references"]
    assert first_reference["reference_id"] == "ref-handoff"
    assert first_reference["load_source"] == "skill_binding"
    assert first_reference["retrieval_mcp_method"] == "skills.get_reference"
    assert second_reference["reference_id"] == "ref-budget"
    assert second_reference["load_source"] == "retrieval_query_match"
    assert second_reference["fetch_reason"] == "Matched query terms: budget, guardrails"
    assert second_reference["retrieval_mcp_method"] == "skills.get_reference"


def test_get_run_evidence_view_returns_evidence_nodes_only(
    client: TestClient,
    sqlite_session: Session,
    sample_workflow: Workflow,
) -> None:
    run = Run(
        id="run-evidence-view",
        workflow_id=sample_workflow.id,
        workflow_version=sample_workflow.version,
        status="succeeded",
        input_payload={"message": "inspect evidence"},
        output_payload={"result": "final answer"},
        created_at=datetime(2026, 3, 11, 11, 0, tzinfo=UTC),
    )
    evidence_node = NodeRun(
        id="node-run-evidence",
        run_id=run.id,
        node_id="agent_review",
        node_name="Agent Review",
        node_type="llm_agent",
        status="succeeded",
        phase="emit_output",
        artifact_refs=["artifact://artifact-tool-result", "artifact://artifact-evidence-pack"],
        evidence_context={
            "summary": "Assistant extracted the decision basis.",
            "key_points": ["Found supporting article", "Need manual review on one conflict"],
            "evidence": [
                {
                    "title": "Key fact",
                    "detail": "The callback supplied the missing identifier.",
                    "source_ref": "artifact://artifact-tool-result",
                }
            ],
            "conflicts": ["One source disagreed on pricing."],
            "unknowns": ["Need confirm the newest quota policy."],
            "recommended_focus": ["Validate callback payload against publish contract."],
            "confidence": 0.72,
        },
        output_payload={"decision": "continue", "result": {"answer": "done"}},
        started_at=datetime(2026, 3, 11, 11, 0, tzinfo=UTC),
        finished_at=datetime(2026, 3, 11, 11, 3, tzinfo=UTC),
        created_at=datetime(2026, 3, 11, 11, 0, tzinfo=UTC),
    )
    plain_node = NodeRun(
        id="node-run-plain",
        run_id=run.id,
        node_id="output",
        node_name="Output",
        node_type="output",
        status="succeeded",
        phase="emit_output",
        output_payload={"answer": "done"},
        started_at=datetime(2026, 3, 11, 11, 3, tzinfo=UTC),
        finished_at=datetime(2026, 3, 11, 11, 4, tzinfo=UTC),
        created_at=datetime(2026, 3, 11, 11, 3, tzinfo=UTC),
    )
    sqlite_session.add_all(
        [
            run,
            evidence_node,
            plain_node,
            RunArtifact(
                id="artifact-tool-result",
                run_id=run.id,
                node_run_id=evidence_node.id,
                artifact_kind="tool_result",
                content_type="json",
                summary="Structured callback payload",
                payload={"identifier": "abc-123"},
                created_at=datetime(2026, 3, 11, 11, 1, tzinfo=UTC),
            ),
            RunArtifact(
                id="artifact-evidence-pack",
                run_id=run.id,
                node_run_id=evidence_node.id,
                artifact_kind="evidence_pack",
                content_type="json",
                summary="Assistant evidence pack",
                payload={"summary": "Assistant extracted the decision basis."},
                created_at=datetime(2026, 3, 11, 11, 2, tzinfo=UTC),
            ),
            ToolCallRecord(
                id="tool-call-evidence",
                run_id=run.id,
                node_run_id=evidence_node.id,
                tool_id="compat:dify:plugin/search",
                tool_name="search",
                phase="tool_execute",
                status="success",
                request_summary="Search request",
                response_summary="Structured callback payload",
                raw_artifact_id="artifact-tool-result",
                latency_ms=980,
                retry_count=0,
                created_at=datetime(2026, 3, 11, 11, 1, tzinfo=UTC),
            ),
            AICallRecord(
                id="ai-call-assistant-evidence",
                run_id=run.id,
                node_run_id=evidence_node.id,
                role="assistant_distill",
                status="succeeded",
                provider="mock-provider",
                model_id="mock-model",
                input_summary="Summarize callback payload",
                output_summary="Assistant extracted the decision basis.",
                latency_ms=210,
                assistant=True,
                created_at=datetime(2026, 3, 11, 11, 2, tzinfo=UTC),
            ),
        ]
    )
    sqlite_session.commit()

    response = client.get(f"/api/runs/{run.id}/evidence-view")

    assert response.status_code == 200
    body = response.json()
    assert body["run_id"] == run.id
    assert body["summary"] == {
        "node_count": 1,
        "artifact_count": 2,
        "tool_call_count": 1,
        "assistant_call_count": 1,
    }
    assert len(body["nodes"]) == 1
    node = body["nodes"][0]
    assert node["node_run_id"] == evidence_node.id
    assert node["summary"] == "Assistant extracted the decision basis."
    assert node["key_points"] == [
        "Found supporting article",
        "Need manual review on one conflict",
    ]
    assert node["evidence"][0]["source_ref"] == "artifact://artifact-tool-result"
    assert node["conflicts"] == ["One source disagreed on pricing."]
    assert node["unknowns"] == ["Need confirm the newest quota policy."]
    assert node["recommended_focus"] == [
        "Validate callback payload against publish contract."
    ]
    assert node["confidence"] == 0.72
    assert node["decision_output"] == {"decision": "continue", "result": {"answer": "done"}}
    assert len(node["tool_calls"]) == 1
    assert len(node["assistant_calls"]) == 1
    assert [artifact["id"] for artifact in node["supporting_artifacts"]] == [
        "artifact-tool-result",
        "artifact-evidence-pack",
    ]

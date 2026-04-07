from app.schemas.run_views import RunExecutionNodeItem
from app.services.run_execution_focus_explanations import (
    build_run_execution_focus_explanation,
)


def _build_execution_node(**overrides) -> RunExecutionNodeItem:
    payload = {
        "node_run_id": "nr-1",
        "node_id": "toolNode",
        "node_name": "Tool",
        "node_type": "toolNode",
        "status": "completed",
        "execution_class": "microvm",
        "execution_source": "workflow",
    }
    payload.update(overrides)
    return RunExecutionNodeItem(**payload)


def test_build_run_execution_focus_explanation_preserves_unknown_fallback_reason() -> None:
    explanation = build_run_execution_focus_explanation(
        _build_execution_node(
            execution_fallback_reason=" custom_backend_temporarily_degraded ",
            execution_fallback_count=2,
        )
    )

    assert explanation is not None
    assert explanation.primary_signal == (
        "执行降级：当前节点因 custom_backend_temporarily_degraded "
        "发生 execution fallback，累计记录 2 次。"
    )
    assert explanation.follow_up == (
        "下一步：确认该 fallback 是否符合当前 execution policy；"
        "若不符合，应回到 execution capability 与 runtime adapter 事实链继续治理。"
    )


def test_build_run_execution_focus_explanation_uses_generic_count_when_reason_missing() -> None:
    explanation = build_run_execution_focus_explanation(
        _build_execution_node(execution_fallback_count=1)
    )

    assert explanation is not None
    assert explanation.primary_signal == "执行降级：当前节点记录了 1 次 execution fallback。"
    assert explanation.follow_up == (
        "下一步：确认 fallback 是否仍可接受；若不可接受，"
        "应回到 execution capability 与 runtime adapter 事实链继续治理。"
    )


def test_build_run_execution_focus_explanation_maps_unsupported_strong_isolation_block() -> None:
    explanation = build_run_execution_focus_explanation(
        _build_execution_node(
            node_id="branch",
            node_name="Branch",
            node_type="conditionNode",
            execution_blocking_reason=(
                "Node type 'condition' does not implement requested strong-isolation "
                "execution class 'microvm'. Strong-isolation paths must fail closed "
                "until a compatible execution adapter is available."
            ),
            execution_unavailable_count=1,
        )
    )

    assert explanation is not None
    assert explanation.primary_signal == (
        "执行阻断：当前 conditionNode 节点尚未实现请求的强隔离 execution class。"
    )
    assert explanation.follow_up == (
        "下一步：先把 execution class 调回当前实现支持范围，"
        "或补齐对应 execution adapter；在此之前继续保持 fail-closed。"
    )


def test_build_run_execution_focus_explanation_maps_unsupported_subprocess_block() -> None:
    explanation = build_run_execution_focus_explanation(
        _build_execution_node(
            node_id="startNode",
            node_name="startNode",
            node_type="startNode",
            execution_class="subprocess",
            execution_blocking_reason=(
                "Node type 'startNode' does not implement requested execution class "
                "'subprocess'. Explicit execution-class requests must stay blocked until "
                "a compatible execution adapter is available."
            ),
            execution_unavailable_count=1,
        )
    )

    assert explanation is not None
    assert explanation.primary_signal == (
        "执行阻断：当前 startNode 节点尚未实现请求的 subprocess execution class。"
    )
    assert explanation.follow_up == (
        "下一步：先把 execution class 调回 inline，"
        "或补齐对应 execution adapter；显式 execution-class 请求不要静默降级。"
    )


def test_build_run_execution_focus_explanation_maps_tool_runner_gap() -> None:
    explanation = build_run_execution_focus_explanation(
        _build_execution_node(
            execution_blocking_reason=(
                "Tool nodes do not yet implement sandbox-backed tool execution for requested "
                "execution class 'microvm'. Current native / compat invokers still run from the "
                "host / adapter boundary, so strong-isolation tool paths must fail closed until "
                "a sandbox tool runner is available."
            ),
            execution_unavailable_count=1,
        )
    )

    assert explanation is not None
    assert explanation.primary_signal == (
        "执行阻断：当前 tool 路径还不能真实兑现请求的强隔离 execution class。"
    )
    assert explanation.follow_up == (
        "下一步：先把 tool execution class 调回当前宿主执行支持范围，"
        "或后续补齐 sandbox tool runner；在此之前继续保持 fail-closed。"
    )


def test_build_run_execution_focus_explanation_surfaces_primary_governed_resource() -> None:
    explanation = build_run_execution_focus_explanation(
        _build_execution_node(
            waiting_reason="waiting approval",
            sensitive_access_entries=[
                {
                    "request": {
                        "id": "request-1",
                        "run_id": "run-1",
                        "node_run_id": "nr-1",
                        "requester_type": "tool",
                        "requester_id": "native.search",
                        "resource_id": "resource-1",
                        "action_type": "invoke",
                        "created_at": "2026-03-18T10:00:00Z",
                    },
                    "resource": {
                        "id": "resource-1",
                        "label": "Credential · Ops Key",
                        "description": None,
                        "sensitivity_level": "L3",
                        "source": "credential",
                        "metadata": {},
                        "credential_governance": {
                            "credential_id": "cred-ops-key",
                            "credential_name": "Ops Key",
                            "credential_type": "api_key",
                            "credential_status": "active",
                            "sensitivity_level": "L3",
                            "sensitive_resource_id": "resource-1",
                            "sensitive_resource_label": "Credential · Ops Key",
                            "credential_ref": "credential://cred-ops-key",
                            "summary": (
                                "本次命中的凭据是 Ops Key（api_key）；"
                                "当前治理级别 L3，状态 生效中。"
                            ),
                        },
                        "created_at": "2026-03-18T10:00:00Z",
                        "updated_at": "2026-03-18T10:00:00Z",
                    },
                    "approval_ticket": {
                        "id": "ticket-1",
                        "access_request_id": "request-1",
                        "run_id": "run-1",
                        "node_run_id": "nr-1",
                        "status": "pending",
                        "waiting_status": "waiting",
                        "approved_by": None,
                        "decided_at": None,
                        "expires_at": None,
                        "created_at": "2026-03-18T10:00:00Z",
                    },
                    "notifications": [],
                }
            ],
        )
    )

    assert explanation is not None
    assert explanation.primary_signal == "等待原因：waiting approval"
    assert explanation.follow_up == (
        "下一步：优先处理 Credential · Ops Key · L3 治理 · 生效中 对应的 sensitive "
        "access 审批票据，再观察 waiting 节点是否恢复。"
    )

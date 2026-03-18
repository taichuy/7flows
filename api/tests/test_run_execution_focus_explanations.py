from app.schemas.run_views import RunExecutionNodeItem
from app.services.run_execution_focus_explanations import (
    build_run_execution_focus_explanation,
)


def _build_execution_node(**overrides) -> RunExecutionNodeItem:
    payload = {
        "node_run_id": "nr-1",
        "node_id": "tool",
        "node_name": "Tool",
        "node_type": "tool",
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

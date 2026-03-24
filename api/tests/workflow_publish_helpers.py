from app.schemas.workflow_legacy_auth_governance import (
    WorkflowPublishedEndpointLegacyAuthModeContract,
)


def publishable_definition(
    *,
    answer: str = "done",
    workflow_version: str | None = "0.1.0",
    alias: str | None = None,
    path: str | None = None,
    auth_mode: str = "internal",
    endpoint_id: str = "native-chat",
    endpoint_name: str = "Native Chat",
    protocol: str = "native",
    streaming: bool = False,
    rate_limit: dict | None = None,
    cache: dict | None = None,
) -> dict:
    endpoint: dict[str, object] = {
        "id": endpoint_id,
        "name": endpoint_name,
        "protocol": protocol,
        "authMode": auth_mode,
        "streaming": streaming,
        "inputSchema": {"type": "object"},
    }
    if alias is not None:
        endpoint["alias"] = alias
    if path is not None:
        endpoint["path"] = path
    if workflow_version is not None:
        endpoint["workflowVersion"] = workflow_version
    if rate_limit is not None:
        endpoint["rateLimit"] = rate_limit
    if cache is not None:
        endpoint["cache"] = cache

    return {
        "nodes": [
            {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
            {
                "id": "tool",
                "type": "tool",
                "name": "Tool",
                "config": {"mock_output": {"answer": answer}},
            },
            {"id": "output", "type": "output", "name": "Output", "config": {}},
        ],
        "edges": [
            {"id": "e1", "sourceNodeId": "trigger", "targetNodeId": "tool"},
            {"id": "e2", "sourceNodeId": "tool", "targetNodeId": "output"},
        ],
        "publish": [endpoint],
    }


def waiting_agent_publishable_definition(
    *,
    alias: str,
    path: str,
    endpoint_id: str,
    endpoint_name: str,
    protocol: str = "openai",
    cache: dict | None = None,
) -> dict:
    endpoint: dict[str, object] = {
        "id": endpoint_id,
        "name": endpoint_name,
        "alias": alias,
        "path": path,
        "protocol": protocol,
        "authMode": "internal",
        "streaming": False,
        "inputSchema": {"type": "object"},
    }
    if cache is not None:
        endpoint["cache"] = cache

    return {
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
                                "inputs": {"query": "wait-for-callback"},
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
        "publish": [
            endpoint
        ],
    }


def legacy_auth_mode_contract() -> dict[str, object]:
    return WorkflowPublishedEndpointLegacyAuthModeContract().model_dump(mode="json")


def legacy_auth_binding(
    *,
    workflow_id: str,
    workflow_name: str,
    binding_id: str,
    workflow_version: str,
    endpoint_id: str,
    endpoint_name: str,
    lifecycle_status: str = "published",
    auth_mode: str = "token",
) -> dict[str, str]:
    return {
        "workflow_id": workflow_id,
        "workflow_name": workflow_name,
        "binding_id": binding_id,
        "workflow_version": workflow_version,
        "endpoint_id": endpoint_id,
        "endpoint_name": endpoint_name,
        "lifecycle_status": lifecycle_status,
        "auth_mode": auth_mode,
    }


def legacy_auth_workflow_summary(
    *,
    workflow_id: str,
    workflow_name: str,
    binding_count: int = 1,
    draft_candidate_count: int = 0,
    published_blocker_count: int = 1,
    offline_inventory_count: int = 0,
) -> dict[str, str | int]:
    return {
        "workflow_id": workflow_id,
        "workflow_name": workflow_name,
        "binding_count": binding_count,
        "draft_candidate_count": draft_candidate_count,
        "published_blocker_count": published_blocker_count,
        "offline_inventory_count": offline_inventory_count,
    }


def legacy_auth_published_follow_up_checklist(
    *, workflow_name: str, count: int = 1
) -> dict[str, str | int]:
    return {
        "key": "published_follow_up",
        "title": "再补发支持鉴权的 replacement bindings",
        "tone": "manual",
        "tone_label": "人工跟进",
        "count": count,
        "detail": (
            f"对 {workflow_name} 这类仍在 live 的 legacy binding，"
            f"{legacy_auth_mode_contract()['follow_up']}"
        ),
    }


def legacy_auth_draft_cleanup_checklist(
    *, workflow_name: str, count: int = 1
) -> dict[str, str | int]:
    return {
        "key": "draft_cleanup",
        "title": "先批量下线 draft legacy bindings",
        "tone": "ready",
        "tone_label": "可立即执行",
        "count": count,
        "detail": (
            f"先对 {workflow_name} 里的 {count} 条 draft legacy binding 执行批量 cleanup；"
            "这一步不会动到仍在 live 的 published endpoint。"
        ),
    }


def legacy_auth_governance_snapshot_for_single_published_blocker(
    *,
    generated_at: str,
    workflow_id: str,
    workflow_name: str,
    workflow_version: str,
    binding_id: str,
    endpoint_id: str,
    endpoint_name: str,
) -> dict[str, object]:
    workflow = legacy_auth_workflow_summary(
        workflow_id=workflow_id,
        workflow_name=workflow_name,
    )
    published_blocker = legacy_auth_binding(
        workflow_id=workflow_id,
        workflow_name=workflow_name,
        binding_id=binding_id,
        workflow_version=workflow_version,
        endpoint_id=endpoint_id,
        endpoint_name=endpoint_name,
    )
    return {
        "generated_at": generated_at,
        "workflow_count": 1,
        "binding_count": 1,
        "auth_mode_contract": legacy_auth_mode_contract(),
        "summary": {
            "draft_candidate_count": 0,
            "published_blocker_count": 1,
            "offline_inventory_count": 0,
        },
        "checklist": [
            legacy_auth_published_follow_up_checklist(workflow_name=workflow_name)
        ],
        "workflows": [workflow],
        "buckets": {
            "draft_candidates": [],
            "published_blockers": [published_blocker],
            "offline_inventory": [],
        },
    }


def legacy_auth_governance_snapshot_for_single_draft_candidate(
    *,
    generated_at: str,
    workflow_id: str,
    workflow_name: str,
    workflow_version: str,
    binding_id: str,
    endpoint_id: str,
    endpoint_name: str,
) -> dict[str, object]:
    workflow = legacy_auth_workflow_summary(
        workflow_id=workflow_id,
        workflow_name=workflow_name,
        draft_candidate_count=1,
        published_blocker_count=0,
    )
    draft_candidate = legacy_auth_binding(
        workflow_id=workflow_id,
        workflow_name=workflow_name,
        binding_id=binding_id,
        workflow_version=workflow_version,
        endpoint_id=endpoint_id,
        endpoint_name=endpoint_name,
        lifecycle_status="draft",
    )
    return {
        "generated_at": generated_at,
        "workflow_count": 1,
        "binding_count": 1,
        "auth_mode_contract": legacy_auth_mode_contract(),
        "summary": {
            "draft_candidate_count": 1,
            "published_blocker_count": 0,
            "offline_inventory_count": 0,
        },
        "checklist": [
            legacy_auth_draft_cleanup_checklist(workflow_name=workflow_name)
        ],
        "workflows": [workflow],
        "buckets": {
            "draft_candidates": [draft_candidate],
            "published_blockers": [],
            "offline_inventory": [],
        },
    }


def legacy_auth_export_snapshot_for_single_published_blocker(
    *,
    generated_at: str,
    workflow_id: str,
    workflow_name: str,
    workflow_version: str,
    binding_id: str,
    endpoint_id: str,
    endpoint_name: str,
) -> dict[str, object]:
    snapshot = legacy_auth_governance_snapshot_for_single_published_blocker(
        generated_at=generated_at,
        workflow_id=workflow_id,
        workflow_name=workflow_name,
        workflow_version=workflow_version,
        binding_id=binding_id,
        endpoint_id=endpoint_id,
        endpoint_name=endpoint_name,
    )
    workflow = snapshot.pop("workflows")[0]
    return {
        **snapshot,
        "workflow": workflow,
    }

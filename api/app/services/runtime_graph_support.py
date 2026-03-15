from __future__ import annotations

from collections import defaultdict

from app.services.runtime_branch_support import RuntimeBranchSupportMixin
from app.services.runtime_mapping_support import RuntimeMappingSupportMixin
from app.services.runtime_types import (
    AuthorizedContextRefs,
    JoinDecision,
    JoinPolicy,
    RetryPolicy,
    WorkflowExecutionError,
)


class RuntimeGraphSupportMixin(
    RuntimeBranchSupportMixin,
    RuntimeMappingSupportMixin,
):
    def _authorized_context_for_node(self, node: dict) -> AuthorizedContextRefs:
        config = node.get("config", {})
        context_access = config.get("contextAccess") or {}
        readable_node_ids = {
            str(node_id)
            for node_id in context_access.get("readableNodeIds", [])
            if str(node_id).strip()
        }
        readable_artifacts: set[tuple[str, str]] = set()

        for node_id in readable_node_ids:
            readable_artifacts.add((node_id, "json"))

        for artifact in context_access.get("readableArtifacts", []):
            artifact_node_id = str(artifact.get("nodeId", "")).strip()
            artifact_type = str(artifact.get("artifactType", "")).strip()
            if not artifact_node_id or not artifact_type:
                continue
            readable_node_ids.add(artifact_node_id)
            readable_artifacts.add((artifact_node_id, artifact_type))

        return AuthorizedContextRefs(
            current_node_id=node["id"],
            readable_node_ids=tuple(sorted(readable_node_ids)),
            readable_artifacts=tuple(sorted(readable_artifacts)),
        )

    def _execute_mcp_query_node(
        self,
        node: dict,
        authorized_context: AuthorizedContextRefs,
        outputs: dict[str, dict],
    ) -> dict:
        query = node.get("config", {}).get("query") or {}
        query_type = query.get("type")
        if query_type != "authorized_context":
            raise WorkflowExecutionError(
                f"Node '{node['id']}' uses unsupported MCP query type '{query_type}'."
            )

        authorized_artifacts = self._authorized_artifact_lookup(authorized_context)
        requested_source_ids = [
            str(source_node_id)
            for source_node_id in (
                query.get("sourceNodeIds") or authorized_context.readable_node_ids
            )
        ]
        unauthorized_sources = sorted(
            source_node_id
            for source_node_id in requested_source_ids
            if source_node_id not in authorized_artifacts
        )
        if unauthorized_sources:
            raise WorkflowExecutionError(
                f"Node '{node['id']}' requested unauthorized context sources: "
                f"{', '.join(unauthorized_sources)}."
            )

        requested_artifact_types = {
            str(artifact_type)
            for artifact_type in (query.get("artifactTypes") or ["json"])
        }

        results: list[dict] = []
        for source_node_id in requested_source_ids:
            allowed_artifact_types = authorized_artifacts.get(source_node_id, set())
            unauthorized_artifact_types = sorted(requested_artifact_types - allowed_artifact_types)
            if unauthorized_artifact_types:
                raise WorkflowExecutionError(
                    f"Node '{node['id']}' requested unauthorized artifact types from "
                    f"'{source_node_id}': {', '.join(unauthorized_artifact_types)}."
                )

            if "json" in requested_artifact_types and source_node_id in outputs:
                results.append(
                    {
                        "nodeId": source_node_id,
                        "artifactType": "json",
                        "content": outputs[source_node_id],
                    }
                )

        return {
            "query": {
                "type": query_type,
                "sourceNodeIds": requested_source_ids,
                "artifactTypes": sorted(requested_artifact_types),
            },
            "results": results,
        }

    def _authorized_artifact_lookup(
        self,
        authorized_context: AuthorizedContextRefs,
    ) -> dict[str, set[str]]:
        artifact_lookup: dict[str, set[str]] = defaultdict(set)
        for node_id in authorized_context.readable_node_ids:
            artifact_lookup[node_id].add("json")
        for node_id, artifact_type in authorized_context.readable_artifacts:
            artifact_lookup[node_id].add(artifact_type)
        return artifact_lookup

    def _retry_policy_for_node(self, node: dict) -> RetryPolicy:
        runtime_policy = node.get("runtimePolicy") or {}
        retry_config = runtime_policy.get("retry")
        if retry_config is None and any(
            key in runtime_policy for key in ("maxAttempts", "backoffSeconds", "backoffMultiplier")
        ):
            retry_config = runtime_policy
        if retry_config is None:
            return RetryPolicy()

        max_attempts = int(retry_config.get("maxAttempts", 1))
        backoff_seconds = float(retry_config.get("backoffSeconds", 0.0))
        backoff_multiplier = float(retry_config.get("backoffMultiplier", 1.0))

        if max_attempts < 1:
            raise WorkflowExecutionError(
                f"Node '{node['id']}' retry policy must use maxAttempts >= 1."
            )
        if backoff_seconds < 0:
            raise WorkflowExecutionError(
                f"Node '{node['id']}' retry policy must use backoffSeconds >= 0."
            )
        if backoff_multiplier < 1:
            raise WorkflowExecutionError(
                f"Node '{node['id']}' retry policy must use backoffMultiplier >= 1."
            )

        return RetryPolicy(
            max_attempts=max_attempts,
            backoff_seconds=backoff_seconds,
            backoff_multiplier=backoff_multiplier,
        )

    def _retry_delay_seconds(self, retry_policy: RetryPolicy, failed_attempt_number: int) -> float:
        if retry_policy.backoff_seconds <= 0:
            return 0.0
        multiplier = retry_policy.backoff_multiplier ** (failed_attempt_number - 1)
        return retry_policy.backoff_seconds * multiplier

    def _join_policy_for_node(self, node: dict) -> JoinPolicy:
        runtime_policy = node.get("runtimePolicy") or {}
        join_config = runtime_policy.get("join") or {}
        required_node_ids = tuple(
            sorted(
                {
                    str(node_id).strip()
                    for node_id in join_config.get("requiredNodeIds", [])
                    if str(node_id).strip()
                }
            )
        )
        mode = str(join_config.get("mode", "any"))
        on_unmet = str(join_config.get("onUnmet", "skip"))
        merge_strategy = str(join_config.get("mergeStrategy", "error"))
        if mode not in {"any", "all"}:
            raise WorkflowExecutionError(
                f"Node '{node['id']}' uses unsupported join mode '{mode}'."
            )
        if on_unmet not in {"skip", "fail"}:
            raise WorkflowExecutionError(
                f"Node '{node['id']}' uses unsupported join onUnmet policy '{on_unmet}'."
            )
        if merge_strategy not in {"error", "overwrite", "keep_first", "append"}:
            raise WorkflowExecutionError(
                f"Node '{node['id']}' uses unsupported join mergeStrategy "
                f"'{merge_strategy}'."
            )
        return JoinPolicy(
            mode=mode,
            required_node_ids=required_node_ids,
            on_unmet=on_unmet,
            merge_strategy=merge_strategy,
        )

    def _join_decision_for_node(
        self,
        node: dict,
        incoming: tuple[str, ...] | list[str],
        activated_sources: set[str],
    ) -> JoinDecision:
        incoming_ids = tuple(sorted({str(node_id) for node_id in incoming if str(node_id).strip()}))
        activated_source_ids = tuple(sorted(str(node_id) for node_id in activated_sources))
        if node.get("type") == "trigger":
            return JoinDecision(
                should_execute=True,
                mode="any",
                on_unmet="skip",
                merge_strategy="error",
                expected_source_ids=(),
                activated_source_ids=activated_source_ids,
                missing_source_ids=(),
            )
        if not incoming_ids:
            return JoinDecision(
                should_execute=False,
                mode="any",
                on_unmet="skip",
                merge_strategy="error",
                expected_source_ids=(),
                activated_source_ids=activated_source_ids,
                missing_source_ids=(),
                reason="No incoming edges reached this node.",
            )

        join_policy = self._join_policy_for_node(node)
        if join_policy.mode == "all":
            expected_source_ids = (
                join_policy.required_node_ids if join_policy.required_node_ids else incoming_ids
            )
            missing_source_ids = tuple(
                node_id for node_id in expected_source_ids if node_id not in activated_sources
            )
            if missing_source_ids:
                reason = (
                    f"Join requirements were not met. Missing required upstream nodes: "
                    f"{', '.join(missing_source_ids)}."
                )
                return JoinDecision(
                    should_execute=False,
                    mode=join_policy.mode,
                    on_unmet=join_policy.on_unmet,
                    merge_strategy=join_policy.merge_strategy,
                    expected_source_ids=expected_source_ids,
                    activated_source_ids=activated_source_ids,
                    missing_source_ids=missing_source_ids,
                    reason=reason,
                    block_on_unmet=join_policy.on_unmet == "fail",
                )
            return JoinDecision(
                should_execute=bool(expected_source_ids),
                mode=join_policy.mode,
                on_unmet=join_policy.on_unmet,
                merge_strategy=join_policy.merge_strategy,
                expected_source_ids=expected_source_ids,
                activated_source_ids=activated_source_ids,
                missing_source_ids=(),
            )

        return JoinDecision(
            should_execute=bool(activated_sources),
            mode=join_policy.mode,
            on_unmet=join_policy.on_unmet,
            merge_strategy=join_policy.merge_strategy,
            expected_source_ids=incoming_ids,
            activated_source_ids=activated_source_ids,
            missing_source_ids=(),
            reason="No active incoming branch reached this node."
            if not activated_sources
            else None,
        )

    def _build_join_event_payload(self, node: dict, join_decision: JoinDecision) -> dict:
        return {
            "node_id": node["id"],
            "mode": join_decision.mode,
            "on_unmet": join_decision.on_unmet,
            "merge_strategy": join_decision.merge_strategy,
            "expected_source_ids": list(join_decision.expected_source_ids),
            "activated_source_ids": list(join_decision.activated_source_ids),
            "missing_source_ids": list(join_decision.missing_source_ids),
        }

    def _build_context_read_payload(self, node: dict, node_output: dict) -> dict:
        results = node_output.get("results", [])
        return {
            "node_id": node["id"],
            "query_type": node_output.get("query", {}).get("type"),
            "source_node_ids": [item["nodeId"] for item in results],
            "artifact_types": sorted({item["artifactType"] for item in results}),
            "result_count": len(results),
            "sensitive_result_count": sum(
                1 for item in results if isinstance(item, dict) and item.get("sensitiveAccess")
            ),
            "masked_result_count": sum(
                1 for item in results if isinstance(item, dict) and item.get("masked")
            ),
        }

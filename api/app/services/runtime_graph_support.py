from __future__ import annotations

from collections import defaultdict
from copy import deepcopy

from app.core.safe_expressions import (
    BRANCH_EXPRESSION_NAMES,
    EDGE_EXPRESSION_NAMES,
    MISSING,
    SafeExpressionError,
    evaluate_expression,
)
from app.services.runtime_types import (
    AuthorizedContextRefs,
    JoinDecision,
    JoinPolicy,
    RetryPolicy,
    WorkflowExecutionError,
)


class RuntimeGraphSupportMixin:
    def _should_activate_edge(
        self,
        source_node: dict,
        source_output: dict,
        outcome: str,
        edge: dict,
        target_node: dict,
        sibling_edges: list[dict],
    ) -> bool:
        condition = self._normalize_branch_value(edge.get("condition"))
        if outcome == "failed":
            if condition not in {"error", "failed", "on_error"}:
                return False
            return self._edge_expression_matches(
                source_node=source_node,
                target_node=target_node,
                source_output=source_output,
                outcome=outcome,
                edge=edge,
            )

        if source_node.get("type") in {"condition", "router"}:
            selected = self._normalize_branch_value(source_output.get("selected"))
            has_branch_conditions = any(
                self._normalize_branch_value(candidate.get("condition")) is not None
                for candidate in sibling_edges
            )
            if selected is None:
                matches_branch = not has_branch_conditions and condition is None
                if not matches_branch:
                    return False
                return self._edge_expression_matches(
                    source_node=source_node,
                    target_node=target_node,
                    source_output=source_output,
                    outcome=outcome,
                    edge=edge,
                )

            if condition == selected:
                return self._edge_expression_matches(
                    source_node=source_node,
                    target_node=target_node,
                    source_output=source_output,
                    outcome=outcome,
                    edge=edge,
                )

            has_explicit_match = any(
                self._normalize_branch_value(candidate.get("condition")) == selected
                for candidate in sibling_edges
            )
            if condition is not None or has_explicit_match:
                return False
            return self._edge_expression_matches(
                source_node=source_node,
                target_node=target_node,
                source_output=source_output,
                outcome=outcome,
                edge=edge,
            )

        if condition not in {None, "success", "succeeded", "default"}:
            return False
        return self._edge_expression_matches(
            source_node=source_node,
            target_node=target_node,
            source_output=source_output,
            outcome=outcome,
            edge=edge,
        )

    def _normalize_branch_value(self, value: object) -> str | None:
        if value is None:
            return None
        normalized = str(value).strip().lower()
        return normalized or None

    def _select_branch_from_rules(
        self,
        selector: dict,
        node_input: dict,
    ) -> tuple[str | None, dict | None, bool]:
        for rule in selector.get("rules", []):
            if self._selector_rule_matches(rule, node_input):
                return rule["key"], rule, False

        default_branch = selector.get("default")
        if default_branch is not None:
            return str(default_branch), None, True

        return "default", None, True

    def _select_branch_from_expression(
        self,
        node: dict,
        node_input: dict,
    ) -> tuple[str, object, bool]:
        expression = str(node.get("config", {}).get("expression"))
        try:
            expression_value = evaluate_expression(
                expression,
                context=self._branch_expression_context(node_input),
                allowed_names=BRANCH_EXPRESSION_NAMES,
                description=f"Node '{node['id']}' config.expression",
            )
        except SafeExpressionError as exc:
            raise WorkflowExecutionError(str(exc)) from exc

        if node.get("type") == "condition":
            selected = "true" if bool(expression_value) else "false"
            return selected, expression_value, False

        selected = self._stringify_branch_key(expression_value)
        if selected is not None:
            return selected, expression_value, False

        return self._default_branch_key(node), expression_value, True

    def _selector_rule_matches(self, rule: dict, node_input: dict) -> bool:
        actual_value = self._resolve_selector_path(node_input, str(rule["path"]))
        operator = rule.get("operator", "eq")
        expected_value = rule.get("value")

        if operator == "exists":
            return actual_value is not MISSING
        if operator == "not_exists":
            return actual_value is MISSING
        if actual_value is MISSING:
            return False
        if operator == "eq":
            return actual_value == expected_value
        if operator == "ne":
            return actual_value != expected_value
        if operator == "gt":
            return self._compare_selector_values(actual_value, expected_value, lambda a, b: a > b)
        if operator == "gte":
            return self._compare_selector_values(actual_value, expected_value, lambda a, b: a >= b)
        if operator == "lt":
            return self._compare_selector_values(actual_value, expected_value, lambda a, b: a < b)
        if operator == "lte":
            return self._compare_selector_values(actual_value, expected_value, lambda a, b: a <= b)
        if operator == "in":
            return isinstance(expected_value, list | tuple | set) and actual_value in expected_value
        if operator == "not_in":
            return isinstance(
                expected_value,
                list | tuple | set,
            ) and actual_value not in expected_value
        if operator == "contains":
            try:
                return expected_value in actual_value
            except TypeError:
                return False
        raise WorkflowExecutionError(f"Unsupported branch selector operator '{operator}'.")

    def _compare_selector_values(
        self,
        actual_value: object,
        expected_value: object,
        comparator,
    ) -> bool:
        try:
            return bool(comparator(actual_value, expected_value))
        except TypeError:
            return False

    def _resolve_selector_path(self, payload: object, path: str) -> object:
        current_value = payload
        for token in self._selector_path_tokens(path):
            if isinstance(current_value, dict):
                if token not in current_value:
                    return MISSING
                current_value = current_value[token]
                continue
            if isinstance(current_value, list):
                if not token.isdigit():
                    return MISSING
                index = int(token)
                if index < 0 or index >= len(current_value):
                    return MISSING
                current_value = current_value[index]
                continue
            return MISSING
        return current_value

    def _selector_path_tokens(self, path: str) -> list[str]:
        normalized_path = path.replace("[", ".").replace("]", "")
        return [segment for segment in normalized_path.split(".") if segment]

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

    def _accumulated_input_for_node(self, upstream: dict, mapped: dict) -> dict:
        if mapped:
            return deepcopy(mapped)
        return deepcopy(upstream)

    def _overlay_mapped_input(self, node_input: dict, mapped: dict) -> dict:
        merged_input = deepcopy(node_input)
        return self._deep_merge_dicts(merged_input, mapped)

    def _deep_merge_dicts(self, base: dict, override: dict) -> dict:
        for key, value in override.items():
            if isinstance(base.get(key), dict) and isinstance(value, dict):
                self._deep_merge_dicts(base[key], value)
                continue
            base[key] = deepcopy(value)
        return base

    def _apply_edge_mappings(
        self,
        edge: dict,
        source_node: dict,
        target_node: dict,
        source_output: dict,
        mapped_input: dict,
    ) -> None:
        mappings = edge.get("mapping") or []
        if not mappings:
            return

        merge_strategy = self._join_policy_for_node(target_node).merge_strategy
        for mapping in mappings:
            source_value = self._resolve_mapping_source_value(source_output, mapping)
            if source_value is MISSING:
                continue
            transformed_value = self._transform_mapping_value(source_value, mapping)
            self._merge_mapping_target_value(
                mapped_input=mapped_input,
                target_field=str(mapping["targetField"]),
                value=transformed_value,
                merge_strategy=merge_strategy,
                edge=edge,
                target_node=target_node,
            )

    def _resolve_mapping_source_value(self, source_output: dict, mapping: dict) -> object:
        source_field = str(mapping["sourceField"])
        normalized_source_field = (
            source_field[7:] if source_field.startswith("output.") else source_field
        )
        source_value = self._resolve_selector_path(source_output, normalized_source_field)
        if source_value is not MISSING:
            return source_value
        if "fallback" in mapping:
            return mapping.get("fallback")
        return MISSING

    def _transform_mapping_value(self, value: object, mapping: dict) -> object:
        transform = mapping.get("transform") or {"type": "identity"}
        transform_type = str(transform.get("type", "identity"))
        if transform_type == "identity":
            transformed = value
        elif transform_type == "toString":
            transformed = "" if value is None else str(value)
        elif transform_type == "toNumber":
            transformed = self._to_mapping_number(value)
        elif transform_type == "toBoolean":
            transformed = self._to_mapping_boolean(value)
        else:
            raise WorkflowExecutionError(
                f"Unsupported field mapping transform '{transform_type}'."
            )

        template = mapping.get("template")
        if isinstance(template, str):
            return template.replace("{{value}}", self._stringify_template_value(transformed))
        return transformed

    def _to_mapping_number(self, value: object) -> int | float:
        if isinstance(value, bool):
            return int(value)
        if isinstance(value, int | float):
            return value
        if isinstance(value, str):
            normalized = value.strip()
            if not normalized:
                raise WorkflowExecutionError("Cannot convert empty string to number.")
            try:
                return int(normalized) if normalized.isdigit() else float(normalized)
            except ValueError as exc:
                raise WorkflowExecutionError(
                    f"Cannot convert mapping value '{value}' to number."
                ) from exc
        raise WorkflowExecutionError(f"Cannot convert mapping value '{value}' to number.")

    def _to_mapping_boolean(self, value: object) -> bool:
        if isinstance(value, bool):
            return value
        if isinstance(value, int | float):
            return bool(value)
        if isinstance(value, str):
            normalized = value.strip().lower()
            if normalized in {"true", "1", "yes", "on"}:
                return True
            if normalized in {"false", "0", "no", "off", ""}:
                return False
        return bool(value)

    def _stringify_template_value(self, value: object) -> str:
        if value is None:
            return ""
        if isinstance(value, str):
            return value
        return str(value)

    def _merge_mapping_target_value(
        self,
        mapped_input: dict,
        target_field: str,
        value: object,
        merge_strategy: str,
        edge: dict,
        target_node: dict,
    ) -> None:
        target_tokens = self._target_path_tokens(target_field)
        current = mapped_input
        for token in target_tokens[:-1]:
            current = current.setdefault(token, {})
            if not isinstance(current, dict):
                raise WorkflowExecutionError(
                    f"Field mapping target '{target_field}' conflicts with an "
                    "existing scalar value."
                )

        leaf_key = target_tokens[-1]
        if leaf_key not in current:
            if merge_strategy == "append":
                current[leaf_key] = [deepcopy(value)]
            else:
                current[leaf_key] = deepcopy(value)
            return

        existing_value = current[leaf_key]
        if merge_strategy == "error":
            raise WorkflowExecutionError(
                f"Node '{target_node['id']}' received conflicting field mapping for "
                f"'{target_field}' from edge '{edge.get('id', '<unknown>')}'."
            )
        if merge_strategy == "overwrite":
            current[leaf_key] = deepcopy(value)
            return
        if merge_strategy == "keep_first":
            return
        if merge_strategy == "append":
            if isinstance(existing_value, list):
                existing_value.append(deepcopy(value))
            else:
                current[leaf_key] = [existing_value, deepcopy(value)]
            return
        raise WorkflowExecutionError(
            f"Node '{target_node['id']}' uses unsupported join mergeStrategy '{merge_strategy}'."
        )

    def _target_path_tokens(self, path: str) -> list[str]:
        tokens = [segment for segment in path.split(".") if segment]
        if not tokens:
            raise WorkflowExecutionError("Field mapping targetField must not be empty.")
        return tokens

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

    def _branch_expression_context(self, node_input: dict) -> dict[str, object]:
        return {
            "trigger_input": node_input.get("trigger_input", {}),
            "upstream": node_input.get("upstream", {}),
            "accumulated": node_input.get("accumulated", {}),
            "activated_by": node_input.get("activated_by", []),
            "authorized_context": node_input.get("authorized_context", {}),
            "attempt": node_input.get("attempt", {}),
            "config": node_input.get("config", {}),
            "global_context": node_input.get("global_context", {}),
            "working_context": node_input.get("working_context", {}),
            "evidence_context": node_input.get("evidence_context", {}),
        }

    def _edge_expression_matches(
        self,
        source_node: dict,
        target_node: dict,
        source_output: dict,
        outcome: str,
        edge: dict,
    ) -> bool:
        expression = edge.get("conditionExpression")
        if expression is None:
            return True

        try:
            result = evaluate_expression(
                str(expression),
                context={
                    "source_output": source_output,
                    "source_node": source_node,
                    "target_node": target_node,
                    "edge": edge,
                    "outcome": outcome,
                },
                allowed_names=EDGE_EXPRESSION_NAMES,
                description=f"Edge '{edge.get('id', '<unknown>')}' conditionExpression",
            )
        except SafeExpressionError as exc:
            raise WorkflowExecutionError(str(exc)) from exc

        return bool(result)

    def _default_branch_key(self, node: dict) -> str:
        config = node.get("config", {})
        for key in ("default", "selected"):
            value = config.get(key)
            if isinstance(value, str) and value.strip():
                return value
        return "default"

    def _stringify_branch_key(self, value: object) -> str | None:
        if value is MISSING or value is None:
            return None
        if isinstance(value, str):
            normalized = value.strip()
            return normalized or None
        return str(value)

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
        }

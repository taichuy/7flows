from __future__ import annotations

from typing import Any


def collect_invalid_workflow_variables(
    definition: dict[str, Any] | None,
) -> list[dict[str, str]]:
    if not isinstance(definition, dict):
        return []

    variables = definition.get("variables")
    if not isinstance(variables, list):
        return []

    issues: list[dict[str, str]] = []
    seen_names: dict[str, list[int]] = {}
    for index, variable in enumerate(variables):
        if not isinstance(variable, dict):
            continue
        raw_name = variable.get("name")
        normalized_name = raw_name.strip() if isinstance(raw_name, str) else ""
        if not normalized_name:
            issues.append(
                {
                    "message": f"Variable {index + 1} uses an empty name.",
                    "path": f"variables.{index}.name",
                    "field": "name",
                }
            )
            continue
        seen_names.setdefault(normalized_name, []).append(index)

    for name, indexes in seen_names.items():
        if len(indexes) <= 1:
            continue
        for index in indexes:
            issues.append(
                {
                    "message": f"Variable name '{name}' is duplicated in the workflow definition.",
                    "path": f"variables.{index}.name",
                    "field": "name",
                }
            )

    return issues

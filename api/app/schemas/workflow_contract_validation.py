from __future__ import annotations

from typing import Any

_ALLOWED_CONTRACT_SCHEMA_TYPES = frozenset(
    {"array", "boolean", "integer", "null", "number", "object", "string"}
)
_COMPOSITE_SCHEMA_KEYS = ("allOf", "anyOf", "oneOf")


def validate_contract_schema(schema: object, *, error_prefix: str) -> None:
    if not isinstance(schema, dict):
        raise ValueError(f"{error_prefix} must be an object.")
    _validate_contract_schema_object(schema, error_prefix=error_prefix)


def _validate_contract_schema_object(
    schema: dict[str, Any],
    *,
    error_prefix: str,
) -> None:
    schema_type = schema.get("type")
    if schema_type is not None:
        _validate_contract_schema_type(schema_type, error_prefix=f"{error_prefix}.type")

    properties = schema.get("properties")
    if properties is not None:
        if not isinstance(properties, dict):
            raise ValueError(f"{error_prefix}.properties must be an object.")
        for property_name, property_schema in properties.items():
            if not isinstance(property_name, str) or not property_name.strip():
                raise ValueError(
                    f"{error_prefix}.properties keys must be non-empty strings."
                )
            _validate_nested_contract_schema(
                property_schema,
                error_prefix=f"{error_prefix}.properties.{property_name}",
            )

    required = schema.get("required")
    if required is not None:
        if not isinstance(required, list):
            raise ValueError(f"{error_prefix}.required must be a list of field names.")
        normalized_required: list[str] = []
        for index, field_name in enumerate(required):
            if not isinstance(field_name, str) or not field_name.strip():
                raise ValueError(
                    f"{error_prefix}.required[{index}] must be a non-empty string."
                )
            normalized_required.append(field_name.strip())
        if len(set(normalized_required)) != len(normalized_required):
            raise ValueError(f"{error_prefix}.required must contain unique field names.")

    items = schema.get("items")
    if items is not None:
        if isinstance(items, list):
            for index, item_schema in enumerate(items):
                _validate_nested_contract_schema(
                    item_schema,
                    error_prefix=f"{error_prefix}.items[{index}]",
                )
        else:
            _validate_nested_contract_schema(items, error_prefix=f"{error_prefix}.items")

    additional_properties = schema.get("additionalProperties")
    if additional_properties is not None and not isinstance(additional_properties, bool):
        _validate_nested_contract_schema(
            additional_properties,
            error_prefix=f"{error_prefix}.additionalProperties",
        )

    for composite_key in _COMPOSITE_SCHEMA_KEYS:
        composite_value = schema.get(composite_key)
        if composite_value is None:
            continue
        if not isinstance(composite_value, list):
            raise ValueError(f"{error_prefix}.{composite_key} must be a list of schemas.")
        for index, item_schema in enumerate(composite_value):
            _validate_nested_contract_schema(
                item_schema,
                error_prefix=f"{error_prefix}.{composite_key}[{index}]",
            )

    not_schema = schema.get("not")
    if not_schema is not None:
        _validate_nested_contract_schema(not_schema, error_prefix=f"{error_prefix}.not")

    enum_values = schema.get("enum")
    if enum_values is not None and not isinstance(enum_values, list):
        raise ValueError(f"{error_prefix}.enum must be a list.")


def _validate_nested_contract_schema(schema: object, *, error_prefix: str) -> None:
    if isinstance(schema, bool):
        return
    if not isinstance(schema, dict):
        raise ValueError(f"{error_prefix} must be an object schema or boolean.")
    _validate_contract_schema_object(schema, error_prefix=error_prefix)


def _validate_contract_schema_type(schema_type: object, *, error_prefix: str) -> None:
    if isinstance(schema_type, str):
        candidate_types = [schema_type]
    elif isinstance(schema_type, list) and schema_type:
        candidate_types = schema_type
    else:
        raise ValueError(
            f"{error_prefix} must be a standard JSON Schema type or a non-empty list of types."
        )

    normalized_types: list[str] = []
    for index, candidate_type in enumerate(candidate_types):
        if not isinstance(candidate_type, str):
            raise ValueError(f"{error_prefix}[{index}] must be a string.")
        normalized_type = candidate_type.strip()
        if normalized_type not in _ALLOWED_CONTRACT_SCHEMA_TYPES:
            rendered_allowed = ", ".join(sorted(_ALLOWED_CONTRACT_SCHEMA_TYPES))
            raise ValueError(
                f"{error_prefix}[{index}] must be one of: {rendered_allowed}."
            )
        normalized_types.append(normalized_type)

    if len(set(normalized_types)) != len(normalized_types):
        raise ValueError(f"{error_prefix} must not contain duplicate types.")

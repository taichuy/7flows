const ALLOWED_CONTRACT_SCHEMA_TYPES = new Set([
  "array",
  "boolean",
  "integer",
  "null",
  "number",
  "object",
  "string"
]);

const COMPOSITE_SCHEMA_KEYS = ["allOf", "anyOf", "oneOf"] as const;

type WorkflowDefinitionLike = {
  nodes?: unknown;
  publish?: unknown;
};

export type WorkflowContractValidationIssue = {
  key: string;
  scope: "node" | "publish";
  entityId: string;
  message: string;
  path: string;
  field: "inputSchema" | "outputSchema";
};

export function validateContractSchema(schema: unknown, options: { errorPrefix: string }) {
  if (!isRecord(schema)) {
    throw new Error(`${options.errorPrefix} must be an object.`);
  }
  validateContractSchemaObject(schema, options.errorPrefix);
}

export function buildWorkflowDefinitionContractValidationIssues(
  definition: WorkflowDefinitionLike
) {
  const issues: WorkflowContractValidationIssue[] = [];
  const nodes = Array.isArray(definition.nodes) ? definition.nodes : [];
  const publish = Array.isArray(definition.publish) ? definition.publish : [];

  nodes.forEach((node, index) => {
    if (!isRecord(node)) {
      return;
    }

    const nodeId = readEntityId(node.id, `node_${index + 1}`);
    pushSchemaIssue({
      issues,
      key: `node-${nodeId}-inputSchema`,
      scope: "node",
      entityId: nodeId,
      path: `nodes.${index}.inputSchema`,
      field: "inputSchema",
      errorPrefix: `Node '${nodeId}' inputSchema`,
      fieldValue: node.inputSchema
    });
    pushSchemaIssue({
      issues,
      key: `node-${nodeId}-outputSchema`,
      scope: "node",
      entityId: nodeId,
      path: `nodes.${index}.outputSchema`,
      field: "outputSchema",
      errorPrefix: `Node '${nodeId}' outputSchema`,
      fieldValue: node.outputSchema
    });
  });

  publish.forEach((endpoint, index) => {
    if (!isRecord(endpoint)) {
      return;
    }

    const endpointId = readEntityId(endpoint.id, `endpoint_${index + 1}`);
    pushSchemaIssue({
      issues,
      key: `publish-${endpointId}-inputSchema`,
      scope: "publish",
      entityId: endpointId,
      path: `publish.${index}.inputSchema`,
      field: "inputSchema",
      errorPrefix: `Published endpoint '${endpointId}' inputSchema`,
      fieldValue: endpoint.inputSchema
    });
    pushSchemaIssue({
      issues,
      key: `publish-${endpointId}-outputSchema`,
      scope: "publish",
      entityId: endpointId,
      path: `publish.${index}.outputSchema`,
      field: "outputSchema",
      errorPrefix: `Published endpoint '${endpointId}' outputSchema`,
      fieldValue: endpoint.outputSchema
    });
  });

  return issues;
}

function pushSchemaIssue(options: {
  issues: WorkflowContractValidationIssue[];
  key: string;
  scope: WorkflowContractValidationIssue["scope"];
  entityId: string;
  path: string;
  field: WorkflowContractValidationIssue["field"];
  errorPrefix: string;
  fieldValue: unknown;
}) {
  if (options.fieldValue === undefined || options.fieldValue === null) {
    return;
  }

  try {
    validateContractSchema(options.fieldValue, { errorPrefix: options.errorPrefix });
  } catch (error) {
    options.issues.push({
      key: options.key,
      scope: options.scope,
      entityId: options.entityId,
      message: error instanceof Error ? error.message : `${options.errorPrefix} is invalid.`,
      path: options.path,
      field: options.field
    });
  }
}

function validateContractSchemaObject(schema: Record<string, unknown>, errorPrefix: string) {
  const schemaType = schema.type;
  if (schemaType !== undefined) {
    validateContractSchemaType(schemaType, `${errorPrefix}.type`);
  }

  const properties = schema.properties;
  if (properties !== undefined) {
    if (!isRecord(properties)) {
      throw new Error(`${errorPrefix}.properties must be an object.`);
    }
    for (const [propertyName, propertySchema] of Object.entries(properties)) {
      if (!propertyName.trim()) {
        throw new Error(`${errorPrefix}.properties keys must be non-empty strings.`);
      }
      validateNestedContractSchema(
        propertySchema,
        `${errorPrefix}.properties.${propertyName}`
      );
    }
  }

  const required = schema.required;
  if (required !== undefined) {
    if (!Array.isArray(required)) {
      throw new Error(`${errorPrefix}.required must be a list of field names.`);
    }
    const normalizedRequired: string[] = [];
    required.forEach((fieldName, index) => {
      if (typeof fieldName !== "string" || !fieldName.trim()) {
        throw new Error(`${errorPrefix}.required[${index}] must be a non-empty string.`);
      }
      normalizedRequired.push(fieldName.trim());
    });
    if (new Set(normalizedRequired).size !== normalizedRequired.length) {
      throw new Error(`${errorPrefix}.required must contain unique field names.`);
    }
  }

  const items = schema.items;
  if (items !== undefined) {
    if (Array.isArray(items)) {
      items.forEach((itemSchema, index) => {
        validateNestedContractSchema(itemSchema, `${errorPrefix}.items[${index}]`);
      });
    } else {
      validateNestedContractSchema(items, `${errorPrefix}.items`);
    }
  }

  const additionalProperties = schema.additionalProperties;
  if (additionalProperties !== undefined && typeof additionalProperties !== "boolean") {
    validateNestedContractSchema(
      additionalProperties,
      `${errorPrefix}.additionalProperties`
    );
  }

  COMPOSITE_SCHEMA_KEYS.forEach((compositeKey) => {
    const compositeValue = schema[compositeKey];
    if (compositeValue === undefined || compositeValue === null) {
      return;
    }
    if (!Array.isArray(compositeValue)) {
      throw new Error(`${errorPrefix}.${compositeKey} must be a list of schemas.`);
    }
    compositeValue.forEach((itemSchema, index) => {
      validateNestedContractSchema(itemSchema, `${errorPrefix}.${compositeKey}[${index}]`);
    });
  });

  const notSchema = schema.not;
  if (notSchema !== undefined && notSchema !== null) {
    validateNestedContractSchema(notSchema, `${errorPrefix}.not`);
  }

  const enumValues = schema.enum;
  if (enumValues !== undefined && !Array.isArray(enumValues)) {
    throw new Error(`${errorPrefix}.enum must be a list.`);
  }
}

function validateNestedContractSchema(schema: unknown, errorPrefix: string) {
  if (typeof schema === "boolean") {
    return;
  }
  if (!isRecord(schema)) {
    throw new Error(`${errorPrefix} must be an object schema or boolean.`);
  }
  validateContractSchemaObject(schema, errorPrefix);
}

function validateContractSchemaType(schemaType: unknown, errorPrefix: string) {
  let candidateTypes: unknown[];
  if (typeof schemaType === "string") {
    candidateTypes = [schemaType];
  } else if (Array.isArray(schemaType) && schemaType.length > 0) {
    candidateTypes = schemaType;
  } else {
    throw new Error(
      `${errorPrefix} must be a standard JSON Schema type or a non-empty list of types.`
    );
  }

  const normalizedTypes: string[] = [];
  candidateTypes.forEach((candidateType, index) => {
    if (typeof candidateType !== "string") {
      throw new Error(`${errorPrefix}[${index}] must be a string.`);
    }
    const normalizedType = candidateType.trim();
    if (!ALLOWED_CONTRACT_SCHEMA_TYPES.has(normalizedType)) {
      const renderedAllowed = Array.from(ALLOWED_CONTRACT_SCHEMA_TYPES).sort().join(", ");
      throw new Error(`${errorPrefix}[${index}] must be one of: ${renderedAllowed}.`);
    }
    normalizedTypes.push(normalizedType);
  });

  if (new Set(normalizedTypes).size !== normalizedTypes.length) {
    throw new Error(`${errorPrefix} must not contain duplicate types.`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readEntityId(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

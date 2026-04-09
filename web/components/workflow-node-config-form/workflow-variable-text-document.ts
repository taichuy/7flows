export type WorkflowVariableTextDocumentSegment =
  | { type: "text"; text: string }
  | { type: "variable"; refId: string };

export type WorkflowVariableTextDocument = {
  version: 1;
  segments: WorkflowVariableTextDocumentSegment[];
};

export type WorkflowVariableReference = {
  refId: string;
  alias: string;
  ownerNodeId: string;
  selector: string[];
};

export type WorkflowVariableReferenceItem = {
  key: string;
  label: string;
  selector: string[];
  token: string;
  previewPath: string;
  machineName: string;
  valueTypeLabel?: string;
  inlineLabel?: string;
  children?: WorkflowVariableReferenceItem[];
};

export type WorkflowVariableReferenceGroup = {
  key: string;
  label: string;
  items: WorkflowVariableReferenceItem[];
};

const REPLY_TOKEN_PATTERN = /\{\{\s*(?:#\s*([^{}#]+?)\s*#|([^{}]+?))\s*\}\}/g;

function normalizeAliasBase(aliasBase: string) {
  return aliasBase.trim().replace(/[^\w]+/g, "_") || "value";
}

function buildReplyReferenceId(index: number) {
  return `ref_${index}`;
}

export function resolveReplyVariableAlias({
  aliasBase,
  existingAliases,
}: {
  aliasBase: string;
  existingAliases: string[];
}) {
  const normalizedBase = normalizeAliasBase(aliasBase);
  let alias = normalizedBase;
  let suffix = 2;

  while (existingAliases.includes(alias)) {
    alias = `${normalizedBase}_${suffix}`;
    suffix += 1;
  }

  return alias;
}

export function buildReplyVariableReference({
  ownerNodeId,
  aliasBase,
  selector,
  existingAliases,
  refId,
}: {
  ownerNodeId: string;
  aliasBase: string;
  selector: string[];
  existingAliases: string[];
  refId?: string;
}): WorkflowVariableReference {
  return {
    refId: refId ?? buildReplyReferenceId(existingAliases.length + 1),
    alias: resolveReplyVariableAlias({ aliasBase, existingAliases }),
    ownerNodeId,
    selector,
  };
}

export function formatWorkflowVariableMachineName(reference: WorkflowVariableReference) {
  return `${reference.ownerNodeId}.${reference.alias}`;
}

export function formatWorkflowVariableToken(reference: WorkflowVariableReference) {
  return `{{#${reference.selector.join(".")}#}}`;
}

export function parseReplyTemplateToDocument({
  ownerNodeId,
  ownerLabel: _ownerLabel,
  replyTemplate,
}: {
  ownerNodeId: string;
  ownerLabel: string;
  replyTemplate: string;
}): {
  document: WorkflowVariableTextDocument;
  references: WorkflowVariableReference[];
} {
  const segments: WorkflowVariableTextDocumentSegment[] = [];
  const references: WorkflowVariableReference[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;

  REPLY_TOKEN_PATTERN.lastIndex = 0;

  while ((match = REPLY_TOKEN_PATTERN.exec(replyTemplate)) !== null) {
    const rawMatch = match[0];
    const rawPath = (match[1] || match[2] || "").trim();
    const selector = rawPath.split(".").filter(Boolean);
    const machineAliasPrefix = `${ownerNodeId}.`;

    if (match.index > cursor) {
      segments.push({
        type: "text",
        text: replyTemplate.slice(cursor, match.index),
      });
    }

    if (selector.length === 0) {
      segments.push({ type: "text", text: rawMatch });
      cursor = match.index + rawMatch.length;
      continue;
    }

    if (rawPath.startsWith(machineAliasPrefix)) {
      segments.push({ type: "text", text: rawMatch });
      cursor = match.index + rawMatch.length;
      continue;
    }

    const reference = buildReplyVariableReference({
      ownerNodeId,
      aliasBase: selector.at(-1) || "value",
      selector,
      existingAliases: references.map((item) => item.alias),
      refId: buildReplyReferenceId(references.length + 1),
    });

    references.push(reference);
    segments.push({ type: "variable", refId: reference.refId });
    cursor = match.index + rawMatch.length;
  }

  if (cursor < replyTemplate.length) {
    segments.push({
      type: "text",
      text: replyTemplate.slice(cursor),
    });
  }

  return {
    document: {
      version: 1,
      segments: segments.length > 0 ? segments : [{ type: "text", text: "" }],
    },
    references,
  };
}

export function serializeReplyDocumentToTemplate({
  document,
  references,
}: {
  document: WorkflowVariableTextDocument;
  references: WorkflowVariableReference[];
}) {
  const referenceMap = new Map(references.map((reference) => [reference.refId, reference]));

  return document.segments
    .map((segment) => {
      if (segment.type === "text") {
        return segment.text;
      }

      const reference = referenceMap.get(segment.refId);
      return reference ? formatWorkflowVariableToken(reference) : "";
    })
    .join("");
}

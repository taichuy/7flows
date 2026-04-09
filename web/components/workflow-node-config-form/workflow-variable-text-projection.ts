import {
  formatWorkflowVariableMachineName,
  type WorkflowVariableReference,
  type WorkflowVariableTextDocument,
} from "@/components/workflow-node-config-form/workflow-variable-text-document";

export const WORKFLOW_VARIABLE_SENTINEL = "\x1f";

export type WorkflowVariableProjectionToken = {
  refId: string;
  start: number;
  end: number;
  label: string;
  machineName: string;
};

export type WorkflowVariableProjection = {
  text: string;
  tokens: WorkflowVariableProjectionToken[];
  orderedRefIds: string[];
};

function pushTextSegment(
  segments: WorkflowVariableTextDocument["segments"],
  text: string,
) {
  if (!text) {
    return;
  }

  const lastSegment = segments[segments.length - 1];
  if (lastSegment?.type === "text") {
    lastSegment.text += text;
    return;
  }

  segments.push({ type: "text", text });
}

export function buildWorkflowVariableProjection({
  ownerLabel,
  document,
  references,
}: {
  ownerLabel: string;
  document: WorkflowVariableTextDocument;
  references: WorkflowVariableReference[];
}): WorkflowVariableProjection {
  const referenceMap = new Map(references.map((reference) => [reference.refId, reference]));
  const tokens: WorkflowVariableProjectionToken[] = [];
  const orderedRefIds: string[] = [];
  let cursor = 0;
  let text = "";

  document.segments.forEach((segment) => {
    if (segment.type === "text") {
      text += segment.text;
      cursor += segment.text.length;
      return;
    }

    const reference = referenceMap.get(segment.refId);
    if (!reference) {
      return;
    }

    text += WORKFLOW_VARIABLE_SENTINEL;
    tokens.push({
      refId: reference.refId,
      start: cursor,
      end: cursor + 1,
      label: `[${ownerLabel}] ${reference.alias}`,
      machineName: formatWorkflowVariableMachineName(reference),
    });
    orderedRefIds.push(reference.refId);
    cursor += 1;
  });

  return {
    text,
    tokens,
    orderedRefIds,
  };
}

export function buildReplyDocumentFromProjection({
  text,
  orderedRefIds,
}: {
  text: string;
  orderedRefIds: string[];
}): WorkflowVariableTextDocument {
  const segments: WorkflowVariableTextDocument["segments"] = [];
  let buffer = "";
  let refIndex = 0;

  for (const character of text) {
    if (character !== WORKFLOW_VARIABLE_SENTINEL) {
      buffer += character;
      continue;
    }

    pushTextSegment(segments, buffer);
    buffer = "";

    const refId = orderedRefIds[refIndex];
    if (refId) {
      segments.push({ type: "variable", refId });
    }
    refIndex += 1;
  }

  pushTextSegment(segments, buffer);

  return {
    version: 1,
    segments: segments.length > 0 ? segments : [{ type: "text", text: "" }],
  };
}

function countSentinelsBeforeIndex(text: string, index: number) {
  const clampedIndex = Math.max(0, Math.min(index, text.length));
  let count = 0;

  for (let cursor = 0; cursor < clampedIndex; cursor += 1) {
    if (text[cursor] === WORKFLOW_VARIABLE_SENTINEL) {
      count += 1;
    }
  }

  return count;
}

export function insertSentinelIntoProjection({
  text,
  cursor,
  orderedRefIds,
  refId,
  removeLeadingSlash,
}: {
  text: string;
  cursor: number;
  orderedRefIds: string[];
  refId: string;
  removeLeadingSlash: boolean;
}) {
  let nextText = text;
  let nextCursor = cursor;

  if (removeLeadingSlash && nextCursor > 0 && nextText[nextCursor - 1] === "/") {
    nextText = `${nextText.slice(0, nextCursor - 1)}${nextText.slice(nextCursor)}`;
    nextCursor -= 1;
  }

  const tokenIndex = countSentinelsBeforeIndex(nextText, nextCursor);

  return {
    text: `${nextText.slice(0, nextCursor)}${WORKFLOW_VARIABLE_SENTINEL}${nextText.slice(nextCursor)}`,
    orderedRefIds: [
      ...orderedRefIds.slice(0, tokenIndex),
      refId,
      ...orderedRefIds.slice(tokenIndex),
    ],
    cursor: nextCursor + 1,
  };
}

export function removeTokenBeforeCursor({
  text,
  cursor,
  orderedRefIds,
}: {
  text: string;
  cursor: number;
  orderedRefIds: string[];
}) {
  if (cursor <= 0 || text[cursor - 1] !== WORKFLOW_VARIABLE_SENTINEL) {
    return {
      text,
      orderedRefIds,
      cursor,
    };
  }

  const tokenIndex = countSentinelsBeforeIndex(text, cursor) - 1;

  return {
    text: `${text.slice(0, cursor - 1)}${text.slice(cursor)}`,
    orderedRefIds: [
      ...orderedRefIds.slice(0, tokenIndex),
      ...orderedRefIds.slice(tokenIndex + 1),
    ],
    cursor: cursor - 1,
  };
}

export function removeTokenAfterCursor({
  text,
  cursor,
  orderedRefIds,
}: {
  text: string;
  cursor: number;
  orderedRefIds: string[];
}) {
  if (text[cursor] !== WORKFLOW_VARIABLE_SENTINEL) {
    return {
      text,
      orderedRefIds,
      cursor,
    };
  }

  const tokenIndex = countSentinelsBeforeIndex(text, cursor);

  return {
    text: `${text.slice(0, cursor)}${text.slice(cursor + 1)}`,
    orderedRefIds: [
      ...orderedRefIds.slice(0, tokenIndex),
      ...orderedRefIds.slice(tokenIndex + 1),
    ],
    cursor,
  };
}

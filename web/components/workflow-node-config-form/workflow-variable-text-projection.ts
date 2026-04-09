import {
  formatWorkflowVariableMachineName,
  formatWorkflowVariableToken,
  type WorkflowVariableReference,
  type WorkflowVariableTextDocument,
} from "@/components/workflow-node-config-form/workflow-variable-text-document";

export const WORKFLOW_VARIABLE_SENTINEL = "\x1f";
const WORKFLOW_VARIABLE_TOKEN_PATTERN = /\{\{\s*#\s*([^{}#]+?)\s*#\s*\}\}/g;

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

function clampSelection(text: string, index: number) {
  return Math.max(0, Math.min(index, text.length));
}

function buildReferencePathMap(references: WorkflowVariableReference[]) {
  return new Map(references.map((reference) => [reference.selector.join("."), reference]));
}

function findProjectionTokenRanges(text: string) {
  const ranges: Array<{ start: number; end: number; path: string }> = [];
  let match: RegExpExecArray | null;

  WORKFLOW_VARIABLE_TOKEN_PATTERN.lastIndex = 0;

  while ((match = WORKFLOW_VARIABLE_TOKEN_PATTERN.exec(text)) !== null) {
    ranges.push({
      start: match.index,
      end: match.index + match[0].length,
      path: match[1]?.trim() ?? "",
    });
  }

  return ranges;
}

function findTokenBeforeCursor(text: string, cursor: number) {
  const ranges = findProjectionTokenRanges(text);
  for (let index = ranges.length - 1; index >= 0; index -= 1) {
    const range = ranges[index];
    if (cursor > range.start && cursor <= range.end) {
      return range;
    }
  }

  return null;
}

function findTokenAfterCursor(text: string, cursor: number) {
  return findProjectionTokenRanges(text).find(
    (range) => cursor >= range.start && cursor < range.end,
  ) ?? null;
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

    const tokenText = formatWorkflowVariableToken(reference);
    text += tokenText;
    tokens.push({
      refId: reference.refId,
      start: cursor,
      end: cursor + tokenText.length,
      label: `[${ownerLabel}] ${reference.alias}`,
      machineName: formatWorkflowVariableMachineName(reference),
    });
    orderedRefIds.push(reference.refId);
    cursor += tokenText.length;
  });

  return {
    text,
    tokens,
    orderedRefIds,
  };
}

export function buildReplyDocumentFromProjection({
  text,
  references,
}: {
  text: string;
  references: WorkflowVariableReference[];
}): WorkflowVariableTextDocument {
  const segments: WorkflowVariableTextDocument["segments"] = [];
  const referencePathMap = buildReferencePathMap(references);
  let cursor = 0;
  let match: RegExpExecArray | null;

  WORKFLOW_VARIABLE_TOKEN_PATTERN.lastIndex = 0;

  while ((match = WORKFLOW_VARIABLE_TOKEN_PATTERN.exec(text)) !== null) {
    if (match.index > cursor) {
      pushTextSegment(segments, text.slice(cursor, match.index));
    }

    const reference = referencePathMap.get(match[1]?.trim() ?? "");
    if (reference) {
      segments.push({ type: "variable", refId: reference.refId });
    } else {
      pushTextSegment(segments, match[0]);
    }

    cursor = match.index + match[0].length;
  }

  if (cursor < text.length) {
    pushTextSegment(segments, text.slice(cursor));
  }

  return {
    version: 1,
    segments: segments.length > 0 ? segments : [{ type: "text", text: "" }],
  };
}

export function insertTokenIntoProjection({
  text,
  cursor,
  reference,
  removeLeadingSlash,
}: {
  text: string;
  cursor: number;
  reference: WorkflowVariableReference;
  removeLeadingSlash: boolean;
}) {
  let nextText = text;
  let nextCursor = clampSelection(text, cursor);

  if (removeLeadingSlash && nextCursor > 0 && nextText[nextCursor - 1] === "/") {
    nextText = `${nextText.slice(0, nextCursor - 1)}${nextText.slice(nextCursor)}`;
    nextCursor -= 1;
  }

  const tokenText = formatWorkflowVariableToken(reference);

  return {
    text: `${nextText.slice(0, nextCursor)}${tokenText}${nextText.slice(nextCursor)}`,
    cursor: nextCursor + tokenText.length,
  };
}

export function removeTokenBeforeCursor({
  text,
  cursor,
}: {
  text: string;
  cursor: number;
}) {
  const nextCursor = clampSelection(text, cursor);
  const token = findTokenBeforeCursor(text, nextCursor);

  if (!token) {
    return {
      text,
      cursor: nextCursor,
    };
  }

  return {
    text: `${text.slice(0, token.start)}${text.slice(token.end)}`,
    cursor: token.start,
  };
}

export function removeTokenAfterCursor({
  text,
  cursor,
}: {
  text: string;
  cursor: number;
}) {
  const nextCursor = clampSelection(text, cursor);
  const token = findTokenAfterCursor(text, nextCursor);

  if (!token) {
    return {
      text,
      cursor: nextCursor,
    };
  }

  return {
    text: `${text.slice(0, token.start)}${text.slice(token.end)}`,
    cursor: token.start,
  };
}

export function serializeProjectionSelectionToTemplate({
  text,
  selectionStart,
  selectionEnd,
}: {
  text: string;
  selectionStart: number;
  selectionEnd: number;
}) {
  const start = clampSelection(text, Math.min(selectionStart, selectionEnd));
  const end = clampSelection(text, Math.max(selectionStart, selectionEnd));
  return text.slice(start, end);
}

export function deserializeProjectionClipboardText({
  clipboardText,
}: {
  clipboardText: string;
}) {
  return {
    text: clipboardText,
  };
}

export function replaceProjectionTextRange({
  text,
  selectionStart,
  selectionEnd,
  insertText,
}: {
  text: string;
  selectionStart: number;
  selectionEnd: number;
  insertText: string;
}) {
  const start = clampSelection(text, Math.min(selectionStart, selectionEnd));
  const end = clampSelection(text, Math.max(selectionStart, selectionEnd));

  return {
    text: `${text.slice(0, start)}${insertText}${text.slice(end)}`,
    cursor: start + insertText.length,
  };
}

import {
  formatWorkflowVariableMachineName,
  formatWorkflowVariableToken,
  type WorkflowVariableReference,
  type WorkflowVariableTextDocument,
} from "@/components/workflow-node-config-form/workflow-variable-text-document";

const WORKFLOW_VARIABLE_TEMPLATE_TOKEN_PATTERN = /\{\{\s*#\s*([^{}#]+?)\s*#\s*\}\}/g;
const WORKFLOW_VARIABLE_PROJECTION_TOKEN_PATTERN = /\u2063([^\u2064]*)\u2064/g;

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

export function formatWorkflowVariableProjectionTokenText(label: string) {
  return `\u2063${label}\u2064`;
}

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

function findProjectionTokenRanges(text: string) {
  const ranges: Array<{ start: number; end: number }> = [];
  let match: RegExpExecArray | null;

  WORKFLOW_VARIABLE_PROJECTION_TOKEN_PATTERN.lastIndex = 0;

  while ((match = WORKFLOW_VARIABLE_PROJECTION_TOKEN_PATTERN.exec(text)) !== null) {
    ranges.push({
      start: match.index,
      end: match.index + match[0].length,
    });
  }

  return ranges;
}

function countTokensBeforeIndex(text: string, index: number) {
  const clampedIndex = clampSelection(text, index);
  return findProjectionTokenRanges(text).filter((range) => range.end <= clampedIndex).length;
}

function findOverlappingTokenIndexes(text: string, start: number, end: number) {
  const ranges = findProjectionTokenRanges(text);
  const overlappingIndexes: number[] = [];

  ranges.forEach((range, index) => {
    if (range.end > start && range.start < end) {
      overlappingIndexes.push(index);
    }
  });

  return overlappingIndexes;
}

function buildReferencePathMap(references: WorkflowVariableReference[]) {
  return new Map(references.map((reference) => [reference.selector.join("."), reference]));
}

export function buildWorkflowVariableProjection({
  ownerLabel,
  document,
  references,
  getTokenText,
}: {
  ownerLabel: string;
  document: WorkflowVariableTextDocument;
  references: WorkflowVariableReference[];
  getTokenText?: (reference: WorkflowVariableReference) => string;
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

    const label = getTokenText?.(reference) ?? `[${ownerLabel}] ${reference.alias}`;
    const tokenText = formatWorkflowVariableProjectionTokenText(label);
    text += tokenText;
    tokens.push({
      refId: reference.refId,
      start: cursor,
      end: cursor + tokenText.length,
      label,
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
  orderedRefIds,
}: {
  text: string;
  orderedRefIds: string[];
}): WorkflowVariableTextDocument {
  const segments: WorkflowVariableTextDocument["segments"] = [];
  let cursor = 0;
  let refIndex = 0;
  let match: RegExpExecArray | null;

  WORKFLOW_VARIABLE_PROJECTION_TOKEN_PATTERN.lastIndex = 0;

  while ((match = WORKFLOW_VARIABLE_PROJECTION_TOKEN_PATTERN.exec(text)) !== null) {
    if (match.index > cursor) {
      pushTextSegment(segments, text.slice(cursor, match.index));
    }

    const refId = orderedRefIds[refIndex];
    if (refId) {
      segments.push({ type: "variable", refId });
    }

    refIndex += 1;
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
  orderedRefIds,
  refId,
  tokenText,
  removeLeadingSlash,
}: {
  text: string;
  cursor: number;
  orderedRefIds: string[];
  refId: string;
  tokenText: string;
  removeLeadingSlash: boolean;
}) {
  let nextText = text;
  let nextCursor = clampSelection(text, cursor);

  if (removeLeadingSlash && nextCursor > 0 && nextText[nextCursor - 1] === "/") {
    nextText = `${nextText.slice(0, nextCursor - 1)}${nextText.slice(nextCursor)}`;
    nextCursor -= 1;
  }

  const tokenIndex = countTokensBeforeIndex(nextText, nextCursor);

  return {
    text: `${nextText.slice(0, nextCursor)}${tokenText}${nextText.slice(nextCursor)}`,
    orderedRefIds: [
      ...orderedRefIds.slice(0, tokenIndex),
      refId,
      ...orderedRefIds.slice(tokenIndex),
    ],
    cursor: nextCursor + tokenText.length,
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
  const nextCursor = clampSelection(text, cursor);
  const ranges = findProjectionTokenRanges(text);
  let tokenIndex = -1;

  for (let index = ranges.length - 1; index >= 0; index -= 1) {
    const range = ranges[index];
    if (nextCursor > range.start && nextCursor <= range.end) {
      tokenIndex = index;
      break;
    }
  }

  if (tokenIndex < 0) {
    return {
      text,
      orderedRefIds,
      cursor: nextCursor,
    };
  }

  const token = ranges[tokenIndex];
  return {
    text: `${text.slice(0, token.start)}${text.slice(token.end)}`,
    orderedRefIds: [
      ...orderedRefIds.slice(0, tokenIndex),
      ...orderedRefIds.slice(tokenIndex + 1),
    ],
    cursor: token.start,
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
  const nextCursor = clampSelection(text, cursor);
  const ranges = findProjectionTokenRanges(text);
  const tokenIndex = ranges.findIndex(
    (range) => nextCursor >= range.start && nextCursor < range.end,
  );

  if (tokenIndex < 0) {
    return {
      text,
      orderedRefIds,
      cursor: nextCursor,
    };
  }

  const token = ranges[tokenIndex];
  return {
    text: `${text.slice(0, token.start)}${text.slice(token.end)}`,
    orderedRefIds: [
      ...orderedRefIds.slice(0, tokenIndex),
      ...orderedRefIds.slice(tokenIndex + 1),
    ],
    cursor: token.start,
  };
}

export function serializeProjectionSelectionToTemplate({
  text,
  selectionStart,
  selectionEnd,
  orderedRefIds,
  references,
}: {
  text: string;
  selectionStart: number;
  selectionEnd: number;
  orderedRefIds: string[];
  references: WorkflowVariableReference[];
}) {
  const start = clampSelection(text, Math.min(selectionStart, selectionEnd));
  const end = clampSelection(text, Math.max(selectionStart, selectionEnd));
  const overlappingTokenIndexes = findOverlappingTokenIndexes(text, start, end);
  const ranges = findProjectionTokenRanges(text);
  const referenceMap = new Map(references.map((reference) => [reference.refId, reference]));

  if (overlappingTokenIndexes.length === 0) {
    return text.slice(start, end);
  }

  let cursor = start;
  let serialized = "";

  overlappingTokenIndexes.forEach((tokenIndex) => {
    const range = ranges[tokenIndex];
    if (range.start > cursor) {
      serialized += text.slice(cursor, range.start);
    }

    const reference = referenceMap.get(orderedRefIds[tokenIndex] ?? "");
    serialized += reference ? formatWorkflowVariableToken(reference) : text.slice(range.start, range.end);
    cursor = range.end;
  });

  if (cursor < end) {
    serialized += text.slice(cursor, end);
  }

  return serialized;
}

export function deserializeProjectionClipboardText({
  clipboardText,
  references,
  getTokenText,
}: {
  clipboardText: string;
  references: WorkflowVariableReference[];
  getTokenText?: (reference: WorkflowVariableReference) => string;
}) {
  const referencePathMap = buildReferencePathMap(references);
  const orderedRefIds: string[] = [];
  let cursor = 0;
  let text = "";
  let match: RegExpExecArray | null;

  WORKFLOW_VARIABLE_TEMPLATE_TOKEN_PATTERN.lastIndex = 0;

  while ((match = WORKFLOW_VARIABLE_TEMPLATE_TOKEN_PATTERN.exec(clipboardText)) !== null) {
    if (match.index > cursor) {
      text += clipboardText.slice(cursor, match.index);
    }

    const reference = referencePathMap.get(match[1]?.trim() ?? "");
    if (reference) {
      const label = getTokenText?.(reference) ?? reference.alias;
      text += formatWorkflowVariableProjectionTokenText(label);
      orderedRefIds.push(reference.refId);
    } else {
      text += match[0];
    }

    cursor = match.index + match[0].length;
  }

  if (cursor < clipboardText.length) {
    text += clipboardText.slice(cursor);
  }

  return {
    text,
    orderedRefIds,
  };
}

export function replaceProjectionTextRange({
  text,
  selectionStart,
  selectionEnd,
  orderedRefIds,
  insertText,
  insertRefIds,
}: {
  text: string;
  selectionStart: number;
  selectionEnd: number;
  orderedRefIds: string[];
  insertText: string;
  insertRefIds: string[];
}) {
  const start = clampSelection(text, Math.min(selectionStart, selectionEnd));
  const end = clampSelection(text, Math.max(selectionStart, selectionEnd));
  const overlappingTokenIndexes = findOverlappingTokenIndexes(text, start, end);
  const startTokenIndex =
    overlappingTokenIndexes[0] ?? countTokensBeforeIndex(text, start);
  const endTokenIndex =
    overlappingTokenIndexes.length > 0
      ? overlappingTokenIndexes[overlappingTokenIndexes.length - 1] + 1
      : countTokensBeforeIndex(text, end);

  return {
    text: `${text.slice(0, start)}${insertText}${text.slice(end)}`,
    orderedRefIds: [
      ...orderedRefIds.slice(0, startTokenIndex),
      ...insertRefIds,
      ...orderedRefIds.slice(endTokenIndex),
    ],
    cursor: start + insertText.length,
  };
}

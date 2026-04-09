"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

import {
  buildReplyVariableReference,
  type WorkflowVariableReferenceItem,
  type WorkflowVariableReference,
  type WorkflowVariableReferenceGroup,
  type WorkflowVariableTextDocument,
} from "@/components/workflow-node-config-form/workflow-variable-text-document";
import { WorkflowVariableReferencePicker } from "@/components/workflow-node-config-form/workflow-variable-reference-picker";
import {
  buildReplyDocumentFromProjection,
  buildWorkflowVariableProjection,
  insertSentinelIntoProjection,
  removeTokenAfterCursor,
  removeTokenBeforeCursor,
} from "@/components/workflow-node-config-form/workflow-variable-text-projection";

type PickerMode = "slash" | "toolbar" | null;

function selectorsMatch(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function findReferenceBySelector(
  references: WorkflowVariableReference[],
  selector: string[],
) {
  return references.find((reference) => selectorsMatch(reference.selector, selector));
}

function flattenVariableItems(items: WorkflowVariableReferenceItem[]): WorkflowVariableReferenceItem[] {
  return items.flatMap((item) => {
    if (item.children && item.children.length > 0) {
      return flattenVariableItems(item.children);
    }

    return [item];
  });
}

function readSlashQueryContext(text: string, cursor: number) {
  const clampedCursor = Math.max(0, Math.min(cursor, text.length));
  const slashStart = text.lastIndexOf("/", Math.max(0, clampedCursor - 1));

  if (slashStart < 0) {
    return null;
  }

  const query = text.slice(slashStart + 1, clampedCursor);
  if (/\s/.test(query) || query.includes("\x1f")) {
    return null;
  }

  return {
    start: slashStart,
    query,
  };
}

function matchesVariableQuery(item: WorkflowVariableReferenceItem, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }

  return `${item.label} ${item.previewPath}`.toLowerCase().includes(normalizedQuery);
}

export function WorkflowVariableTextEditor({
  ownerNodeId,
  ownerLabel,
  value,
  references,
  variables,
  placeholder = "输入正文，输入 / 插入变量",
  onChange,
}: {
  ownerNodeId: string;
  ownerLabel: string;
  value: WorkflowVariableTextDocument;
  references: WorkflowVariableReference[];
  variables: WorkflowVariableReferenceGroup[];
  placeholder?: string;
  onChange: (next: {
    document: WorkflowVariableTextDocument;
    references: WorkflowVariableReference[];
  }) => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [pickerMode, setPickerMode] = useState<PickerMode>(null);
  const [pickerTop, setPickerTop] = useState(56);
  const [cursor, setCursor] = useState(value.segments.length > 0 ? projectionLength(value) : 0);
  const [toolbarQuery, setToolbarQuery] = useState("");
  const projection = useMemo(
    () => buildWorkflowVariableProjection({ ownerLabel, document: value, references }),
    [ownerLabel, references, value],
  );
  const leafItems = useMemo(
    () => variables.flatMap((group) => flattenVariableItems(group.items)),
    [variables],
  );
  const selectorLabelMap = useMemo(() => {
    return new Map(
      leafItems.map((item) => [item.selector.join("\x1f"), item.inlineLabel ?? item.label]),
    );
  }, [leafItems]);
  const tokenLabelMap = useMemo(
    () =>
      new Map(
        projection.tokens.map((token) => {
          const reference = references.find((item) => item.refId === token.refId);
          const selectorKey = reference ? reference.selector.join("\x1f") : null;
          return [token.refId, (selectorKey && selectorLabelMap.get(selectorKey)) ?? token.label];
        }),
      ),
    [projection.tokens, references, selectorLabelMap],
  );
  const slashContext = useMemo(
    () => (pickerMode === "slash" ? readSlashQueryContext(projection.text, cursor) : null),
    [pickerMode, projection.text, cursor],
  );
  const pickerQuery = pickerMode === "slash" ? (slashContext?.query ?? "") : toolbarQuery;
  const firstVisibleItem = useMemo(
    () => leafItems.find((item) => matchesVariableQuery(item, pickerQuery)) ?? null,
    [leafItems, pickerQuery],
  );

  useEffect(() => {
    setCursor((currentCursor) => Math.min(currentCursor, projection.text.length));
  }, [projection.text.length]);

  const syncTextareaHeight = () => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    textarea.style.height = "0px";
    textarea.style.height = `${Math.max(textarea.scrollHeight, 56)}px`;
    setPickerTop(Math.min(textarea.scrollHeight + 14, 280));
  };

  useEffect(() => {
    syncTextareaHeight();
  }, [projection.text]);

  useEffect(() => {
    if (pickerMode === "toolbar") {
      return;
    }

    setPickerMode(readSlashQueryContext(projection.text, cursor) ? "slash" : null);
  }, [pickerMode, projection.text, cursor]);

  const commitProjection = (nextText: string, nextOrderedRefIds: string[], nextReferences = references) => {
    const usedRefIds = new Set(nextOrderedRefIds);
    onChange({
      document: buildReplyDocumentFromProjection({
        text: nextText,
        orderedRefIds: nextOrderedRefIds,
      }),
      references: nextReferences.filter((reference) => usedRefIds.has(reference.refId)),
    });
  };

  const resolveCurrentCursor = () => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return cursor;
    }

    return textarea.selectionStart ?? cursor;
  };

  const handleInsert = (selector: string[], insertionCursor = resolveCurrentCursor()) => {
    const existingReference = findReferenceBySelector(references, selector);
    const nextReference =
      existingReference ??
      buildReplyVariableReference({
        ownerNodeId,
        aliasBase: selector[selector.length - 1] || "value",
        selector,
        existingAliases: references.map((reference) => reference.alias),
      });
    const currentSlashContext =
      pickerMode === "slash" ? readSlashQueryContext(projection.text, insertionCursor) : null;
    const nextTextForInsert = currentSlashContext
      ? `${projection.text.slice(0, currentSlashContext.start + 1)}${projection.text.slice(insertionCursor)}`
      : projection.text;
    const nextCursorForInsert = currentSlashContext
      ? currentSlashContext.start + 1
      : insertionCursor;
    const inserted = insertSentinelIntoProjection({
      text: nextTextForInsert,
      cursor: nextCursorForInsert,
      orderedRefIds: projection.orderedRefIds,
      refId: nextReference.refId,
      removeLeadingSlash: Boolean(currentSlashContext),
    });

    commitProjection(
      inserted.text,
      inserted.orderedRefIds,
      existingReference ? references : [...references, nextReference],
    );
    setPickerMode(null);
    setToolbarQuery("");
  };

  return (
    <div
      className="workflow-variable-text-editor-shell"
      data-component="workflow-variable-text-editor"
    >
      <div
        className="workflow-variable-text-editor-toolbar"
        data-component="workflow-variable-text-editor-toolbar"
      >
        <button
          type="button"
          className="sync-button secondary-button"
          data-action="open-variable-picker"
          onClick={() => {
            setToolbarQuery("");
            setPickerMode("toolbar");
          }}
        >
          变量
        </button>
      </div>

      <div className="workflow-variable-text-editor-composer">
        <div className="workflow-variable-text-editor-overlay" aria-hidden="true">
          {projection.text.length === 0 && projection.tokens.length === 0 ? (
            <span className="workflow-variable-text-editor-placeholder">{placeholder}</span>
          ) : (
            value.segments.map((segment, index) =>
              segment.type === "text" ? (
                <span key={`text-${index}`}>{segment.text}</span>
              ) : (
                <span
                  key={`${segment.refId}-${index}`}
                  className="workflow-variable-inline-token"
                  data-component="workflow-variable-inline-token"
                >
                  {tokenLabelMap.get(segment.refId) ?? segment.refId}
                </span>
              ),
            )
          )}
        </div>

        <textarea
          ref={textareaRef}
          className="workflow-variable-text-editor-input"
          value={projection.text}
          onInput={(event) => {
            const textarea = event.currentTarget;
            const nextText = textarea.value;
            const nextCursor = textarea.selectionStart ?? nextText.length;
            setCursor(nextCursor);
            commitProjection(nextText, projection.orderedRefIds);
          }}
          onClick={(event) => {
            syncTextareaHeight();
            setCursor(event.currentTarget.selectionStart ?? 0);
          }}
          onKeyUp={(event) => {
            syncTextareaHeight();
            setCursor(event.currentTarget.selectionStart ?? 0);
          }}
          onSelect={(event) => {
            syncTextareaHeight();
            setCursor(event.currentTarget.selectionStart ?? 0);
          }}
          onKeyDown={(event) => {
            const textarea = event.currentTarget;
            const nextCursor = textarea.selectionStart ?? 0;
            setCursor(nextCursor);

            if (event.key === "Enter" && pickerMode === "slash" && firstVisibleItem) {
              event.preventDefault();
              handleInsert(firstVisibleItem.selector, nextCursor);
              return;
            }

            if (event.key === "Backspace") {
              const removed = removeTokenBeforeCursor({
                text: projection.text,
                cursor: nextCursor,
                orderedRefIds: projection.orderedRefIds,
              });

              if (removed.text !== projection.text) {
                event.preventDefault();
                commitProjection(removed.text, removed.orderedRefIds);
                setPickerMode(null);
              }
            }

            if (event.key === "Delete") {
              const removed = removeTokenAfterCursor({
                text: projection.text,
                cursor: nextCursor,
                orderedRefIds: projection.orderedRefIds,
              });

              if (removed.text !== projection.text) {
                event.preventDefault();
                commitProjection(removed.text, removed.orderedRefIds);
                setPickerMode(null);
              }
            }

            if (event.key === "Escape") {
              setPickerMode(null);
            }
          }}
          rows={1}
        />

        {pickerMode !== null ? (
          <div className="workflow-variable-reference-popover-anchor" style={{ top: `${pickerTop}px` }}>
            <WorkflowVariableReferencePicker
              groups={variables}
              onInsert={handleInsert}
              onDismiss={() => setPickerMode(null)}
              query={pickerMode === "toolbar" ? toolbarQuery : pickerQuery}
              showSearch={pickerMode === "toolbar"}
              onQueryChange={pickerMode === "toolbar" ? setToolbarQuery : undefined}
              onConfirmFirst={
                pickerMode === "toolbar" && firstVisibleItem
                  ? () => handleInsert(firstVisibleItem.selector)
                  : undefined
              }
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function projectionLength(document: WorkflowVariableTextDocument) {
  return document.segments.reduce((length, segment) => {
    if (segment.type === "text") {
      return length + segment.text.length;
    }

    return length + 1;
  }, 0);
}

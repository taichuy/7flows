"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { PlainTextPlugin } from "@lexical/react/LexicalPlainTextPlugin";
import { mergeRegister } from "@lexical/utils";
import {
  $createParagraphNode,
  $createTextNode,
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $insertNodes,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  COMMAND_PRIORITY_EDITOR,
  COMMAND_PRIORITY_HIGH,
  COPY_COMMAND,
  CUT_COMMAND,
  KEY_BACKSPACE_COMMAND,
  KEY_DELETE_COMMAND,
  KEY_ENTER_COMMAND,
  KEY_ESCAPE_COMMAND,
  PASTE_COMMAND,
  type EditorState,
  type LexicalEditor,
  type LexicalNode,
} from "lexical";

import {
  buildReplyVariableReference,
  parseReplyTemplateToDocument,
  type WorkflowVariableReferenceItem,
  type WorkflowVariableReference,
  type WorkflowVariableReferenceGroup,
  type WorkflowVariableTextDocument,
} from "@/components/workflow-node-config-form/workflow-variable-text-document";
import {
  $createWorkflowVariableTextEditorNode,
  $isWorkflowVariableTextEditorNode,
  WorkflowVariableTextEditorNode,
} from "@/components/workflow-node-config-form/workflow-variable-text-editor-node";
import { WorkflowVariableReferencePicker } from "@/components/workflow-node-config-form/workflow-variable-reference-picker";

type PickerMode = "slash" | "toolbar" | null;
type SlashContext = {
  nodeKey: string;
  startOffset: number;
  endOffset: number;
  query: string;
};

const EXTERNAL_SYNC_TAG = "workflow-variable-external-sync";
const LABEL_SYNC_TAG = "workflow-variable-label-sync";
const INSERT_TOKEN_TAG = "workflow-variable-insert-token";

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

function buildStateSignature(
  document: WorkflowVariableTextDocument,
  references: WorkflowVariableReference[],
) {
  return JSON.stringify({ document, references });
}

function matchesVariableQuery(item: WorkflowVariableReferenceItem, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }

  return `${item.inlineLabel ?? item.label} ${item.label} ${item.previewPath}`
    .toLowerCase()
    .includes(normalizedQuery);
}

function readSlashContextFromSelection() {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
    return null;
  }

  const anchorNode = selection.anchor.getNode();
  if (!$isTextNode(anchorNode)) {
    return null;
  }

  const cursor = selection.anchor.offset;
  const text = anchorNode.getTextContent();
  const slashStart = text.lastIndexOf("/", Math.max(0, cursor - 1));
  if (slashStart < 0) {
    return null;
  }

  const query = text.slice(slashStart + 1, cursor);
  if (/\s/.test(query) || query.includes("{")) {
    return null;
  }

  return {
    nodeKey: anchorNode.getKey(),
    startOffset: slashStart,
    endOffset: cursor,
    query,
  } satisfies SlashContext;
}

function readDocumentFromEditorState() {
  const root = $getRoot();
  const segments: WorkflowVariableTextDocument["segments"] = [];
  const topLevelNodes = root.getChildren();

  topLevelNodes.forEach((node, index) => {
    const children = $isElementNode(node) ? node.getChildren() : [node];

    children.forEach((child) => {
      if ($isTextNode(child)) {
        pushTextSegment(segments, child.getTextContent());
        return;
      }

      if ($isWorkflowVariableTextEditorNode(child)) {
        segments.push({ type: "variable", refId: child.getRefId() });
        return;
      }

      pushTextSegment(segments, child.getTextContent());
    });

    if (index < topLevelNodes.length - 1) {
      pushTextSegment(segments, "\n");
    }
  });

  return {
    version: 1,
    segments: segments.length > 0 ? segments : [{ type: "text", text: "" }],
  } satisfies WorkflowVariableTextDocument;
}

function populateEditorFromDocument({
  editor,
  document,
  references,
  getTokenLabel,
}: {
  editor: LexicalEditor;
  document: WorkflowVariableTextDocument;
  references: WorkflowVariableReference[];
  getTokenLabel: (reference: WorkflowVariableReference) => string;
}) {
  editor.update(
    () => {
      const referenceMap = new Map(references.map((reference) => [reference.refId, reference]));
      const root = $getRoot();
      root.clear();

      let paragraph = $createParagraphNode();
      let hasParagraphContent = false;

      const appendText = (text: string) => {
        const parts = text.split("\n");
        parts.forEach((part, index) => {
          if (part.length > 0) {
            paragraph.append($createTextNode(part));
            hasParagraphContent = true;
          }

          if (index < parts.length - 1) {
            root.append(paragraph);
            paragraph = $createParagraphNode();
            hasParagraphContent = false;
          }
        });
      };

      document.segments.forEach((segment) => {
        if (segment.type === "text") {
          appendText(segment.text);
          return;
        }

        const reference = referenceMap.get(segment.refId);
        if (!reference) {
          return;
        }

        paragraph.append(
          $createWorkflowVariableTextEditorNode(
            reference.refId,
            reference.selector,
            getTokenLabel(reference),
          ),
        );
        hasParagraphContent = true;
      });

      if (hasParagraphContent || root.getChildrenSize() === 0) {
        root.append(paragraph);
      }
    },
    { tag: EXTERNAL_SYNC_TAG },
  );
}

function syncVariableNodeLabels({
  editor,
  references,
  getTokenLabel,
}: {
  editor: LexicalEditor;
  references: WorkflowVariableReference[];
  getTokenLabel: (reference: WorkflowVariableReference) => string;
}) {
  editor.update(
    () => {
      const referenceMap = new Map(references.map((reference) => [reference.refId, reference]));
      const root = $getRoot();

      root.getChildren().forEach((node) => {
        const children = $isElementNode(node) ? node.getChildren() : [node];
        children.forEach((child) => {
          if (!$isWorkflowVariableTextEditorNode(child)) {
            return;
          }

          const reference = referenceMap.get(child.getRefId());
          if (!reference) {
            return;
          }

          const nextLabel = getTokenLabel(reference);
          if (child.getLabel() !== nextLabel) {
            child.setLabel(nextLabel);
          }
        });
      });
    },
    { tag: LABEL_SYNC_TAG },
  );
}

function resolveAdjacentVariableNode(direction: "backward" | "forward") {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
    return null;
  }

  const anchorNode = selection.anchor.getNode();
  const anchorOffset = selection.anchor.offset;

  if ($isTextNode(anchorNode)) {
    if (direction === "backward" && anchorOffset === 0) {
      const previous = anchorNode.getPreviousSibling();
      return $isWorkflowVariableTextEditorNode(previous) ? previous : null;
    }

    if (direction === "forward" && anchorOffset === anchorNode.getTextContentSize()) {
      const next = anchorNode.getNextSibling();
      return $isWorkflowVariableTextEditorNode(next) ? next : null;
    }

    return null;
  }

  if ($isElementNode(anchorNode)) {
    const children = anchorNode.getChildren();
    const candidate =
      direction === "backward" ? children[anchorOffset - 1] : children[anchorOffset];
    return $isWorkflowVariableTextEditorNode(candidate) ? candidate : null;
  }

  return null;
}

function WorkflowVariableTextEditorBridge({
  onReady,
  onUpdate,
  onInsertSlashVariable,
  onRemoveBackwardToken,
  onRemoveForwardToken,
  onDismissPicker,
  onCopySelection,
  onCutSelection,
  onPasteSelection,
}: {
  onReady: (editor: LexicalEditor) => void;
  onUpdate: (editorState: EditorState, tags: Set<string>, hasContentChanges: boolean) => void;
  onInsertSlashVariable: () => boolean;
  onRemoveBackwardToken: () => boolean;
  onRemoveForwardToken: () => boolean;
  onDismissPicker: () => void;
  onCopySelection: (event: ClipboardEvent | KeyboardEvent | null) => boolean;
  onCutSelection: (event: ClipboardEvent | KeyboardEvent | null) => boolean;
  onPasteSelection: (event: ClipboardEvent | null) => boolean;
}) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    onReady(editor);

    return mergeRegister(
      editor.registerUpdateListener(({ editorState, dirtyElements, dirtyLeaves, tags }) => {
        onUpdate(editorState, tags, dirtyElements.size > 0 || dirtyLeaves.size > 0);
      }),
      editor.registerCommand(
        KEY_ENTER_COMMAND,
        (event) => {
          if (!onInsertSlashVariable()) {
            return false;
          }

          event?.preventDefault();
          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
      editor.registerCommand(
        KEY_ESCAPE_COMMAND,
        (event) => {
          onDismissPicker();
          event?.preventDefault();
          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
      editor.registerCommand(
        KEY_BACKSPACE_COMMAND,
        (event) => {
          if (!onRemoveBackwardToken()) {
            return false;
          }

          event?.preventDefault();
          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
      editor.registerCommand(
        KEY_DELETE_COMMAND,
        (event) => {
          if (!onRemoveForwardToken()) {
            return false;
          }

          event?.preventDefault();
          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
      editor.registerCommand(COPY_COMMAND, onCopySelection, COMMAND_PRIORITY_HIGH),
      editor.registerCommand(CUT_COMMAND, onCutSelection, COMMAND_PRIORITY_HIGH),
      editor.registerCommand(
        PASTE_COMMAND,
        (event) =>
          onPasteSelection(
            event && typeof event === "object" && "clipboardData" in event
              ? (event as ClipboardEvent)
              : null,
          ),
        COMMAND_PRIORITY_HIGH,
      ),
    );
  }, [
    editor,
    onCopySelection,
    onCutSelection,
    onDismissPicker,
    onInsertSlashVariable,
    onRemoveBackwardToken,
    onRemoveForwardToken,
    onPasteSelection,
    onReady,
    onUpdate,
  ]);

  return null;
}

export function WorkflowVariableTextEditor({
  ownerNodeId,
  ownerLabel,
  value,
  references,
  variables,
  placeholder = "输入正文，输入 / 插入变量",
  ariaLabel,
  onChange,
}: {
  ownerNodeId: string;
  ownerLabel: string;
  value: WorkflowVariableTextDocument;
  references: WorkflowVariableReference[];
  variables: WorkflowVariableReferenceGroup[];
  placeholder?: string;
  ariaLabel?: string;
  onChange: (next: {
    document: WorkflowVariableTextDocument;
    references: WorkflowVariableReference[];
  }) => void;
}) {
  const contentEditableRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<LexicalEditor | null>(null);
  const referencesRef = useRef(references);
  const pendingCommitReferencesRef = useRef<WorkflowVariableReference[] | null>(null);
  const pickerModeRef = useRef<PickerMode>(null);
  const slashContextRef = useRef<SlashContext | null>(null);
  const lastCommittedSignatureRef = useRef(buildStateSignature(value, references));
  const lastExternalSignatureRef = useRef(buildStateSignature(value, references));

  const [pickerMode, setPickerMode] = useState<PickerMode>(null);
  const [pickerTop, setPickerTop] = useState(56);
  const [toolbarQuery, setToolbarQuery] = useState("");
  const [slashContext, setSlashContext] = useState<SlashContext | null>(null);

  const leafItems = useMemo(
    () => variables.flatMap((group) => flattenVariableItems(group.items)),
    [variables],
  );
  const selectorLabelMap = useMemo(() => {
    return new Map(
      leafItems.map((item) => [item.selector.join("\x1f"), item.inlineLabel ?? item.label]),
    );
  }, [leafItems]);
  const getTokenLabel = useCallback(
    (reference: WorkflowVariableReference) =>
      selectorLabelMap.get(reference.selector.join("\x1f")) ?? `[${ownerLabel}] ${reference.alias}`,
    [ownerLabel, selectorLabelMap],
  );
  const pickerQuery = pickerMode === "toolbar" ? toolbarQuery : (slashContext?.query ?? "");
  const firstVisibleItem = useMemo(
    () => leafItems.find((item) => matchesVariableQuery(item, pickerQuery)) ?? null,
    [leafItems, pickerQuery],
  );
  const externalSignature = useMemo(
    () => buildStateSignature(value, references),
    [references, value],
  );

  useEffect(() => {
    pickerModeRef.current = pickerMode;
  }, [pickerMode]);

  const syncComposerHeight = useCallback(() => {
    const editorElement = contentEditableRef.current;
    if (!editorElement) {
      return;
    }

    const nextHeight = Math.max(editorElement.scrollHeight || 0, 56);
    setPickerTop(Math.min(nextHeight + 28, 280));
  }, []);

  const commitEditorState = useCallback(
    (editorState: EditorState) => {
      const nextDocument = editorState.read(() => readDocumentFromEditorState());
      const usedRefIds = new Set(
        nextDocument.segments.flatMap((segment) =>
          segment.type === "variable" ? [segment.refId] : [],
        ),
      );
      const sourceReferences = pendingCommitReferencesRef.current ?? referencesRef.current;
      const nextReferences = sourceReferences.filter((reference) => usedRefIds.has(reference.refId));

      referencesRef.current = nextReferences;
      pendingCommitReferencesRef.current = null;
      lastCommittedSignatureRef.current = buildStateSignature(nextDocument, nextReferences);
      onChange({
        document: nextDocument,
        references: nextReferences,
      });
    },
    [onChange],
  );

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    if (externalSignature === lastCommittedSignatureRef.current) {
      lastExternalSignatureRef.current = externalSignature;
      syncVariableNodeLabels({
        editor,
        references,
        getTokenLabel,
      });
      syncComposerHeight();
      return;
    }

    if (externalSignature === lastExternalSignatureRef.current) {
      syncComposerHeight();
      return;
    }

    lastExternalSignatureRef.current = externalSignature;
    if (externalSignature !== lastCommittedSignatureRef.current) {
      referencesRef.current = references;
      populateEditorFromDocument({
        editor,
        document: value,
        references,
        getTokenLabel,
      });
      lastCommittedSignatureRef.current = externalSignature;
      syncComposerHeight();
      return;
    }
  }, [externalSignature, getTokenLabel, references, syncComposerHeight, value]);

  const handleInsert = useCallback(
    (selector: string[]) => {
      const editor = editorRef.current;
      if (!editor) {
        return;
      }

      const activeSlashContext =
        pickerModeRef.current === "slash" ? slashContextRef.current : null;
      pickerModeRef.current = null;
      slashContextRef.current = null;
      setPickerMode(null);
      setSlashContext(null);
      setToolbarQuery("");

      editor.update(
        () => {
          const currentReferences = referencesRef.current;
          const existingReference = findReferenceBySelector(currentReferences, selector);
          const nextReference =
            existingReference ??
            buildReplyVariableReference({
              ownerNodeId,
              aliasBase: selector[selector.length - 1] || "value",
              selector,
              existingAliases: currentReferences.map((reference) => reference.alias),
            });
          const nextReferences = existingReference
            ? currentReferences
            : [...currentReferences, nextReference];

          if (!existingReference) {
            referencesRef.current = nextReferences;
          }
          pendingCommitReferencesRef.current = nextReferences;

          if (activeSlashContext) {
            const slashNode = $getNodeByKey(activeSlashContext.nodeKey);
            if ($isTextNode(slashNode)) {
              slashNode.select(activeSlashContext.startOffset, activeSlashContext.endOffset);
            }
          }

          let selection = $getSelection();
          if (!$isRangeSelection(selection)) {
            $getRoot().selectEnd();
            selection = $getSelection();
          }

          if (!$isRangeSelection(selection)) {
            return;
          }

          $insertNodes([
            $createWorkflowVariableTextEditorNode(
              nextReference.refId,
              nextReference.selector,
              getTokenLabel(nextReference),
            ),
          ]);
        },
        {
          tag: INSERT_TOKEN_TAG,
          onUpdate: () => {
            commitEditorState(editor.getEditorState());
          },
        },
      );
      contentEditableRef.current?.focus();
    },
    [commitEditorState, getTokenLabel, ownerNodeId],
  );

  const handleUpdate = useCallback(
    (editorState: EditorState, tags: Set<string>, hasContentChanges: boolean) => {
      const nextSlashContext = editorState.read(() => readSlashContextFromSelection());
      slashContextRef.current = nextSlashContext;
      setSlashContext(nextSlashContext);
      syncComposerHeight();

      if (nextSlashContext) {
        setPickerMode("slash");
        setToolbarQuery("");
      } else if (pickerModeRef.current === "slash") {
        setPickerMode(null);
      }

      if (tags.has(EXTERNAL_SYNC_TAG) || tags.has(LABEL_SYNC_TAG) || !hasContentChanges) {
        return;
      }

      commitEditorState(editorState);
    },
    [commitEditorState, syncComposerHeight],
  );

  const handleCopySelection = useCallback((event: ClipboardEvent | KeyboardEvent | null) => {
    if (!event || !("clipboardData" in event) || !event.clipboardData) {
      return false;
    }

    const selectionText = editorRef.current?.getEditorState().read(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) {
        return null;
      }

      const hasSelectedToken = selection
        .getNodes()
        .some((node) => $isWorkflowVariableTextEditorNode(node));
      return hasSelectedToken ? selection.getTextContent() : null;
    });

    if (!selectionText) {
      return false;
    }

    event.preventDefault();
    event.clipboardData.setData("text/plain", selectionText);
    return true;
  }, []);

  const handleCutSelection = useCallback((event: ClipboardEvent | KeyboardEvent | null) => {
    if (!event || !("clipboardData" in event) || !event.clipboardData) {
      return false;
    }

    let selectionText: string | null = null;
    const editor = editorRef.current;
    pendingCommitReferencesRef.current = referencesRef.current;
    editor?.update(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) {
        return;
      }

      const hasSelectedToken = selection
        .getNodes()
        .some((node) => $isWorkflowVariableTextEditorNode(node));
      if (!hasSelectedToken) {
        return;
      }

      selectionText = selection.getTextContent();
      selection.removeText();
    }, {
      tag: INSERT_TOKEN_TAG,
      onUpdate: () => {
        commitEditorState(editor.getEditorState());
      },
    });

    if (!selectionText) {
      return false;
    }

    event.preventDefault();
    event.clipboardData.setData("text/plain", selectionText);
    return true;
  }, [commitEditorState]);

  const handlePasteSelection = useCallback(
    (event: ClipboardEvent | null) => {
      const clipboardText = event?.clipboardData?.getData("text/plain") ?? "";
      if (!clipboardText.includes("{{")) {
        return false;
      }

      const parsed = parseReplyTemplateToDocument({
        ownerNodeId,
        ownerLabel,
        replyTemplate: clipboardText,
      });
      if (parsed.references.length === 0) {
        return false;
      }

      event?.preventDefault();
      const parsedReferenceMap = new Map(
        parsed.references.map((reference) => [reference.refId, reference]),
      );

      const editor = editorRef.current;
      editor?.update(
        () => {
          let selection = $getSelection();
          if (!$isRangeSelection(selection)) {
            $getRoot().selectEnd();
            selection = $getSelection();
          }

          if (!$isRangeSelection(selection)) {
            return;
          }

          const nextReferences = [...referencesRef.current];
          const nodes: LexicalNode[] = [];

          parsed.document.segments.forEach((segment) => {
            if (segment.type === "text") {
              if (segment.text.length > 0) {
                nodes.push($createTextNode(segment.text));
              }
              return;
            }

            const parsedReference = parsedReferenceMap.get(segment.refId);
            if (!parsedReference) {
              return;
            }

            const existingReference = findReferenceBySelector(nextReferences, parsedReference.selector);
            const nextReference =
              existingReference ??
              buildReplyVariableReference({
                ownerNodeId,
                aliasBase: parsedReference.selector.at(-1) || "value",
                selector: parsedReference.selector,
                existingAliases: nextReferences.map((reference) => reference.alias),
              });

            if (!existingReference) {
              nextReferences.push(nextReference);
            }

            nodes.push(
              $createWorkflowVariableTextEditorNode(
                nextReference.refId,
                nextReference.selector,
                getTokenLabel(nextReference),
              ),
            );
          });

          if (nodes.length === 0) {
            return;
          }

          referencesRef.current = nextReferences;
          pendingCommitReferencesRef.current = nextReferences;
          selection.insertNodes(nodes);
        },
        {
          tag: INSERT_TOKEN_TAG,
          onUpdate: () => {
            commitEditorState(editor.getEditorState());
          },
        },
      );

      return true;
    },
    [commitEditorState, getTokenLabel, ownerLabel, ownerNodeId],
  );

  const handleRemoveAdjacentToken = useCallback(
    (direction: "backward" | "forward") => {
      const editor = editorRef.current;
      if (!editor) {
        return false;
      }

      let removed = false;
      pendingCommitReferencesRef.current = referencesRef.current;
      editor.update(
        () => {
          const token = resolveAdjacentVariableNode(direction);
          if (!token) {
            return;
          }

          token.remove();
          removed = true;
        },
        {
          tag: INSERT_TOKEN_TAG,
          onUpdate: () => {
            if (removed) {
              commitEditorState(editor.getEditorState());
            }
          },
        },
      );

      return removed;
    },
    [commitEditorState],
  );

  const initialConfig = useMemo(
    () => ({
      namespace: "workflow-variable-text-editor",
      editable: true,
      nodes: [WorkflowVariableTextEditorNode],
      onError(error: Error) {
        throw error;
      },
      editorState(editor: LexicalEditor) {
        populateEditorFromDocument({
          editor,
          document: value,
          references,
          getTokenLabel,
        });
      },
    }),
    [getTokenLabel, references, value],
  );

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
            contentEditableRef.current?.focus();
          }}
        >
          变量
        </button>
      </div>

      <div className="workflow-variable-text-editor-composer">
        <LexicalComposer initialConfig={initialConfig}>
          <PlainTextPlugin
            contentEditable={
              <ContentEditable
                ref={contentEditableRef}
                data-component="workflow-variable-text-editor-input"
                className="workflow-variable-text-editor-input"
                aria-label={ariaLabel}
              />
            }
            placeholder={
              <div className="workflow-variable-text-editor-placeholder">
                {placeholder}
              </div>
            }
            ErrorBoundary={LexicalErrorBoundary}
          />
          <HistoryPlugin />
          <WorkflowVariableTextEditorBridge
            onReady={(editor) => {
              editorRef.current = editor;
              referencesRef.current = references;
              if (contentEditableRef.current) {
                Object.assign(contentEditableRef.current, { __lexicalEditor: editor });
              }
              syncComposerHeight();
            }}
            onUpdate={handleUpdate}
            onInsertSlashVariable={() => {
              if (!firstVisibleItem || pickerModeRef.current !== "slash") {
                return false;
              }

              handleInsert(firstVisibleItem.selector);
              return true;
            }}
            onRemoveBackwardToken={() => handleRemoveAdjacentToken("backward")}
            onRemoveForwardToken={() => handleRemoveAdjacentToken("forward")}
            onDismissPicker={() => {
              setPickerMode(null);
            }}
            onCopySelection={handleCopySelection}
            onCutSelection={handleCutSelection}
            onPasteSelection={handlePasteSelection}
          />
        </LexicalComposer>

        {pickerMode !== null ? (
          <div className="workflow-variable-reference-popover-anchor" style={{ top: `${pickerTop}px` }}>
            <WorkflowVariableReferencePicker
              groups={variables}
              onInsert={handleInsert}
              onDismiss={() => setPickerMode(null)}
              query={pickerQuery}
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

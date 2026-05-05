import type { LexicalEditor } from 'lexical';
import type {
  FocusEvent,
  KeyboardEvent,
  MutableRefObject,
  Ref
} from 'react';
import type { FlowSelectorOption } from '../../../lib/selector-options';

import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import {
  $getRoot,
  $getSelection,
  $insertNodes,
  $isRangeSelection,
} from 'lexical';
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  getTemplateSelectorLabel,
} from '../../../lib/template-binding';
import { TemplateVariableReplacementPlugin } from './TemplateVariableReplacementPlugin';
import {
  $createTemplateVariableNode,
  TemplateVariableNode,
} from './TemplateVariableNode';
import { TemplateVariableTypeaheadPlugin } from './TemplateVariableTypeaheadPlugin';
import {
  editorStateToText,
  getTriggerContext,
  removeTriggerQueryBeforeSelection,
  textToEditorState,
} from './template-editor-utils';

const TRIGGER_CHARACTERS = new Set(['/', '{']);
const TYPEAHEAD_OFFSET = 8;
const TYPEAHEAD_MIN_LEFT = 8;
const TYPEAHEAD_MIN_TOP = 8;
const TYPEAHEAD_MAX_WIDTH = 320;
const TYPEAHEAD_HORIZONTAL_GUTTER = 16;
const DEFAULT_TYPEAHEAD_POSITION = {
  left: 8,
  top: 36,
  width: 304
};

interface TypeaheadPosition {
  left: number;
  top: number;
  width: number;
}

export interface LexicalTemplatedTextEditorHandle {
  focus: () => void;
  insertSelector: (selector: string[]) => void;
  openVariablePicker: () => void;
}

interface LexicalTemplatedTextEditorProps {
  ariaLabel: string;
  placeholder?: string;
  options: FlowSelectorOption[];
  value: string;
  onChange: (value: string) => void;
  onTriggerChange?: (open: boolean) => void;
}

interface EditorApiBridgeProps {
  editorRef: MutableRefObject<LexicalEditor | null>;
  apiRef: MutableRefObject<LexicalTemplatedTextEditorHandle | null>;
  options: FlowSelectorOption[];
  forwardedRef: Ref<LexicalTemplatedTextEditorHandle>;
  onOpenVariablePicker: () => void;
}

function ControlledValuePlugin({
  value,
  options
}: {
  value: string;
  options: FlowSelectorOption[];
}) {
  const [editor] = useLexicalComposerContext();

  useLayoutEffect(() => {
    const currentText = editor.getEditorState().read(() => $getRoot().getTextContent());

    if (currentText === value) {
      return;
    }

    const nextState = editor.parseEditorState(textToEditorState(value));
    editor.setEditorState(nextState);
  }, [editor, options, value]);

  return null;
}

function insertSelectorNode(
  editor: LexicalEditor,
  selector: string[],
  options: FlowSelectorOption[]
) {
  const label = getTemplateSelectorLabel(selector, options);

  editor.focus();
  editor.update(() => {
    if (!$isRangeSelection($getSelection())) {
      $getRoot().selectEnd();
    }

    removeTriggerQueryBeforeSelection(TRIGGER_CHARACTERS);
    $insertNodes([$createTemplateVariableNode(selector, label)]);
  });
}

function getRangeRect(range: Range) {
  if (typeof range.getBoundingClientRect !== 'function') {
    return null;
  }

  const rangeRect = range.getBoundingClientRect();

  if (rangeRect.width > 0 || rangeRect.height > 0) {
    return rangeRect;
  }

  if (typeof range.getClientRects !== 'function') {
    return null;
  }

  const clientRects = range.getClientRects();

  return clientRects.length > 0 ? clientRects[0] : null;
}

function getViewportWidth() {
  if (typeof window === 'undefined') {
    return TYPEAHEAD_MAX_WIDTH + TYPEAHEAD_HORIZONTAL_GUTTER * 2;
  }

  return window.innerWidth;
}

function clampTypeaheadLeft(left: number, width: number) {
  const maxLeft = Math.max(
    TYPEAHEAD_MIN_LEFT,
    getViewportWidth() - width - TYPEAHEAD_HORIZONTAL_GUTTER
  );

  return Math.min(Math.max(TYPEAHEAD_MIN_LEFT, left), maxLeft);
}

function calculateTypeaheadPosition(container: HTMLElement) {
  const selection = window.getSelection();
  const containerRect = container.getBoundingClientRect();
  const width = Math.max(
    240,
    Math.min(TYPEAHEAD_MAX_WIDTH, containerRect.width - TYPEAHEAD_HORIZONTAL_GUTTER)
  );

  if (!selection || selection.rangeCount === 0) {
    return {
      left: clampTypeaheadLeft(containerRect.left + TYPEAHEAD_MIN_LEFT, width),
      top: Math.max(TYPEAHEAD_MIN_TOP, containerRect.top + 36),
      width
    };
  }

  const sourceRange = selection.getRangeAt(0);
  const range = typeof sourceRange.cloneRange === 'function'
    ? sourceRange.cloneRange()
    : sourceRange;
  const rangeRect = getRangeRect(range);

  if (!rangeRect) {
    return {
      left: clampTypeaheadLeft(containerRect.left + TYPEAHEAD_MIN_LEFT, width),
      top: Math.max(TYPEAHEAD_MIN_TOP, containerRect.top + 36),
      width
    };
  }

  return {
    left: clampTypeaheadLeft(rangeRect.left, width),
    top: Math.max(TYPEAHEAD_MIN_TOP, rangeRect.bottom + TYPEAHEAD_OFFSET),
    width
  };
}

function EditorApiBridge({
  editorRef,
  apiRef,
  options,
  forwardedRef,
  onOpenVariablePicker
}: EditorApiBridgeProps) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    editorRef.current = editor;

    return () => {
      editorRef.current = null;
    };
  }, [editor, editorRef]);

  useImperativeHandle(
    forwardedRef,
    () => ({
      focus() {
        editor.focus();
      },
      insertSelector(selector: string[]) {
        insertSelectorNode(editor, selector, options);
      },
      openVariablePicker() {
        onOpenVariablePicker();
      }
    }),
    [editor, onOpenVariablePicker, options]
  );

  useEffect(() => {
    apiRef.current = {
      focus() {
        editor.focus();
      },
      insertSelector(selector: string[]) {
        insertSelectorNode(editor, selector, options);
      },
      openVariablePicker() {
        onOpenVariablePicker();
      }
    };

    return () => {
      apiRef.current = null;
    };
  }, [apiRef, editor, onOpenVariablePicker, options]);

  return null;
}

export const LexicalTemplatedTextEditor = forwardRef<
  LexicalTemplatedTextEditorHandle,
  LexicalTemplatedTextEditorProps
>(function LexicalTemplatedTextEditor(
  {
    ariaLabel,
    options,
    value,
    onChange,
    onTriggerChange,
    placeholder
  },
  ref
) {
  const editorRef = useRef<LexicalEditor | null>(null);
  const apiRef = useRef<LexicalTemplatedTextEditorHandle | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const typeaheadRef = useRef<HTMLDivElement | null>(null);
  const blurCloseTimerRef = useRef<number | null>(null);
  const [typeaheadOpen, setTypeaheadOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [typeaheadPosition, setTypeaheadPosition] = useState<TypeaheadPosition>(
    DEFAULT_TYPEAHEAD_POSITION
  );

  const initialConfig = useMemo(
    () => ({
      namespace: 'agent-flow-templated-text-editor',
      nodes: [TemplateVariableNode],
      editorState: textToEditorState(value),
      onError(error: Error) {
        throw error;
      }
    }),
    [value]
  );

  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return options;
    }

    return options.filter((option) =>
      [
        option.displayLabel,
        option.nodeLabel,
        option.outputLabel,
        option.outputKey,
        option.value.join('.')
      ].some((candidate) => candidate.toLowerCase().includes(normalizedQuery))
    );
  }, [options, query]);

  useEffect(() => {
    if (!typeaheadOpen) {
      return;
    }

    setActiveIndex(filteredOptions.length > 0 ? 0 : -1);
  }, [filteredOptions.length, query, typeaheadOpen]);

  useEffect(() => () => {
    if (blurCloseTimerRef.current !== null) {
      window.clearTimeout(blurCloseTimerRef.current);
    }
  }, []);

  function clearBlurCloseTimer() {
    if (blurCloseTimerRef.current === null) {
      return;
    }

    window.clearTimeout(blurCloseTimerRef.current);
    blurCloseTimerRef.current = null;
  }

  function isInsideEditorOrTypeahead(node: EventTarget | null) {
    return (
      node instanceof Node &&
      (shellRef.current?.contains(node) || typeaheadRef.current?.contains(node))
    );
  }

  function openTypeahead(
    nextQuery = '',
    nextPosition: TypeaheadPosition = DEFAULT_TYPEAHEAD_POSITION
  ) {
    clearBlurCloseTimer();
    setQuery(nextQuery);
    setActiveIndex(0);
    setTypeaheadPosition(nextPosition);
    setTypeaheadOpen(true);
    onTriggerChange?.(true);
  }

  function openTypeaheadAtSelection(nextQuery = '') {
    openTypeahead(
      nextQuery,
      shellRef.current
        ? calculateTypeaheadPosition(shellRef.current)
        : DEFAULT_TYPEAHEAD_POSITION
    );
  }

  function closeTypeahead() {
    setQuery('');
    setActiveIndex(0);
    setTypeaheadPosition(DEFAULT_TYPEAHEAD_POSITION);
    setTypeaheadOpen(false);
    onTriggerChange?.(false);
  }

  function handleBlur(event: FocusEvent<HTMLDivElement>) {
    const nextFocusedNode = event.relatedTarget;

    if (isInsideEditorOrTypeahead(nextFocusedNode)) {
      return;
    }

    if (blurCloseTimerRef.current !== null) {
      window.clearTimeout(blurCloseTimerRef.current);
    }

    blurCloseTimerRef.current = window.setTimeout(() => {
      blurCloseTimerRef.current = null;

      if (isInsideEditorOrTypeahead(document.activeElement)) {
        return;
      }

      closeTypeahead();
    }, 120);
  }

  function handleOpenVariablePicker() {
    editorRef.current?.focus();
    openTypeaheadAtSelection();
  }

  function handleEditorKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!typeaheadOpen && event.key.length === 1 && TRIGGER_CHARACTERS.has(event.key)) {
      openTypeaheadAtSelection();
      return;
    }

    if (typeaheadOpen && event.key.length === 1) {
      window.setTimeout(() => {
        editorRef.current?.getEditorState().read(() => {
          const triggerContext = getTriggerContext(TRIGGER_CHARACTERS);
          const nextQuery = triggerContext?.query ?? '';

          setQuery(nextQuery);
          if (triggerContext) {
            openTypeaheadAtSelection(nextQuery);
          }
        });
      }, 0);
    }

    handleTypeaheadKeyDown(event);
  }

  function handleTypeaheadKeyDown(
    event: KeyboardEvent<HTMLDivElement | HTMLInputElement>
  ) {
    if (!typeaheadOpen) {
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();

      if (filteredOptions.length === 0) {
        return;
      }

      setActiveIndex((currentIndex) => {
        const nextIndex = currentIndex + 1;

        return nextIndex >= filteredOptions.length ? 0 : nextIndex;
      });
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();

      if (filteredOptions.length === 0) {
        return;
      }

      setActiveIndex((currentIndex) => {
        const nextIndex = currentIndex - 1;

        return nextIndex < 0 ? filteredOptions.length - 1 : nextIndex;
      });
      return;
    }

    if (event.key === 'Enter' || event.key === 'Tab') {
      const activeOption = filteredOptions[activeIndex];

      if (!activeOption) {
        return;
      }

      event.preventDefault();
      handleSelect(activeOption.value);
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      closeTypeahead();
      editorRef.current?.focus();
    }
  }

  function handleSelect(selector: string[]) {
    apiRef.current?.insertSelector(selector);
    closeTypeahead();
  }

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <div
        data-testid="templated-text-editor-shell"
        ref={shellRef}
        className="agent-flow-templated-text-field__editor-shell"
        onBlurCapture={handleBlur}
      >
        <RichTextPlugin
          contentEditable={
            <ContentEditable
              aria-label={ariaLabel}
              role="textbox"
              aria-multiline="true"
              className="agent-flow-templated-text-field__editor"
              onKeyDown={handleEditorKeyDown}
            />
          }
          placeholder={
            <div className="agent-flow-templated-text-field__placeholder">
              {placeholder || '输入模板内容'}
            </div>
          }
          ErrorBoundary={LexicalErrorBoundary}
        />
        <TemplateVariableTypeaheadPlugin
          popupRef={typeaheadRef}
          open={typeaheadOpen}
          options={filteredOptions}
          query={query}
          activeIndex={activeIndex}
          position={typeaheadPosition}
          onQueryChange={setQuery}
          onKeyDown={handleTypeaheadKeyDown}
          onSelect={handleSelect}
        />
      </div>
      <TemplateVariableReplacementPlugin options={options} />
      <ControlledValuePlugin value={value} options={options} />
      <EditorApiBridge
        editorRef={editorRef}
        apiRef={apiRef}
        options={options}
        forwardedRef={ref}
        onOpenVariablePicker={handleOpenVariablePicker}
      />
      <OnChangePlugin
        ignoreSelectionChange
        onChange={(editorState) => {
          onChange(editorStateToText(editorState));
        }}
      />
      <HistoryPlugin />
    </LexicalComposer>
  );
});

import type { LexicalEditor } from 'lexical';
import type { FocusEvent, FormEvent, KeyboardEvent, MutableRefObject, Ref } from 'react';
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
  removeTrailingTriggerCharacter,
  textToEditorState,
} from './template-editor-utils';

const TRIGGER_CHARACTERS = new Set(['/', '{']);
const TYPEAHEAD_OFFSET = 8;
const DEFAULT_TYPEAHEAD_POSITION = {
  left: 0,
  top: 140
};

interface TypeaheadPosition {
  left: number;
  top: number;
}

export interface LexicalTemplatedTextEditorHandle {
  focus: () => void;
  insertSelector: (selector: string[]) => void;
  openVariablePicker: () => void;
}

interface LexicalTemplatedTextEditorProps {
  ariaLabel: string;
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

  useEffect(() => {
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

    removeTrailingTriggerCharacter(TRIGGER_CHARACTERS);
    $insertNodes([$createTemplateVariableNode(selector, label)]);
  });
}

function getTypeaheadPosition(
  anchorElement: HTMLElement | null,
  anchorRect?: DOMRect | null
): TypeaheadPosition {
  if (!anchorElement || !anchorRect) {
    return DEFAULT_TYPEAHEAD_POSITION;
  }

  const anchorElementRect = anchorElement.getBoundingClientRect();

  return {
    left: Math.max(anchorRect.left - anchorElementRect.left, 0),
    top: Math.max(anchorRect.bottom - anchorElementRect.top + TYPEAHEAD_OFFSET, 48)
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
    onTriggerChange
  },
  ref
) {
  const editorRef = useRef<LexicalEditor | null>(null);
  const apiRef = useRef<LexicalTemplatedTextEditorHandle | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
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
    []
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

  function openTypeahead(
    nextQuery = '',
    nextPosition: TypeaheadPosition = DEFAULT_TYPEAHEAD_POSITION
  ) {
    setQuery(nextQuery);
    setActiveIndex(0);
    setTypeaheadPosition(nextPosition);
    setTypeaheadOpen(true);
    onTriggerChange?.(true);
  }

  function closeTypeahead() {
    setQuery('');
    setActiveIndex(0);
    setTypeaheadPosition(DEFAULT_TYPEAHEAD_POSITION);
    setTypeaheadOpen(false);
    onTriggerChange?.(false);
  }

  function handleInput(event: FormEvent<HTMLDivElement>) {
    const text = event.currentTarget.textContent ?? '';

    if (text.length > 0 && TRIGGER_CHARACTERS.has(text[text.length - 1])) {
      const domSelection = document.getSelection();
      const range = domSelection && domSelection.rangeCount > 0
        ? domSelection.getRangeAt(0)
        : null;
      const anchorRect = range && typeof range.getBoundingClientRect === 'function'
        ? range.getBoundingClientRect()
        : event.currentTarget.getBoundingClientRect();

      openTypeahead('', getTypeaheadPosition(event.currentTarget, anchorRect));
    }
  }

  function handleBlur(event: FocusEvent<HTMLDivElement>) {
    const nextFocusedNode = event.relatedTarget;

    if (nextFocusedNode instanceof Node && shellRef.current?.contains(nextFocusedNode)) {
      return;
    }

    window.setTimeout(() => {
      closeTypeahead();
    }, 120);
  }

  function handleOpenVariablePicker() {
    editorRef.current?.focus();
    openTypeahead();
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

    if (event.key === 'Enter') {
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
              onInputCapture={handleInput}
            />
          }
          placeholder={
            <div className="agent-flow-templated-text-field__placeholder">
              输入模板内容，输入“/”或左花括号插入变量
            </div>
          }
          ErrorBoundary={LexicalErrorBoundary}
        />
        <TemplateVariableTypeaheadPlugin
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
        onChange={(editorState) => {
          onChange(editorStateToText(editorState));
        }}
      />
      <HistoryPlugin />
    </LexicalComposer>
  );
});

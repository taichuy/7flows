import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useLexicalNodeSelection } from '@lexical/react/useLexicalNodeSelection';
import { mergeRegister } from '@lexical/utils';
import {
  $getNodeByKey,
  $getSelection,
  $isDecoratorNode,
  $isNodeSelection,
  COMMAND_PRIORITY_LOW,
  KEY_BACKSPACE_COMMAND,
  KEY_DELETE_COMMAND,
} from 'lexical';
import { useEffect, useRef } from 'react';

interface TemplateVariableChipProps {
  label: string;
  nodeKey: string;
}

export function TemplateVariableChip({
  label,
  nodeKey
}: TemplateVariableChipProps) {
  const chipRef = useRef<HTMLSpanElement | null>(null);
  const [editor] = useLexicalComposerContext();
  const [isSelected, setSelected, clearSelection] = useLexicalNodeSelection(nodeKey);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      event.stopPropagation();
      clearSelection();
      setSelected(true);
    }

    const node = chipRef.current;
    node?.addEventListener('click', handleClick);

    return () => node?.removeEventListener('click', handleClick);
  }, [clearSelection, setSelected]);

  useEffect(() => {
    function handleDelete(event: KeyboardEvent) {
      const selection = $getSelection();

      if (!isSelected || !$isNodeSelection(selection)) {
        return false;
      }

      event.preventDefault();

      const node = $getNodeByKey(nodeKey);

      if ($isDecoratorNode(node)) {
        node.remove();
        return true;
      }

      return false;
    }

    return mergeRegister(
      editor.registerCommand(KEY_BACKSPACE_COMMAND, handleDelete, COMMAND_PRIORITY_LOW),
      editor.registerCommand(KEY_DELETE_COMMAND, handleDelete, COMMAND_PRIORITY_LOW)
    );
  }, [editor, isSelected, nodeKey]);

  return (
    <span
      ref={chipRef}
      className={`agent-flow-templated-text-field__chip${
        isSelected ? ' agent-flow-templated-text-field__chip--selected' : ''
      }`}
      contentEditable={false}
      data-testid="templated-text-inline-chip"
    >
      {label}
    </span>
  );
}

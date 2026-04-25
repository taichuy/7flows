import type { EditorState } from 'lexical';

import {
  $getRoot,
  $getSelection,
  $isRangeSelection,
  TextNode,
} from 'lexical';

export function textToEditorState(text: string) {
  const paragraphs = typeof text === 'string' && text.length > 0 ? text.split('\n') : [''];

  return JSON.stringify({
    root: {
      children: paragraphs.map((paragraph) => ({
        children: [
          {
            detail: 0,
            format: 0,
            mode: 'normal',
            style: '',
            text: paragraph,
            type: 'text',
            version: 1
          }
        ],
        direction: null,
        format: '',
        indent: 0,
        type: 'paragraph',
        version: 1
      })),
      direction: null,
      format: '',
      indent: 0,
      type: 'root',
      version: 1
    }
  });
}

export function editorStateToText(editorState: EditorState) {
  return editorState.read(() => $getRoot().getTextContent());
}

export function getCollapsedTextSelection() {
  const selection = $getSelection();

  if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
    return null;
  }

  if (selection.anchor.type !== 'text') {
    return null;
  }

  const anchorNode = selection.anchor.getNode();

  if (!(anchorNode instanceof TextNode) || !anchorNode.isSimpleText()) {
    return null;
  }

  return {
    selection,
    anchorNode,
    offset: selection.anchor.offset
  };
}

export function removeTrailingTriggerCharacter(
  triggers: ReadonlySet<string>
) {
  const context = getCollapsedTextSelection();

  if (!context || context.offset <= 0) {
    return false;
  }

  const text = context.anchorNode.getTextContent();
  const trailingCharacter = text[context.offset - 1];

  if (!triggers.has(trailingCharacter)) {
    return false;
  }

  const startOffset = context.offset - 1;

  if (startOffset === 0) {
    const [triggerNode] = context.anchorNode.splitText(context.offset);
    triggerNode.remove();
    return true;
  }

  const [, triggerNode] = context.anchorNode.splitText(startOffset, context.offset);
  triggerNode.remove();
  return true;
}

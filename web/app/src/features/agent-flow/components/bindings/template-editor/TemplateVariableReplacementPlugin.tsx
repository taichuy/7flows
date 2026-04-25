import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { mergeRegister } from '@lexical/utils';
import { useEffect } from 'react';
import { $isTextNode, TextNode } from 'lexical';

import type { FlowSelectorOption } from '../../../lib/selector-options';
import {
  TEMPLATE_SELECTOR_REGEX,
  getTemplateSelectorLabel,
} from '../../../lib/template-binding';
import { $createTemplateVariableNode } from './TemplateVariableNode';

interface TemplateVariableReplacementPluginProps {
  options: FlowSelectorOption[];
}

export function TemplateVariableReplacementPlugin({
  options
}: TemplateVariableReplacementPluginProps) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return mergeRegister(
      editor.registerNodeTransform(TextNode, (node) => {
        if (!$isTextNode(node) || !node.isSimpleText()) {
          return;
        }

        const text = node.getTextContent();
        TEMPLATE_SELECTOR_REGEX.lastIndex = 0;
        const match = TEMPLATE_SELECTOR_REGEX.exec(text);

        if (!match?.[1] || !match[2]) {
          return;
        }

        const selector = [match[1], match[2]];
        const label = getTemplateSelectorLabel(selector, options);
        const startOffset = match.index;
        const endOffset = startOffset + match[0].length;

        if (startOffset === 0) {
          const [tokenNode] = node.splitText(endOffset);
          tokenNode.replace($createTemplateVariableNode(selector, label));
          return;
        }

        const [, tokenNode] = node.splitText(startOffset, endOffset);
        tokenNode.replace($createTemplateVariableNode(selector, label));
      })
    );
  }, [editor, options]);

  return null;
}

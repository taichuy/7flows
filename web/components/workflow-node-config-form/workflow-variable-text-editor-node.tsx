"use client";

import React from "react";
import type {
  EditorConfig,
  LexicalEditor,
  LexicalNode,
  NodeKey,
  SerializedLexicalNode,
  Spread,
} from "lexical";
import { DecoratorNode } from "lexical";

type SerializedWorkflowVariableTextEditorNode = Spread<
  {
    refId: string;
    selector: string[];
    label: string;
  },
  SerializedLexicalNode
>;

export class WorkflowVariableTextEditorNode extends DecoratorNode<React.JSX.Element> {
  __refId: string;
  __selector: string[];
  __label: string;

  static getType() {
    return "workflow-variable-text-editor-node";
  }

  static clone(node: WorkflowVariableTextEditorNode) {
    return new WorkflowVariableTextEditorNode(
      node.__refId,
      node.__selector,
      node.__label,
      node.__key,
    );
  }

  static importJSON(serializedNode: SerializedWorkflowVariableTextEditorNode) {
    return new WorkflowVariableTextEditorNode(
      serializedNode.refId,
      serializedNode.selector,
      serializedNode.label,
    );
  }

  constructor(refId: string, selector: string[], label: string, key?: NodeKey) {
    super(key);
    this.__refId = refId;
    this.__selector = selector;
    this.__label = label;
  }

  exportJSON(): SerializedWorkflowVariableTextEditorNode {
    return {
      type: WorkflowVariableTextEditorNode.getType(),
      version: 1,
      refId: this.__refId,
      selector: this.__selector,
      label: this.__label,
    };
  }

  createDOM(_config: EditorConfig) {
    const element = document.createElement("span");
    element.className = "workflow-variable-inline-token-host";
    return element;
  }

  updateDOM() {
    return false;
  }

  decorate(_editor: LexicalEditor, _config: EditorConfig) {
    return (
      <span
        className="workflow-variable-inline-token"
        data-component="workflow-variable-inline-token"
      >
        {this.__label}
      </span>
    );
  }

  isInline() {
    return true;
  }

  getTextContent() {
    return `{{#${this.__selector.join(".")}#}}`;
  }

  getRefId() {
    return this.getLatest().__refId;
  }

  getSelector() {
    return this.getLatest().__selector;
  }

  getLabel() {
    return this.getLatest().__label;
  }

  setLabel(label: string) {
    this.getWritable().__label = label;
  }
}

export function $createWorkflowVariableTextEditorNode(
  refId: string,
  selector: string[],
  label: string,
) {
  return new WorkflowVariableTextEditorNode(refId, selector, label);
}

export function $isWorkflowVariableTextEditorNode(
  node: LexicalNode | null | undefined,
): node is WorkflowVariableTextEditorNode {
  return node instanceof WorkflowVariableTextEditorNode;
}

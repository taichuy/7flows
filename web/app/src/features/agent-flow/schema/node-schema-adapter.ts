import type { FlowAuthoringDocument, FlowNodeDocument } from '@1flowbase/flow-schema';

import { replaceNodeOutputs, updateNodeField } from '../lib/document/transforms/node';
import { getDirectDownstreamNodes } from '../lib/document/relations';
import { listVisibleSelectorOptions } from '../lib/selector-options';
import { getNodeDefinitionMeta } from '../lib/node-definitions';

import type { SchemaAdapter } from '../../../shared/schema-ui/registry/create-renderer-registry';

function getNode(document: FlowAuthoringDocument, nodeId: string) {
  const node = document.graph.nodes.find((candidate) => candidate.id === nodeId);

  if (!node) {
    throw new Error(`Missing agent-flow node: ${nodeId}`);
  }

  return node;
}

function omitKey<T extends Record<string, unknown>>(value: T, key: string) {
  if (!(key in value)) {
    return value;
  }

  const nextValue = { ...value };

  delete nextValue[key];
  return nextValue;
}

function createRootValues(node: FlowNodeDocument) {
  return {
    ...node,
    config: {
      ...node.config,
      output_contract: node.outputs
    }
  };
}

export function createAgentFlowNodeSchemaAdapter({
  document,
  nodeId,
  setWorkingDocument,
  dispatch
}: {
  document: FlowAuthoringDocument;
  nodeId: string;
  setWorkingDocument: (
    update:
      | FlowAuthoringDocument
      | ((document: FlowAuthoringDocument) => FlowAuthoringDocument)
  ) => void;
  dispatch: (actionKey: string, payload?: unknown) => void;
}): SchemaAdapter {
  const node = getNode(document, nodeId);

  return {
    getValue(path: string) {
      if (path === 'alias') {
        return node.alias;
      }

      if (path === 'description') {
        return node.description ?? '';
      }

      if (path === 'config.output_contract' || path === 'outputs') {
        return node.outputs;
      }

      if (path.startsWith('outputs.')) {
        return node.outputs.find((output) => output.key === path.slice('outputs.'.length))
          ?.title;
      }

      if (path.startsWith('config.')) {
        return node.config[path.slice('config.'.length)];
      }

      if (path.startsWith('bindings.')) {
        return node.bindings[path.slice('bindings.'.length)];
      }

      return undefined;
    },
    setValue(path: string, value: unknown) {
      if (path === 'config.output_contract' && Array.isArray(value)) {
        setWorkingDocument((currentDocument) => {
          const nextDocument = replaceNodeOutputs(currentDocument, nodeId, value);

          return {
            ...nextDocument,
            graph: {
              ...nextDocument.graph,
              nodes: nextDocument.graph.nodes.map((candidate) =>
                candidate.id === nodeId
                  ? {
                      ...candidate,
                      config: omitKey(candidate.config, 'output_contract')
                    }
                  : candidate
              )
            }
          };
        });

        return;
      }

      setWorkingDocument((currentDocument) =>
        updateNodeField(currentDocument, {
          nodeId,
          fieldKey: path,
          value: value as never
        })
      );
    },
    getDerived(key: string) {
      if (key === 'rootValues') {
        return createRootValues(node);
      }

      if (key === 'node' || key === 'selectedNode') {
        return node;
      }

      if (key === 'definitionMeta') {
        return getNodeDefinitionMeta(node.type);
      }

      if (key === 'selectorOptions') {
        return listVisibleSelectorOptions(document, nodeId);
      }

      if (key === 'downstreamNodes') {
        return getDirectDownstreamNodes(document, nodeId);
      }

      if (key === 'outputContract') {
        return node.outputs;
      }

      return null;
    },
    dispatch
  };
}

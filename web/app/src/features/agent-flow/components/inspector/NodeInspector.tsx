import type {
  SchemaBlock,
  CanvasNodeSchema
} from '../../../../shared/schema-ui/contracts/canvas-node-schema';
import { SchemaRenderer } from '../../../../shared/schema-ui/runtime/SchemaRenderer';
import { evaluateSchemaRule } from '../../../../shared/schema-ui/runtime/rule-evaluator';
import type { SchemaAdapter } from '../../../../shared/schema-ui/registry/create-renderer-registry';
import { useEffect, useRef } from 'react';
import { Typography } from 'antd';

import { agentFlowRendererRegistry } from '../../schema/agent-flow-renderer-registry';
import { useAgentFlowEditorStore } from '../../store/editor/provider';
import { useNodeSchemaRuntime } from './use-node-schema-runtime';

function isSectionBlock(
  block: SchemaBlock
): block is Extract<SchemaBlock, { kind: 'section' }> {
  return block.kind === 'section';
}

function isFieldBlock(
  block: SchemaBlock
): block is Extract<SchemaBlock, { kind: 'field' }> {
  return block.kind === 'field';
}

function isInlineFieldRenderer(renderer: string) {
  return (
    renderer === 'text' || renderer === 'number' || renderer === 'selector'
  );
}

function hasEmbeddedLabel(renderer: string) {
  return (
    renderer === 'templated_text' || renderer === 'output_contract_definition'
  );
}

function shouldRenderSectionTitle(title: string) {
  return title !== 'Inputs';
}

function resolveFocusableFieldKey(fieldKey: string) {
  if (
    fieldKey === 'config.model' ||
    fieldKey === 'config.provider_code' ||
    fieldKey === 'config.provider_instance_id'
  ) {
    return 'config.model_provider';
  }

  return fieldKey;
}

function getRootValues(adapter: SchemaAdapter) {
  return (
    (adapter.getDerived('rootValues') as Record<string, unknown> | null) ?? {}
  );
}

function shouldRenderFieldBlock(
  block: Extract<SchemaBlock, { kind: 'field' }>,
  adapter: SchemaAdapter,
  capabilities: readonly string[]
) {
  return evaluateSchemaRule(block.visibleWhen, {
    values: getRootValues(adapter),
    capabilities
  });
}

export function NodeInspector({
  schema,
  adapter
}: {
  schema?: CanvasNodeSchema;
  adapter?: SchemaAdapter;
} = {}) {
  const rootRef = useRef<HTMLElement | null>(null);
  const setSelection = useAgentFlowEditorStore((state) => state.setSelection);
  const focusFieldKey = useAgentFlowEditorStore(
    (state) => state.focusedFieldKey
  );
  const runtime = useNodeSchemaRuntime(!schema || !adapter);
  const activeSchema = schema ?? runtime.schema;
  const activeAdapter = adapter ?? runtime.adapter;
  const configBlocks = activeSchema?.detail.tabs.config.blocks ?? [];

  useEffect(() => {
    if (!focusFieldKey || !rootRef.current) {
      return;
    }

    const timer = window.setTimeout(() => {
      const resolvedFieldKey = resolveFocusableFieldKey(focusFieldKey);
      const focusTarget = rootRef.current?.querySelector<HTMLElement>(
        `[data-field-key="${resolvedFieldKey}"] [aria-label]`
      );
      focusTarget?.focus();
      setSelection({
        focusedFieldKey: null
      });
    }, 0);

    return () => window.clearTimeout(timer);
  }, [focusFieldKey, setSelection]);

  if (!activeSchema || !activeAdapter) {
    return null;
  }

  return (
    <section ref={rootRef} className="agent-flow-node-detail__inspector">
      {configBlocks.map((block, blockIndex) => {
        if (!isSectionBlock(block)) {
          return (
            <SchemaRenderer
              key={`config-block-${blockIndex}`}
              adapter={activeAdapter}
              blocks={[block]}
              registry={agentFlowRendererRegistry}
              capabilities={activeSchema.capabilities}
            />
          );
        }

        return (
          <div
            key={block.title}
            className="agent-flow-node-detail__section agent-flow-node-detail__inspector-section"
            data-section-key={block.title}
          >
            {shouldRenderSectionTitle(block.title) ? (
              <div className="agent-flow-node-detail__section-header">
                <Typography.Title
                  level={5}
                  className="agent-flow-node-detail__section-title"
                >
                  {block.title}
                </Typography.Title>
              </div>
            ) : null}
            <div className="agent-flow-editor__inspector-fields">
              {block.blocks.map((childBlock, index) => {
                if (isFieldBlock(childBlock)) {
                  if (
                    !shouldRenderFieldBlock(
                      childBlock,
                      activeAdapter,
                      activeSchema.capabilities
                    )
                  ) {
                    return null;
                  }

                  return (
                    <div
                      key={childBlock.path}
                      className={[
                        'agent-flow-editor__inspector-field',
                        isInlineFieldRenderer(childBlock.renderer)
                          ? 'agent-flow-editor__inspector-field--inline'
                          : null
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      data-field-key={childBlock.path}
                      data-testid={`inspector-field-${childBlock.path}`}
                    >
                      {!hasEmbeddedLabel(childBlock.renderer) && (
                        <Typography.Text
                          strong
                          className="agent-flow-editor__inspector-field-label"
                        >
                          {childBlock.label}
                        </Typography.Text>
                      )}
                      <div className="agent-flow-editor__inspector-field-control">
                        <SchemaRenderer
                          adapter={activeAdapter}
                          blocks={[childBlock]}
                          registry={agentFlowRendererRegistry}
                          capabilities={activeSchema.capabilities}
                        />
                      </div>
                    </div>
                  );
                }

                return (
                  <SchemaRenderer
                    key={`${block.title}-${index}`}
                    adapter={activeAdapter}
                    blocks={[childBlock]}
                    registry={agentFlowRendererRegistry}
                    capabilities={activeSchema.capabilities}
                  />
                );
              })}
            </div>
          </div>
        );
      })}
    </section>
  );
}

import { CloseOutlined, HolderOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Divider, Empty, Select, Typography } from 'antd';
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode
} from 'react';
import { createPortal } from 'react-dom';

import type { SchemaFieldRendererProps } from '../../../../../shared/schema-ui/registry/create-renderer-registry';
import type {
  SchemaDynamicFormBlock
} from '../../../../../shared/schema-ui/contracts/canvas-node-schema';
import {
  fetchModelProviderOptions,
  modelProviderOptionsQueryKey
} from '../../../api/model-provider-options';
import {
  buildLlmParameterState,
  getLlmModelProvider,
  getLlmParameters,
  resolveLlmParameterStateOnModelChange
} from '../../../lib/llm-node-config';
import {
  findLlmModelOption,
  findLlmProviderOption,
  formatLlmTokenCount,
  listLlmProviderOptions,
  type LlmModelGroup,
  type LlmModelOption,
  type LlmProviderOption
} from '../../../lib/model-options';
import { LlmParameterForm } from './LlmParameterForm';

const EMPTY_MODEL_PROVIDER = {
  provider_code: '',
  source_instance_id: '',
  model_id: '',
  protocol: undefined,
  provider_label: undefined,
  model_label: undefined,
  schema_fetched_at: undefined
} as const;

const LLM_PARAMETERS_BLOCK: SchemaDynamicFormBlock = {
  kind: 'dynamic_form',
  form_key: 'llm_parameters',
  title: 'LLM 参数',
  empty_text: '请先选择模型，随后再调整参数。'
};

const FLOATING_PANEL_DEFAULT_WIDTH = 320;
const FLOATING_PANEL_MIN_WIDTH = 320;
const FLOATING_PANEL_GAP = 24;
const FLOATING_PANEL_MARGIN = 16;
const FLOATING_PANEL_DEFAULT_HEIGHT = 360;

interface FloatingPanelBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface FloatingPanelPosition {
  left: number;
  top: number;
}

type FloatingPanelResizeEdge = 'left' | 'right';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getNodeConfig(adapter: SchemaFieldRendererProps['adapter']) {
  const node = adapter.getDerived('node') as { config?: Record<string, unknown> } | null | undefined;
  return isRecord(node?.config) ? node.config : {};
}

function getModelSearchText(provider: LlmProviderOption, group: LlmModelGroup, model: LlmModelOption) {
  return [
    provider.label,
    provider.providerCode,
    group.label,
    group.sourceInstanceId,
    model.label,
    model.value,
    model.tag
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function buildModelSelection(nextModel: LlmModelOption) {
  return {
    provider_code: nextModel.providerCode,
    source_instance_id: nextModel.sourceInstanceId,
    model_id: nextModel.value,
    protocol: nextModel.protocol,
    provider_label: nextModel.providerLabel,
    model_label: nextModel.label,
    schema_fetched_at: new Date().toISOString()
  };
}

function buildOutputLabel(value: number | null | undefined) {
  const formattedValue = formatLlmTokenCount(value);
  return formattedValue ? `输出 ${formattedValue}` : null;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function resolveFloatingPanelBounds(container: HTMLElement | null): FloatingPanelBounds {
  if (container) {
    const rect = container.getBoundingClientRect();

    return {
      left: rect.left,
      top: rect.top,
      width: rect.width || container.clientWidth,
      height: rect.height || container.clientHeight
    };
  }

  return {
    left: 0,
    top: 0,
    width: window.innerWidth,
    height: window.innerHeight
  };
}

function resolveFloatingPanelHeight(bounds: FloatingPanelBounds) {
  if (bounds.height <= 0) {
    return FLOATING_PANEL_DEFAULT_HEIGHT;
  }

  return Math.round(bounds.height / 2);
}

function clampFloatingPanelPosition(
  position: FloatingPanelPosition,
  bounds: FloatingPanelBounds,
  panelHeight: number,
  panelWidth: number
) {
  const maxLeft = Math.max(
    FLOATING_PANEL_MARGIN,
    bounds.width - panelWidth - FLOATING_PANEL_MARGIN
  );
  const maxTop = Math.max(
    FLOATING_PANEL_MARGIN,
    bounds.height - panelHeight - FLOATING_PANEL_MARGIN
  );

  return {
    left: clamp(position.left, FLOATING_PANEL_MARGIN, maxLeft),
    top: clamp(position.top, FLOATING_PANEL_MARGIN, maxTop)
  };
}

function clampFloatingPanelWidth(
  width: number,
  bounds: FloatingPanelBounds,
  position: FloatingPanelPosition
) {
  const maxWidth = Math.max(
    FLOATING_PANEL_MIN_WIDTH,
    bounds.width - position.left - FLOATING_PANEL_MARGIN
  );

  return clamp(width, FLOATING_PANEL_MIN_WIDTH, maxWidth);
}

function resolveInitialFloatingPanelPosition(
  trigger: HTMLElement | null,
  bounds: FloatingPanelBounds,
  panelHeight: number,
  panelWidth: number
) {
  if (!trigger) {
    return clampFloatingPanelPosition(
      {
        left: bounds.width - panelWidth - FLOATING_PANEL_MARGIN,
        top: FLOATING_PANEL_MARGIN
      },
      bounds,
      panelHeight,
      panelWidth
    );
  }

  const triggerRect = trigger.getBoundingClientRect();
  const preferredLeft =
    triggerRect.left - bounds.left - panelWidth - FLOATING_PANEL_GAP;
  const fallbackLeft = triggerRect.right - bounds.left + FLOATING_PANEL_GAP;

  return clampFloatingPanelPosition(
    {
      left:
        preferredLeft >= FLOATING_PANEL_MARGIN ? preferredLeft : fallbackLeft,
      top: triggerRect.top - bounds.top
    },
    bounds,
    panelHeight,
    panelWidth
  );
}

function ContextMarker({
  value
}: {
  value: number | null | undefined;
}) {
  const formattedValue = formatLlmTokenCount(value);

  if (!formattedValue) {
    return null;
  }

  return (
    <span
      className="agent-flow-model-meta-pill agent-flow-model-meta-pill--context"
      aria-label={`上下文 ${formattedValue}`}
      title={`上下文 ${formattedValue}`}
    >
      {formattedValue}
    </span>
  );
}

function ModelChip({
  providerLabel,
  modelLabel,
  metaItems = [],
  placeholder = '选择供应商和模型'
}: {
  providerLabel?: string | null;
  modelLabel?: string | null;
  metaItems?: ReactNode[];
  placeholder?: string;
}) {
  const visibleMetaItems = metaItems.filter(Boolean);

  return (
    <div
      className={`agent-flow-model-chip${modelLabel ? '' : ' agent-flow-model-chip--empty'}`}
    >
      <span className="agent-flow-model-chip__provider" aria-hidden="true">
        ◎
      </span>
      <span className="agent-flow-model-chip__content">
        <span className="agent-flow-model-chip__eyebrow">
          {providerLabel || '模型供应商'}
        </span>
        <span className="agent-flow-model-chip__label">{modelLabel || placeholder}</span>
        {visibleMetaItems.length > 0 ? (
          <span className="agent-flow-model-chip__meta">
            {visibleMetaItems.map((item, index) => (
              <span key={index} className="agent-flow-model-chip__meta-item">
                {item}
              </span>
            ))}
          </span>
        ) : null}
      </span>
    </div>
  );
}

export function LlmModelField({ adapter, block }: SchemaFieldRendererProps) {
  const [open, setOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [expandedProviders, setExpandedProviders] = useState<string[]>([]);
  const [panelContainer, setPanelContainer] = useState<HTMLElement | null>(
    null
  );
  const [panelHeight, setPanelHeight] = useState(
    FLOATING_PANEL_DEFAULT_HEIGHT
  );
  const [panelWidth, setPanelWidth] = useState(
    FLOATING_PANEL_DEFAULT_WIDTH
  );
  const [panelPosition, setPanelPosition] = useState<FloatingPanelPosition>({
    left: FLOATING_PANEL_MARGIN,
    top: FLOATING_PANEL_MARGIN
  });
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const dragCleanupRef = useRef<(() => void) | null>(null);
  const titleId = useId();
  const providerOptionsQuery = useQuery({
    queryKey: modelProviderOptionsQueryKey,
    queryFn: fetchModelProviderOptions,
    staleTime: 60_000
  });
  const config = getNodeConfig(adapter);
  const modelProvider = getLlmModelProvider(config);
  const currentParameters = getLlmParameters(config);
  const providerCode = modelProvider.provider_code.trim();
  const sourceInstanceId = modelProvider.source_instance_id.trim();
  const modelValue = modelProvider.model_id.trim();
  const providerOptions = useMemo(
    () => listLlmProviderOptions(providerOptionsQuery.data),
    [providerOptionsQuery.data]
  );
  const selectedProvider = findLlmProviderOption(providerOptionsQuery.data, providerCode);
  const selectedModel = findLlmModelOption(
    providerOptionsQuery.data,
    providerCode,
    sourceInstanceId,
    modelValue
  );
  const selectedSourceInstanceLabel =
    selectedModel?.sourceInstanceLabel ??
    selectedProvider?.modelGroups.find((group) => group.sourceInstanceId === sourceInstanceId)
      ?.label ??
    (sourceInstanceId || null);
  const providerUnavailable = Boolean(
    providerCode && providerOptionsQuery.isSuccess && selectedProvider === null
  );
  const modelUnavailable = Boolean(
    providerCode && modelValue && providerOptionsQuery.isSuccess && selectedModel === null
  );
  const filteredProviders = useMemo(() => {
    const normalizedSearch = searchText.trim().toLowerCase();

    if (!normalizedSearch) {
      return providerOptions;
    }

    return providerOptions
      .map((provider) => ({
        ...provider,
        modelGroups: provider.modelGroups
          .map((group) => ({
            ...group,
            models: group.models.filter((model) =>
              getModelSearchText(provider, group, model).includes(normalizedSearch)
            )
          }))
          .filter((group) => group.models.length > 0)
      }))
      .filter((provider) => provider.modelGroups.length > 0);
  }, [providerOptions, searchText]);
  const selectOptions = useMemo(
    () =>
      providerOptions.flatMap((provider) =>
        provider.modelGroups.flatMap((group) =>
          group.models.map((model) => ({
            value: model.selectionValue,
            label: model.label
          }))
        )
      ),
    [providerOptions]
  );

  useEffect(() => {
    if (open) {
      return;
    }

    dragCleanupRef.current?.();
    setDropdownOpen(false);
    setSearchText('');
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleResize = () => {
      const nextContainer =
        triggerRef.current?.closest<HTMLElement>('.agent-flow-editor__body') ??
        null;
      const bounds = resolveFloatingPanelBounds(nextContainer);
      const nextHeight = resolveFloatingPanelHeight(bounds);

      setPanelContainer(nextContainer);
      setPanelHeight(nextHeight);
      setPanelPosition((current) => {
        const nextWidth = clampFloatingPanelWidth(
          panelWidth,
          bounds,
          current
        );

        setPanelWidth(nextWidth);
        return clampFloatingPanelPosition(
          current,
          bounds,
          nextHeight,
          nextWidth
        );
      });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [open, panelWidth]);

  useEffect(() => {
    return () => {
      dragCleanupRef.current?.();
    };
  }, []);

  function clearSelection() {
    adapter.setValue('config.model_provider', EMPTY_MODEL_PROVIDER);
    adapter.setValue('config.llm_parameters', buildLlmParameterState(null));
  }

  function selectModel(nextModel: LlmModelOption) {
    const nextProvider =
      providerOptions.find((provider) => provider.providerCode === nextModel.providerCode) ?? null;

    adapter.setValue('config.model_provider', buildModelSelection(nextModel));
    adapter.setValue(
      'config.llm_parameters',
      resolveLlmParameterStateOnModelChange({
        currentProviderCode: providerCode,
        nextProviderCode: nextModel.providerCode,
        currentParameters,
        nextSchema: nextProvider?.parameterForm
      })
    );
    setDropdownOpen(false);
    setSearchText('');
    setExpandedProviders([nextModel.providerCode]);
  }

  function toggleProvider(providerValue: string) {
    setExpandedProviders((current) =>
      current.includes(providerValue)
        ? current.filter((value) => value !== providerValue)
        : [...current, providerValue]
    );
  }

  function keepDropdownFocus(event: ReactMouseEvent<HTMLButtonElement>) {
    event.preventDefault();
  }

  function handleDropdownOpenChange(nextOpen: boolean) {
    setDropdownOpen(nextOpen);

    if (nextOpen) {
      setExpandedProviders((current) => {
        const allProviderValues = providerOptions.map((provider) => provider.value);

        if (searchText.trim().length > 0) {
          return filteredProviders.map((provider) => provider.value);
        }

        if (current.length > 0) {
          return current;
        }

        return allProviderValues;
      });
      return;
    }

    setSearchText('');
  }

  function openFloatingPanel() {
    const nextContainer =
      triggerRef.current?.closest<HTMLElement>('.agent-flow-editor__body') ??
      null;
    const bounds = resolveFloatingPanelBounds(nextContainer);
    const nextHeight = resolveFloatingPanelHeight(bounds);
    const nextWidth = clampFloatingPanelWidth(
      FLOATING_PANEL_DEFAULT_WIDTH,
      bounds,
      {
        left: FLOATING_PANEL_MARGIN,
        top: FLOATING_PANEL_MARGIN
      }
    );

    setPanelContainer(nextContainer);
    setPanelHeight(nextHeight);
    setPanelWidth(nextWidth);
    setPanelPosition(
      resolveInitialFloatingPanelPosition(
        triggerRef.current,
        bounds,
        nextHeight,
        nextWidth
      )
    );
    setOpen(true);
  }

  function handleDragStart(event: ReactMouseEvent<HTMLDivElement>) {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();

    const bounds = resolveFloatingPanelBounds(panelContainer);
    const offsetX = event.clientX - bounds.left - panelPosition.left;
    const offsetY = event.clientY - bounds.top - panelPosition.top;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;

    dragCleanupRef.current?.();
    document.body.style.cursor = 'move';
    document.body.style.userSelect = 'none';

    const handleMouseMove = (moveEvent: MouseEvent) => {
      setPanelPosition(
        clampFloatingPanelPosition(
          {
            left: moveEvent.clientX - bounds.left - offsetX,
            top: moveEvent.clientY - bounds.top - offsetY
          },
          bounds,
          panelHeight,
          panelWidth
        )
      );
    };

    const cleanup = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', cleanup);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      dragCleanupRef.current = null;
    };

    dragCleanupRef.current = cleanup;
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', cleanup);
  }

  function handleResizeStart(
    event: ReactMouseEvent<HTMLDivElement>,
    edge: FloatingPanelResizeEdge
  ) {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();

    const bounds = resolveFloatingPanelBounds(panelContainer);
    const startX = event.clientX;
    const startWidth = panelWidth;
    const startLeft = panelPosition.left;
    const startRight = startLeft + startWidth;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;

    dragCleanupRef.current?.();
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (edge === 'right') {
        setPanelWidth(
          clampFloatingPanelWidth(
            startWidth + moveEvent.clientX - startX,
            bounds,
            panelPosition
          )
        );
        return;
      }

      const maxWidth = Math.max(
        FLOATING_PANEL_MIN_WIDTH,
        startRight - FLOATING_PANEL_MARGIN
      );
      const nextWidth = clamp(
        startRight - (moveEvent.clientX - bounds.left),
        FLOATING_PANEL_MIN_WIDTH,
        maxWidth
      );

      setPanelWidth(nextWidth);
      setPanelPosition((current) => ({
        ...current,
        left: startRight - nextWidth
      }));
    };

    const cleanup = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', cleanup);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      dragCleanupRef.current = null;
    };

    dragCleanupRef.current = cleanup;
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', cleanup);
  }

  const floatingPanel = open ? (
    <div
      aria-labelledby={titleId}
      aria-modal="false"
      className="agent-flow-model-settings__panel"
      role="dialog"
      style={{
        position: panelContainer ? 'absolute' : 'fixed',
        width: `${panelWidth}px`,
        height: `${panelHeight}px`,
        left: `${panelPosition.left}px`,
        top: `${panelPosition.top}px`
      }}
    >
      <div className="agent-flow-model-settings__panel-header">
        <div
          className="agent-flow-model-settings__drag-handle"
          data-testid="agent-flow-model-settings-drag-handle"
          onMouseDown={handleDragStart}
        >
          <HolderOutlined
            aria-hidden="true"
            className="agent-flow-model-settings__drag-icon"
          />
          <Typography.Title
            id={titleId}
            level={4}
            className="agent-flow-model-settings__panel-title"
          >
            模型设置
          </Typography.Title>
        </div>
        <button
          aria-label="关闭模型设置"
          className="agent-flow-model-settings__close"
          onClick={() => setOpen(false)}
          type="button"
        >
          <CloseOutlined />
        </button>
      </div>

      <div
        aria-label="从左侧调整模型设置宽度"
        aria-orientation="vertical"
        className="agent-flow-model-settings__resize-handle agent-flow-model-settings__resize-handle--left"
        data-testid="agent-flow-model-settings-resize-handle-left"
        onMouseDown={(event) => handleResizeStart(event, 'left')}
        role="separator"
      />

      <div
        aria-label="从右侧调整模型设置宽度"
        aria-orientation="vertical"
        className="agent-flow-model-settings__resize-handle agent-flow-model-settings__resize-handle--right"
        data-testid="agent-flow-model-settings-resize-handle"
        onMouseDown={(event) => handleResizeStart(event, 'right')}
        role="separator"
      />

      <div className="agent-flow-model-settings__panel-body">
        {providerOptionsQuery.isError ? (
          <Alert
            className="agent-flow-model-settings__notice"
            type="error"
            showIcon
            message="模型供应商列表加载失败。"
          />
        ) : null}
        {providerUnavailable ? (
          <Alert
            className="agent-flow-model-settings__notice"
            type="error"
            showIcon
            message="当前节点引用的模型供应商不可用。"
          />
        ) : null}
        {modelUnavailable ? (
          <Alert
            className="agent-flow-model-settings__notice"
            type="error"
            showIcon
            message="当前节点引用的模型不在该供应商的生效模型列表中。"
          />
        ) : null}

        <div className="agent-flow-model-settings__section">
          <div className="agent-flow-model-settings__header">
            <Typography.Title
              level={5}
              className="agent-flow-model-settings__section-title"
            >
              模型
            </Typography.Title>
            {providerCode || modelValue ? (
              <Button type="link" onClick={clearSelection}>
                清空
              </Button>
            ) : null}
          </div>
          <Typography.Text className="agent-flow-model-settings__section-subtitle">
            主实例是供应商级聚合视图；节点实际仍保存来源实例与模型。
          </Typography.Text>
          <Select
            aria-label="选择供应商和模型"
            className="agent-flow-model-settings__select"
            placeholder="选择供应商和模型"
            value={selectedModel?.selectionValue}
            open={dropdownOpen}
            options={selectOptions}
            showSearch
            allowClear={false}
            filterOption={false}
            popupMatchSelectWidth
            onOpenChange={handleDropdownOpenChange}
            onSearch={setSearchText}
            popupRender={() => (
              <div className="agent-flow-model-settings__dropdown">
                {filteredProviders.length === 0 ? (
                  <div className="agent-flow-model-settings__empty">
                    <Empty
                      image={Empty.PRESENTED_IMAGE_SIMPLE}
                      description={
                        searchText.trim().length > 0
                          ? '没有匹配的模型结果'
                          : '当前还没有可选模型'
                      }
                    />
                  </div>
                ) : (
                  <div className="agent-flow-model-settings__provider-sections">
                    {filteredProviders.map((provider) => {
                      const providerExpanded =
                        searchText.trim().length > 0 ||
                        expandedProviders.includes(provider.value);

                      return (
                        <section
                          key={provider.value}
                          className="agent-flow-model-settings__provider-section"
                        >
                          <button
                            type="button"
                            className="agent-flow-model-settings__provider-head"
                            aria-expanded={providerExpanded}
                            onMouseDown={keepDropdownFocus}
                            onClick={() => toggleProvider(provider.value)}
                          >
                            <div>
                              <Typography.Text strong>{provider.label}</Typography.Text>
                              <div className="agent-flow-model-settings__provider-meta">
                                主实例聚合 · {provider.modelGroups.length} 个来源实例 ·{' '}
                                {provider.models.length} 个模型
                              </div>
                            </div>
                            <span
                              className="agent-flow-model-settings__provider-caret"
                              aria-hidden="true"
                            >
                              {providerExpanded ? '▾' : '▸'}
                            </span>
                          </button>
                          {providerExpanded
                            ? provider.modelGroups.map((group) => (
                                <div
                                  key={group.key}
                                  className="agent-flow-model-settings__provider-group"
                                >
                                  <div className="agent-flow-model-settings__group-head">
                                    <span>{group.label}</span>
                                    <span>{group.models.length} 个模型</span>
                                  </div>
                                  <div className="agent-flow-model-settings__options">
                                    {group.models.map((option) => {
                                      const active =
                                        option.sourceInstanceId === sourceInstanceId &&
                                        option.value === modelValue;

                                      return (
                                        <button
                                          key={option.selectionValue}
                                          type="button"
                                          aria-label={`${provider.label} ${group.label} ${option.label}`}
                                          className={[
                                            'agent-flow-model-settings__option',
                                            active
                                              ? 'agent-flow-model-settings__option--active'
                                              : null
                                          ]
                                            .filter(Boolean)
                                            .join(' ')}
                                          onMouseDown={keepDropdownFocus}
                                          onClick={() => selectModel(option)}
                                        >
                                          <span className="agent-flow-model-settings__option-main">
                                            {option.label}
                                          </span>
                                          <span className="agent-flow-model-settings__option-meta">
                                            <span>{option.value}</span>
                                            <ContextMarker
                                              value={option.effectiveContextWindow}
                                            />
                                            {buildOutputLabel(option.maxOutputTokens) ? (
                                              <span>
                                                {buildOutputLabel(option.maxOutputTokens)}
                                              </span>
                                            ) : null}
                                            {option.tag ? <span>{option.tag}</span> : null}
                                          </span>
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              ))
                            : null}
                        </section>
                      );
                    })}
                  </div>
                )}
                <button
                  type="button"
                  className="agent-flow-model-settings__provider-link"
                  onMouseDown={keepDropdownFocus}
                  onClick={() => window.location.assign('/settings/model-providers')}
                >
                  模型供应商设置
                </button>
              </div>
            )}
          />
        </div>

        <Divider />

        <div className="agent-flow-model-settings__section">
          <Typography.Title
            level={5}
            className="agent-flow-model-settings__section-title"
          >
            参数
          </Typography.Title>
          <LlmParameterForm adapter={adapter} block={LLM_PARAMETERS_BLOCK} />
        </div>
      </div>
    </div>
  ) : null;

  return (
    <>
      <button
        type="button"
        aria-label={block.label}
        className="agent-flow-model-field__trigger"
        onClick={openFloatingPanel}
        ref={triggerRef}
      >
        <ModelChip
          providerLabel={
            modelProvider.provider_label?.trim() ||
            selectedModel?.providerLabel ||
            selectedProvider?.label ||
            providerCode ||
            null
          }
          modelLabel={modelProvider.model_label?.trim() || selectedModel?.label || modelValue || null}
          metaItems={[
            selectedSourceInstanceLabel ? <span>{selectedSourceInstanceLabel}</span> : null,
            <ContextMarker value={selectedModel?.effectiveContextWindow} />
          ]}
        />
        <span className="agent-flow-model-field__trigger-caret" aria-hidden="true">
          ▾
        </span>
      </button>
      {floatingPanel
        ? createPortal(floatingPanel, panelContainer ?? document.body)
        : null}
    </>
  );
}

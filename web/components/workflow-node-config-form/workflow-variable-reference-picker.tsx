"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

import type {
  WorkflowVariableReferenceGroup,
  WorkflowVariableReferenceItem,
} from "@/components/workflow-node-config-form/workflow-variable-text-document";

type FlatWorkflowVariableReferenceItem = WorkflowVariableReferenceItem & {
  groupLabel: string;
};

function flattenReferenceItems(
  items: WorkflowVariableReferenceItem[],
  groupLabel: string,
): FlatWorkflowVariableReferenceItem[] {
  return items.flatMap((item) => {
    if (item.children && item.children.length > 0) {
      return flattenReferenceItems(item.children, groupLabel);
    }

    return [{ ...item, groupLabel }];
  });
}

export function WorkflowVariableReferencePicker({
  groups,
  onInsert,
  onDismiss,
  query,
  showSearch = true,
  onQueryChange,
  onConfirmFirst,
}: {
  groups: WorkflowVariableReferenceGroup[];
  onInsert: (selector: string[]) => void;
  onDismiss?: () => void;
  query?: string;
  showSearch?: boolean;
  onQueryChange?: (query: string) => void;
  onConfirmFirst?: () => void;
}) {
  const [internalQuery, setInternalQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const resolvedQuery = query ?? internalQuery;

  useEffect(() => {
    if (showSearch) {
      searchInputRef.current?.focus();
    }
  }, [showSearch]);

  const visibleGroups = useMemo(() => {
    const normalizedQuery = resolvedQuery.trim().toLowerCase();

    return groups
      .map((group) => ({
        key: group.key,
        label: group.label,
        items: flattenReferenceItems(group.items, group.label).filter((item) => {
          if (!normalizedQuery) {
            return true;
          }

          return `${item.label} ${item.previewPath}`.toLowerCase().includes(normalizedQuery);
        }),
      }))
      .filter((group) => group.items.length > 0);
  }, [groups, resolvedQuery]);

  const updateQuery = (nextQuery: string) => {
    if (query === undefined) {
      setInternalQuery(nextQuery);
    }
    onQueryChange?.(nextQuery);
  };

  return (
    <div
      className={`workflow-variable-reference-popover${showSearch ? "" : " compact"}`}
      data-component="workflow-variable-reference-popover"
    >
      {showSearch ? (
        <label className="workflow-variable-reference-popover-search">
          <span>搜索变量</span>
          <input
            ref={searchInputRef}
            data-element="workflow-variable-picker-search"
            className="trace-text-input workflow-variable-reference-popover-search-input"
            value={resolvedQuery}
            onInput={(event) => updateQuery((event.target as HTMLInputElement).value)}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === "Enter") {
                event.preventDefault();
                onConfirmFirst?.();
                return;
              }
              if (event.key === "Escape") {
                event.preventDefault();
                onDismiss?.();
              }
            }}
            placeholder="搜索变量"
          />
        </label>
      ) : (
        <small className="workflow-variable-reference-popover-hint">
          继续输入筛选，回车插入第一项
        </small>
      )}
      <div className="workflow-variable-reference-popover-body">
        {visibleGroups.length > 0 ? (
          visibleGroups.map((group) => (
            <section key={group.key} className="workflow-variable-reference-popover-group">
              <strong>{group.label}</strong>
              <div className="workflow-variable-reference-popover-items">
                {group.items.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    className="workflow-variable-reference-popover-item"
                    onClick={() => onInsert(item.selector)}
                  >
                    <span className="workflow-variable-reference-popover-item-main">
                      <span>{item.label}</span>
                      <small>{item.previewPath}</small>
                    </span>
                    <span className="workflow-variable-reference-popover-item-type">
                      {item.valueTypeLabel ?? "Value"}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ))
        ) : (
          <small className="section-copy">没有匹配到可插入的变量。</small>
        )}
      </div>
    </div>
  );
}

"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactNode,
  type SyntheticEvent
} from "react";

export type WorkflowCanvasQuickAddOption = {
  type: string;
  label: string;
  description: string;
  capabilityGroup?: string;
};

type WorkflowCanvasQuickAddTriggerProps = {
  quickAddOptions?: WorkflowCanvasQuickAddOption[];
  triggerAriaLabel: string;
  triggerContent?: ReactNode;
  menuTitle: string;
  menuDescription: string;
  onQuickAdd: (type: string) => void;
  onOpenChange?: (open: boolean) => void;
  containerClassName: string;
  triggerClassName: string;
  menuClassName?: string;
};

type WorkflowCanvasQuickAddTabKey = "nodes" | "tools";

type WorkflowCanvasQuickAddSection = {
  key: string;
  label: string;
  items: WorkflowCanvasQuickAddOption[];
};

const NODE_SECTION_ORDER = [
  { key: "agent", label: "AI 节点" },
  { key: "logic", label: "逻辑" },
  { key: "output", label: "结果输出" },
  { key: "transform", label: "转换" },
  { key: "other", label: "其它节点" }
] as const;
const CANVAS_INTERACTION_GUARD_CLASS_NAME = "nodrag nopan nowheel";
export const workflowCanvasQuickAddMenuInteractionGuardProps = {
  onPointerDown: stopCanvasInteraction,
  onClick: stopCanvasInteraction,
  onDoubleClick: stopCanvasInteraction,
  onWheel: stopCanvasInteraction
} satisfies Pick<
  HTMLAttributes<HTMLDivElement>,
  "onPointerDown" | "onClick" | "onDoubleClick" | "onWheel"
>;

export function WorkflowCanvasQuickAddTrigger({
  quickAddOptions = [],
  triggerAriaLabel,
  triggerContent,
  menuTitle,
  menuDescription,
  onQuickAdd,
  onOpenChange,
  containerClassName,
  triggerClassName,
  menuClassName
}: WorkflowCanvasQuickAddTriggerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<WorkflowCanvasQuickAddTabKey>("nodes");
  const [searchValue, setSearchValue] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const closeMenu = useCallback(() => {
    setIsOpen(false);
    setSearchValue("");
    onOpenChange?.(false);
  }, [onOpenChange]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    searchInputRef.current?.focus();

    const handlePointerDown = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) {
        return;
      }

      closeMenu();
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeMenu();
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [closeMenu, isOpen]);

  const filteredOptions = useMemo(() => {
    const normalizedSearch = searchValue.trim().toLowerCase();
    if (!normalizedSearch) {
      return quickAddOptions;
    }

    return quickAddOptions.filter((item) =>
      [
        item.label,
        item.description,
        item.type,
        item.capabilityGroup
      ]
        .filter(Boolean)
        .some((value) => value?.toLowerCase().includes(normalizedSearch))
    );
  }, [quickAddOptions, searchValue]);

  const quickAddTabs = useMemo(
    () => ({
      nodes: filteredOptions.filter((item) => item.capabilityGroup !== "integration"),
      tools: filteredOptions.filter((item) => item.capabilityGroup === "integration")
    }),
    [filteredOptions]
  );

  useEffect(() => {
    if (activeTab === "tools" && quickAddTabs.tools.length === 0 && quickAddTabs.nodes.length > 0) {
      setActiveTab("nodes");
    }
  }, [activeTab, quickAddTabs.nodes.length, quickAddTabs.tools.length]);

  const activeSections = useMemo<WorkflowCanvasQuickAddSection[]>(() => {
    if (activeTab === "tools") {
      return quickAddTabs.tools.length > 0
        ? [
            {
              key: "integration",
              label: "工具 / 引用",
              items: quickAddTabs.tools
            }
          ]
        : [];
    }

    return NODE_SECTION_ORDER.map((section) => ({
      key: section.key,
      label: section.label,
      items: quickAddTabs.nodes.filter((item) => {
        if (section.key === "other") {
          return !item.capabilityGroup || !NODE_SECTION_ORDER.some(
            (candidate) => candidate.key !== "other" && candidate.key === item.capabilityGroup
          );
        }

        return item.capabilityGroup === section.key;
      })
    })).filter((section) => section.items.length > 0);
  }, [activeTab, quickAddTabs.nodes, quickAddTabs.tools]);

  return (
    <div
      className={joinClassNames(containerClassName, CANVAS_INTERACTION_GUARD_CLASS_NAME)}
      ref={rootRef}
    >
      <button
        className={joinClassNames(
          triggerClassName,
          CANVAS_INTERACTION_GUARD_CLASS_NAME,
          isOpen ? "open" : null
        )}
        type="button"
        aria-label={triggerAriaLabel}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        onPointerDown={stopCanvasInteraction}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setIsOpen((current) => {
            const nextOpen = !current;
            if (!nextOpen) {
              setSearchValue("");
            }
            onOpenChange?.(nextOpen);
            return nextOpen;
          });
        }}
      >
        <span className="workflow-canvas-quick-add-trigger-content" aria-hidden="true">
          {triggerContent ?? "+"}
        </span>
      </button>

      {isOpen ? (
        <div
          className={joinClassNames(
            "workflow-canvas-quick-add-menu",
            CANVAS_INTERACTION_GUARD_CLASS_NAME,
            menuClassName
          )}
          role="menu"
          {...workflowCanvasQuickAddMenuInteractionGuardProps}
        >
          <div className="workflow-canvas-quick-add-menu-header">
            <strong>{menuTitle}</strong>
            <span>{menuDescription}</span>
          </div>

          <div className="workflow-canvas-quick-add-tabs" role="tablist" aria-label="添加节点分类">
            <button
              className={[
                "workflow-canvas-quick-add-tab",
                activeTab === "nodes" ? "active" : null
              ]
                .filter(Boolean)
                .join(" ")}
              onPointerDown={stopCanvasInteraction}
              type="button"
              role="tab"
              aria-selected={activeTab === "nodes"}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setActiveTab("nodes");
              }}
            >
              节点
            </button>
            <button
              className={[
                "workflow-canvas-quick-add-tab",
                activeTab === "tools" ? "active" : null
              ]
                .filter(Boolean)
                .join(" ")}
              onPointerDown={stopCanvasInteraction}
              type="button"
              role="tab"
              aria-selected={activeTab === "tools"}
              disabled={quickAddOptions.every((item) => item.capabilityGroup !== "integration")}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setActiveTab("tools");
              }}
            >
              工具
            </button>
          </div>

          <div className="workflow-canvas-quick-add-search-shell">
            <input
              ref={searchInputRef}
              className={joinClassNames(
                "workflow-canvas-quick-add-search-input",
                CANVAS_INTERACTION_GUARD_CLASS_NAME
              )}
              type="search"
              placeholder={activeTab === "tools" ? "搜索工具" : "搜索节点"}
              value={searchValue}
              onPointerDown={stopCanvasInteraction}
              onWheel={stopCanvasInteraction}
              onChange={(event) => setSearchValue(event.target.value)}
            />
          </div>

          <div className="workflow-canvas-quick-add-menu-list">
            {activeSections.length > 0 ? (
              activeSections.map((section) => (
                <section className="workflow-canvas-quick-add-section" key={section.key}>
                  <div className="workflow-canvas-quick-add-section-label">{section.label}</div>
                  <div className="workflow-canvas-quick-add-section-list">
                    {section.items.map((item) => (
                      <button
                        className={joinClassNames(
                          "workflow-canvas-quick-add-option",
                          CANVAS_INTERACTION_GUARD_CLASS_NAME
                        )}
                        key={item.type}
                        type="button"
                        role="menuitem"
                        aria-label={`插入 ${item.label}`}
                        onPointerDown={stopCanvasInteraction}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          onQuickAdd(item.type);
                          closeMenu();
                        }}
                      >
                        <span className="workflow-canvas-quick-add-option-label">
                          {item.label}
                        </span>
                        <span className="workflow-canvas-quick-add-option-meta">
                          {formatNodeMeta(item.capabilityGroup, item.type)}
                        </span>
                        <span className="workflow-canvas-quick-add-option-copy">
                          {item.description}
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
              ))
            ) : (
              <div className="workflow-canvas-quick-add-empty">
                没有匹配的可插入节点。
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function formatNodeMeta(capabilityGroup: string | undefined, nodeType: string) {
  const groupLabel = capabilityGroup
    ? capabilityGroup.replace(/_/g, " ")
    : "workflow";

  return `${groupLabel} · ${nodeType}`;
}

function joinClassNames(...values: Array<string | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function stopCanvasInteraction(event: SyntheticEvent) {
  event.stopPropagation();
}

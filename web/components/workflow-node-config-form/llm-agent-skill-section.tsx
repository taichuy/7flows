"use client";

import { useEffect, useMemo, useState } from "react";

import { dedupeStrings } from "@/components/workflow-node-config-form/shared";
import {
  getSkillCatalog,
  getSkillDetail,
  type SkillCatalogDetail,
  type SkillCatalogListItem
} from "@/lib/get-skills";

type LlmAgentSkillSectionProps = {
  skillIds: string[];
  onChange: (nextSkillIds: string[]) => void;
  workspaceId?: string;
};

export function LlmAgentSkillSection({
  skillIds,
  onChange,
  workspaceId = "default"
}: LlmAgentSkillSectionProps) {
  const [catalog, setCatalog] = useState<SkillCatalogListItem[]>([]);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSkillId, setActiveSkillId] = useState<string | null>(skillIds[0] ?? null);
  const [detailById, setDetailById] = useState<Record<string, SkillCatalogDetail | null>>({});
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setCatalogError(null);
    setIsLoadingCatalog(true);
    setDetailById({});
    setDetailError(null);

    async function loadCatalog() {
      try {
        const nextCatalog = await getSkillCatalog(workspaceId);
        if (cancelled) {
          return;
        }
        setCatalog(nextCatalog);
      } catch (error) {
        if (cancelled) {
          return;
        }
        setCatalog([]);
        setCatalogError(
          error instanceof Error
            ? "无法加载 Skill Catalog，请确认 API 已启动。"
            : "无法加载 Skill Catalog。"
        );
      } finally {
        if (!cancelled) {
          setIsLoadingCatalog(false);
        }
      }
    }

    loadCatalog();

    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  useEffect(() => {
    if (activeSkillId) {
      return;
    }
    if (skillIds[0]) {
      setActiveSkillId(skillIds[0]);
      return;
    }
    if (catalog[0]?.id) {
      setActiveSkillId(catalog[0].id);
    }
  }, [activeSkillId, catalog, skillIds]);

  useEffect(() => {
    if (!activeSkillId || Object.prototype.hasOwnProperty.call(detailById, activeSkillId)) {
      return;
    }

    const skillId = activeSkillId;

    let cancelled = false;
    setDetailError(null);
    setIsLoadingDetail(true);

    async function loadDetail() {
      try {
        const detail = await getSkillDetail(skillId, workspaceId);
        if (cancelled) {
          return;
        }
        setDetailById((current) => ({
          ...current,
          [skillId]: detail
        }));
      } catch {
        if (cancelled) {
          return;
        }
        setDetailById((current) => ({
          ...current,
          [skillId]: null
        }));
        setDetailError("无法加载当前 Skill 详情。");
      } finally {
        if (!cancelled) {
          setIsLoadingDetail(false);
        }
      }
    }

    loadDetail();

    return () => {
      cancelled = true;
    };
  }, [activeSkillId, detailById, workspaceId]);

  const catalogIdSet = useMemo(() => new Set(catalog.map((item) => item.id)), [catalog]);
  const missingSkillIds = useMemo(
    () => skillIds.filter((skillId) => !catalogIdSet.has(skillId)),
    [catalogIdSet, skillIds]
  );
  const filteredCatalog = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    if (!normalizedQuery) {
      return catalog;
    }

    return catalog.filter((item) => {
      const haystack = [item.id, item.name, item.description].join(" ").toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [catalog, searchQuery]);
  const activeSkillDetail = activeSkillId ? detailById[activeSkillId] ?? null : null;

  const updateRawSkillIds = (rawValue: string) => {
    onChange(
      dedupeStrings(
        rawValue
          .split(/[\n,]/)
          .map((item) => item.trim())
          .filter(Boolean)
      )
    );
  };

  const handleToggleSkill = (skillId: string) => {
    const nextSkillIds = skillIds.includes(skillId)
      ? skillIds.filter((candidate) => candidate !== skillId)
      : [...skillIds, skillId];
    onChange(nextSkillIds);
    if (!skillIds.includes(skillId)) {
      setActiveSkillId(skillId);
      return;
    }
    if (activeSkillId === skillId) {
      setActiveSkillId(nextSkillIds[0] ?? catalog[0]?.id ?? null);
    }
  };

  return (
    <div className="binding-field">
      <span className="binding-label">Skill catalog</span>
      <small className="section-copy">
        这里绑定 service-hosted `SkillDoc`，用于 `llm_agent` 的认知注入与 reference 摘要预览；
        不接管本地执行。
      </small>

      <label className="binding-field">
        <span className="binding-label">Search skills</span>
        <input
          className="trace-text-input"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="按 skill id / name / description 过滤"
        />
      </label>

      {isLoadingCatalog ? (
        <small className="section-copy">正在加载 Skill Catalog...</small>
      ) : catalogError ? (
        <small className="section-copy">{catalogError}</small>
      ) : filteredCatalog.length === 0 ? (
        <small className="section-copy">
          {catalog.length === 0
            ? "当前 workspace 还没有可用 SkillDoc。"
            : "没有匹配当前搜索词的 SkillDoc。"}
        </small>
      ) : (
        <div className="binding-field">
          <span className="binding-label">Available skills</span>
          {filteredCatalog.map((skill) => {
            const selected = skillIds.includes(skill.id);
            const isPreviewing = activeSkillId === skill.id;

            return (
              <div key={skill.id} className="binding-field">
                <div className="tool-badge-row">
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => handleToggleSkill(skill.id)}
                  />
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => setActiveSkillId(skill.id)}
                  >
                    {isPreviewing ? `预览中 · ${skill.name}` : `预览 · ${skill.name}`}
                  </button>
                  <span className="event-chip">{skill.id}</span>
                  <span className="event-chip">{skill.referenceCount} refs</span>
                  {selected ? <span className="event-chip">selected</span> : null}
                </div>
                {skill.description ? (
                  <small className="section-copy">{skill.description}</small>
                ) : (
                  <small className="section-copy">当前 skill 暂无 description。</small>
                )}
              </div>
            );
          })}
        </div>
      )}

      <label className="binding-field">
        <span className="binding-label">Selected skill IDs</span>
        <textarea
          className="editor-json-area"
          value={skillIds.join("\n")}
          onChange={(event) => updateRawSkillIds(event.target.value)}
          placeholder="每行一个 skill id；可直接粘贴，也可用上方 catalog picker 勾选"
        />
      </label>

      {missingSkillIds.length > 0 ? (
        <small className="section-copy">
          以下 `skillIds` 当前不在 catalog 中：{missingSkillIds.join(", ")}。保存时会由后端继续 fail-fast 校验。
        </small>
      ) : null}

      {activeSkillId ? (
        <div className="binding-field">
          <span className="binding-label">Skill preview</span>
          <div className="tool-badge-row">
            <span className="event-chip">{activeSkillId}</span>
            {skillIds.includes(activeSkillId) ? <span className="event-chip">bound</span> : null}
          </div>
          {isLoadingDetail ? (
            <small className="section-copy">正在加载 Skill 详情...</small>
          ) : detailError ? (
            <small className="section-copy">{detailError}</small>
          ) : activeSkillDetail ? (
            <>
              {activeSkillDetail.description ? (
                <small className="section-copy">{activeSkillDetail.description}</small>
              ) : null}
              <textarea
                className="editor-json-area"
                rows={6}
                readOnly
                value={activeSkillDetail.body || "当前 skill 暂无正文。"}
              />
              {activeSkillDetail.references.length > 0 ? (
                <ul className="roadmap-list compact-list">
                  {activeSkillDetail.references.map((reference) => (
                    <li key={reference.id}>
                      {reference.name}
                      {reference.description ? `：${reference.description}` : ""}
                    </li>
                  ))}
                </ul>
              ) : (
                <small className="section-copy">当前 skill 暂无 reference 摘要。</small>
              )}
            </>
          ) : (
            <small className="section-copy">
              当前 skill 详情不可用，可能已被删除或不属于当前 workspace。
            </small>
          )}
        </div>
      ) : null}
    </div>
  );
}

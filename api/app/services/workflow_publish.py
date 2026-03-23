from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models.workflow import Workflow, WorkflowPublishedEndpoint, WorkflowVersion
from app.schemas.workflow_publish import (
    PublishedEndpointLifecycleStatus,
    WorkflowPublishedEndpointLegacyAuthCleanupResult,
    WorkflowPublishedEndpointLegacyAuthCleanupSkipItem,
    WorkflowPublishedEndpointLegacyAuthGovernanceBindingItem,
    WorkflowPublishedEndpointLegacyAuthGovernanceBuckets,
    WorkflowPublishedEndpointLegacyAuthGovernanceChecklistItem,
    WorkflowPublishedEndpointLegacyAuthGovernanceSnapshot,
    WorkflowPublishedEndpointLegacyAuthGovernanceSummary,
    WorkflowPublishedEndpointLegacyAuthGovernanceWorkflowItem,
)
from app.schemas.workflow_published_endpoint import (
    WorkflowPublishedEndpointDefinition,
    normalize_published_endpoint_alias,
    normalize_published_endpoint_path,
)
from app.services.compiled_blueprints import CompiledBlueprintService
from app.services.workflow_publish_auth_mode_validation import (
    collect_invalid_published_endpoint_auth_mode_issues,
)


class WorkflowPublishBindingError(ValueError):
    pass


def _has_blocking_legacy_auth_binding(record: WorkflowPublishedEndpoint) -> bool:
    return any(
        issue.blocks_lifecycle_publish
        for issue in collect_invalid_published_endpoint_auth_mode_issues(
            endpoint_id=record.endpoint_id,
            endpoint_name=record.endpoint_name,
            auth_mode=record.auth_mode,
        )
    )


def _build_legacy_auth_governance_binding_item(
    record: WorkflowPublishedEndpoint,
    *,
    workflow_name: str,
) -> WorkflowPublishedEndpointLegacyAuthGovernanceBindingItem:
    return WorkflowPublishedEndpointLegacyAuthGovernanceBindingItem(
        workflow_id=record.workflow_id,
        workflow_name=workflow_name,
        binding_id=record.id,
        endpoint_id=record.endpoint_id,
        endpoint_name=record.endpoint_name,
        workflow_version=record.workflow_version,
        lifecycle_status=record.lifecycle_status,
        auth_mode=record.auth_mode,
    )


def _format_workflow_name_preview(
    items: list[WorkflowPublishedEndpointLegacyAuthGovernanceBindingItem],
) -> str:
    workflow_names = list(dict.fromkeys(item.workflow_name for item in items))
    if len(workflow_names) <= 0:
        return "当前没有命中 workflow"
    if len(workflow_names) <= 2:
        return "、".join(workflow_names)
    return f"{'、'.join(workflow_names[:2])} 等 {len(workflow_names)} 个 workflow"


def _build_legacy_auth_governance_checklist(
    draft_candidates: list[WorkflowPublishedEndpointLegacyAuthGovernanceBindingItem],
    published_blockers: list[WorkflowPublishedEndpointLegacyAuthGovernanceBindingItem],
    offline_inventory: list[WorkflowPublishedEndpointLegacyAuthGovernanceBindingItem],
) -> list[WorkflowPublishedEndpointLegacyAuthGovernanceChecklistItem]:
    items: list[WorkflowPublishedEndpointLegacyAuthGovernanceChecklistItem] = []

    if draft_candidates:
        items.append(
            WorkflowPublishedEndpointLegacyAuthGovernanceChecklistItem(
                key="draft_cleanup",
                title="先批量下线 draft legacy bindings",
                tone="ready",
                tone_label="可立即执行",
                count=len(draft_candidates),
                detail=(
                    f"先对 {_format_workflow_name_preview(draft_candidates)} 里的 "
                    f"{len(draft_candidates)} 条 draft legacy binding 执行批量 cleanup；"
                    "这一步不会动到仍在 live 的 published endpoint。"
                ),
            )
        )

    if published_blockers:
        items.append(
            WorkflowPublishedEndpointLegacyAuthGovernanceChecklistItem(
                key="published_follow_up",
                title="再补发支持鉴权的 replacement bindings",
                tone="manual",
                tone_label="人工跟进",
                count=len(published_blockers),
                detail=(
                    "对 "
                    f"{_format_workflow_name_preview(published_blockers)} "
                    "这类仍在 live 的 legacy binding，"
                    "先回到当前 draft endpoint 把 authMode 切回 api_key/internal，"
                    "并发布新版 binding，"
                    "再决定历史版本是否下线。"
                ),
            )
        )

    if offline_inventory:
        items.append(
            WorkflowPublishedEndpointLegacyAuthGovernanceChecklistItem(
                key="offline_inventory",
                title="保留 offline inventory 做交接与审计",
                tone="inventory",
                tone_label="仅保留审计",
                count=len(offline_inventory),
                detail=(
                    "像 "
                    f"{_format_workflow_name_preview(offline_inventory)} "
                    "这类仅剩 offline inventory 的 workflow，继续保留 artifact "
                    "做交接、审计和 operator checklist 核对，不需要重复执行 cleanup。"
                ),
            )
        )

    return items


def _build_legacy_auth_governance_workflow_summaries(
    *,
    draft_candidates: list[WorkflowPublishedEndpointLegacyAuthGovernanceBindingItem],
    published_blockers: list[WorkflowPublishedEndpointLegacyAuthGovernanceBindingItem],
    offline_inventory: list[WorkflowPublishedEndpointLegacyAuthGovernanceBindingItem],
) -> list[WorkflowPublishedEndpointLegacyAuthGovernanceWorkflowItem]:
    summary_by_workflow: dict[str, WorkflowPublishedEndpointLegacyAuthGovernanceWorkflowItem] = {}

    def ensure_workflow(item: WorkflowPublishedEndpointLegacyAuthGovernanceBindingItem):
        workflow_summary = summary_by_workflow.get(item.workflow_id)
        if workflow_summary is None:
            workflow_summary = WorkflowPublishedEndpointLegacyAuthGovernanceWorkflowItem(
                workflow_id=item.workflow_id,
                workflow_name=item.workflow_name,
                binding_count=0,
                draft_candidate_count=0,
                published_blocker_count=0,
                offline_inventory_count=0,
            )
            summary_by_workflow[item.workflow_id] = workflow_summary
        workflow_summary.binding_count += 1
        return workflow_summary

    for item in draft_candidates:
        ensure_workflow(item).draft_candidate_count += 1

    for item in published_blockers:
        ensure_workflow(item).published_blocker_count += 1

    for item in offline_inventory:
        ensure_workflow(item).offline_inventory_count += 1

    return sorted(
        summary_by_workflow.values(),
        key=lambda item: (
            -item.published_blocker_count,
            -item.draft_candidate_count,
            -item.offline_inventory_count,
            item.workflow_name.lower(),
        ),
    )


class WorkflowPublishBindingService:
    def __init__(
        self,
        compiled_blueprint_service: CompiledBlueprintService | None = None,
    ) -> None:
        self._compiled_blueprint_service = (
            compiled_blueprint_service or CompiledBlueprintService()
        )

    def ensure_for_workflow_version(
        self,
        db: Session,
        workflow_version: WorkflowVersion,
    ) -> list[WorkflowPublishedEndpoint]:
        definition = workflow_version.definition or {}
        publish_definitions = [
            WorkflowPublishedEndpointDefinition.model_validate(item)
            for item in definition.get("publish") or []
        ]
        existing_records = db.scalars(
            select(WorkflowPublishedEndpoint).where(
                WorkflowPublishedEndpoint.workflow_version_id == workflow_version.id
            )
        ).all()
        existing_by_endpoint_id = {
            record.endpoint_id: record for record in existing_records
        }

        synced_records: list[WorkflowPublishedEndpoint] = []
        seen_endpoint_ids: set[str] = set()
        for endpoint in publish_definitions:
            target_version_value = endpoint.workflowVersion or workflow_version.version
            target_version = db.scalar(
                select(WorkflowVersion).where(
                    WorkflowVersion.workflow_id == workflow_version.workflow_id,
                    WorkflowVersion.version == target_version_value,
                )
            )
            if target_version is None:
                raise WorkflowPublishBindingError(
                    "Published endpoint "
                    f"'{endpoint.id}' references unknown workflow version "
                    f"'{target_version_value}'."
                )

            compiled_blueprint = self._compiled_blueprint_service.ensure_for_workflow_version(
                db,
                target_version,
            )
            record = existing_by_endpoint_id.get(endpoint.id)
            if record is None:
                record = WorkflowPublishedEndpoint(
                    id=str(uuid4()),
                    workflow_id=workflow_version.workflow_id,
                    workflow_version_id=workflow_version.id,
                    workflow_version=workflow_version.version,
                    target_workflow_version_id=target_version.id,
                    target_workflow_version=target_version.version,
                    compiled_blueprint_id=compiled_blueprint.id,
                    endpoint_id=endpoint.id,
                    endpoint_name=endpoint.name,
                    endpoint_alias=endpoint.alias,
                    route_path=endpoint.path,
                    protocol=endpoint.protocol,
                    auth_mode=endpoint.authMode,
                    streaming=endpoint.streaming,
                    lifecycle_status="draft",
                    input_schema=endpoint.inputSchema,
                    output_schema=endpoint.outputSchema,
                    rate_limit_policy=(
                        endpoint.rateLimit.model_dump(mode="json")
                        if endpoint.rateLimit is not None
                        else None
                    ),
                    cache_policy=(
                        endpoint.cache.model_dump(mode="json")
                        if endpoint.cache is not None
                        else None
                    ),
                )
            else:
                record.workflow_id = workflow_version.workflow_id
                record.workflow_version_id = workflow_version.id
                record.workflow_version = workflow_version.version
                record.target_workflow_version_id = target_version.id
                record.target_workflow_version = target_version.version
                record.compiled_blueprint_id = compiled_blueprint.id
                record.endpoint_name = endpoint.name
                record.endpoint_alias = endpoint.alias
                record.route_path = endpoint.path
                record.protocol = endpoint.protocol
                record.auth_mode = endpoint.authMode
                record.streaming = endpoint.streaming
                record.input_schema = endpoint.inputSchema
                record.output_schema = endpoint.outputSchema
                record.rate_limit_policy = (
                    endpoint.rateLimit.model_dump(mode="json")
                    if endpoint.rateLimit is not None
                    else None
                )
                record.cache_policy = (
                    endpoint.cache.model_dump(mode="json")
                    if endpoint.cache is not None
                    else None
                )

            db.add(record)
            synced_records.append(record)
            seen_endpoint_ids.add(endpoint.id)

        for record in existing_records:
            if record.endpoint_id not in seen_endpoint_ids:
                db.delete(record)

        return synced_records

    def list_for_workflow(
        self,
        db: Session,
        workflow_id: str,
        *,
        workflow_version: str | None = None,
        lifecycle_status: PublishedEndpointLifecycleStatus | None = None,
    ) -> list[WorkflowPublishedEndpoint]:
        statement = (
            select(WorkflowPublishedEndpoint)
            .where(WorkflowPublishedEndpoint.workflow_id == workflow_id)
            .order_by(
                WorkflowPublishedEndpoint.workflow_version.desc(),
                WorkflowPublishedEndpoint.endpoint_name.asc(),
            )
        )
        if workflow_version is not None:
            statement = statement.where(
                WorkflowPublishedEndpoint.workflow_version == workflow_version
            )
        if lifecycle_status is not None:
            statement = statement.where(
                WorkflowPublishedEndpoint.lifecycle_status == lifecycle_status
            )
        return db.scalars(statement).all()

    def build_legacy_auth_governance_snapshot(
        self,
        db: Session,
    ) -> WorkflowPublishedEndpointLegacyAuthGovernanceSnapshot:
        rows = db.execute(
            select(WorkflowPublishedEndpoint, Workflow.name)
            .join(Workflow, Workflow.id == WorkflowPublishedEndpoint.workflow_id)
            .order_by(
                Workflow.name.asc(),
                WorkflowPublishedEndpoint.endpoint_name.asc(),
                WorkflowPublishedEndpoint.workflow_version.desc(),
            )
        ).all()

        draft_candidates: list[WorkflowPublishedEndpointLegacyAuthGovernanceBindingItem] = []
        published_blockers: list[WorkflowPublishedEndpointLegacyAuthGovernanceBindingItem] = []
        offline_inventory: list[WorkflowPublishedEndpointLegacyAuthGovernanceBindingItem] = []

        for record, workflow_name in rows:
            if not _has_blocking_legacy_auth_binding(record):
                continue

            item = _build_legacy_auth_governance_binding_item(
                record,
                workflow_name=workflow_name,
            )
            if item.lifecycle_status == "draft":
                draft_candidates.append(item)
                continue
            if item.lifecycle_status == "published":
                published_blockers.append(item)
                continue
            offline_inventory.append(item)

        workflow_summaries = _build_legacy_auth_governance_workflow_summaries(
            draft_candidates=draft_candidates,
            published_blockers=published_blockers,
            offline_inventory=offline_inventory,
        )

        return WorkflowPublishedEndpointLegacyAuthGovernanceSnapshot(
            generated_at=datetime.now(UTC),
            workflow_count=len(workflow_summaries),
            binding_count=(
                len(draft_candidates) + len(published_blockers) + len(offline_inventory)
            ),
            summary=WorkflowPublishedEndpointLegacyAuthGovernanceSummary(
                draft_candidate_count=len(draft_candidates),
                published_blocker_count=len(published_blockers),
                offline_inventory_count=len(offline_inventory),
            ),
            checklist=_build_legacy_auth_governance_checklist(
                draft_candidates,
                published_blockers,
                offline_inventory,
            ),
            workflows=workflow_summaries,
            buckets=WorkflowPublishedEndpointLegacyAuthGovernanceBuckets(
                draft_candidates=draft_candidates,
                published_blockers=published_blockers,
                offline_inventory=offline_inventory,
            ),
        )

    def get_published_binding(
        self,
        db: Session,
        *,
        workflow_id: str,
        endpoint_id: str,
    ) -> WorkflowPublishedEndpoint | None:
        return db.scalar(
            select(WorkflowPublishedEndpoint).where(
                WorkflowPublishedEndpoint.workflow_id == workflow_id,
                WorkflowPublishedEndpoint.endpoint_id == endpoint_id,
                WorkflowPublishedEndpoint.lifecycle_status == "published",
            )
        )

    def get_published_binding_by_alias(
        self,
        db: Session,
        *,
        endpoint_alias: str,
    ) -> WorkflowPublishedEndpoint | None:
        return db.scalar(
            select(WorkflowPublishedEndpoint).where(
                WorkflowPublishedEndpoint.endpoint_alias
                == normalize_published_endpoint_alias(endpoint_alias),
                WorkflowPublishedEndpoint.lifecycle_status == "published",
            )
        )

    def get_published_binding_by_path(
        self,
        db: Session,
        *,
        route_path: str,
    ) -> WorkflowPublishedEndpoint | None:
        return db.scalar(
            select(WorkflowPublishedEndpoint).where(
                WorkflowPublishedEndpoint.route_path
                == normalize_published_endpoint_path(route_path),
                WorkflowPublishedEndpoint.lifecycle_status == "published",
            )
        )

    def update_lifecycle_status(
        self,
        db: Session,
        *,
        workflow_id: str,
        binding_id: str,
        lifecycle_status: PublishedEndpointLifecycleStatus,
    ) -> WorkflowPublishedEndpoint:
        record = db.scalar(
            select(WorkflowPublishedEndpoint).where(
                WorkflowPublishedEndpoint.id == binding_id,
                WorkflowPublishedEndpoint.workflow_id == workflow_id,
            )
        )
        if record is None:
            raise WorkflowPublishBindingError("Published endpoint binding not found.")

        if lifecycle_status == "draft":
            raise WorkflowPublishBindingError(
                "Lifecycle status 'draft' is reserved for synced bindings "
                "and cannot be set manually."
            )

        if lifecycle_status == "published":
            blocking_issue = next(
                iter(
                    collect_invalid_published_endpoint_auth_mode_issues(
                        endpoint_id=record.endpoint_id,
                        endpoint_name=record.endpoint_name,
                        auth_mode=record.auth_mode,
                    )
                ),
                None,
            )
            if blocking_issue is not None and blocking_issue.blocks_lifecycle_publish:
                detail = blocking_issue.message
                if blocking_issue.remediation:
                    detail = f"{detail} {blocking_issue.remediation}"
                raise WorkflowPublishBindingError(detail)

        now = datetime.now(UTC)
        if lifecycle_status == "published":
            self._ensure_external_identity_available(db, record=record)
            published_records = db.scalars(
                select(WorkflowPublishedEndpoint).where(
                    WorkflowPublishedEndpoint.workflow_id == workflow_id,
                    WorkflowPublishedEndpoint.endpoint_id == record.endpoint_id,
                    WorkflowPublishedEndpoint.id != record.id,
                    WorkflowPublishedEndpoint.lifecycle_status == "published",
                )
            ).all()
            for published_record in published_records:
                published_record.lifecycle_status = "offline"
                published_record.unpublished_at = now
                db.add(published_record)

            record.lifecycle_status = "published"
            record.published_at = now
            record.unpublished_at = None
        elif lifecycle_status == "offline":
            if record.lifecycle_status == "published":
                record.unpublished_at = now
            elif record.unpublished_at is None:
                record.unpublished_at = now
            record.lifecycle_status = "offline"
        else:
            raise WorkflowPublishBindingError(
                f"Unsupported lifecycle status '{lifecycle_status}'."
            )

        db.add(record)
        return record

    def bulk_offline_legacy_auth_draft_bindings(
        self,
        db: Session,
        *,
        workflow_id: str,
        binding_ids: list[str],
    ) -> WorkflowPublishedEndpointLegacyAuthCleanupResult:
        normalized_binding_ids: list[str] = []
        seen_binding_ids: set[str] = set()
        for binding_id in binding_ids:
            normalized_binding_id = binding_id.strip()
            if not normalized_binding_id or normalized_binding_id in seen_binding_ids:
                continue
            normalized_binding_ids.append(normalized_binding_id)
            seen_binding_ids.add(normalized_binding_id)

        if not normalized_binding_ids:
            raise WorkflowPublishBindingError(
                "Select at least one legacy auth draft binding to clean up."
            )

        records = db.scalars(
            select(WorkflowPublishedEndpoint).where(
                WorkflowPublishedEndpoint.workflow_id == workflow_id,
                WorkflowPublishedEndpoint.id.in_(normalized_binding_ids),
            )
        ).all()
        records_by_id = {record.id: record for record in records}

        updated_binding_ids: list[str] = []
        skipped_items: list[WorkflowPublishedEndpointLegacyAuthCleanupSkipItem] = []

        for binding_id in normalized_binding_ids:
            record = records_by_id.get(binding_id)
            if record is None:
                skipped_items.append(
                    WorkflowPublishedEndpointLegacyAuthCleanupSkipItem(
                        binding_id=binding_id,
                        reason="binding_not_found",
                        detail="Published endpoint binding not found.",
                    )
                )
                continue

            issues = collect_invalid_published_endpoint_auth_mode_issues(
                endpoint_id=record.endpoint_id,
                endpoint_name=record.endpoint_name,
                auth_mode=record.auth_mode,
            )
            blocking_issue = next(
                (issue for issue in issues if issue.blocks_lifecycle_publish),
                None,
            )

            if blocking_issue is None:
                skipped_items.append(
                    WorkflowPublishedEndpointLegacyAuthCleanupSkipItem(
                        binding_id=record.id,
                        endpoint_id=record.endpoint_id,
                        endpoint_name=record.endpoint_name,
                        workflow_version=record.workflow_version,
                        lifecycle_status=record.lifecycle_status,
                        reason="binding_not_legacy_auth",
                        detail="Binding no longer uses unsupported legacy auth mode.",
                    )
                )
                continue

            if record.lifecycle_status == "offline":
                skipped_items.append(
                    WorkflowPublishedEndpointLegacyAuthCleanupSkipItem(
                        binding_id=record.id,
                        endpoint_id=record.endpoint_id,
                        endpoint_name=record.endpoint_name,
                        workflow_version=record.workflow_version,
                        lifecycle_status=record.lifecycle_status,
                        reason="binding_already_offline",
                        detail=(
                            "Binding is already offline and only remains in the cleanup "
                            "inventory."
                        ),
                    )
                )
                continue

            if record.lifecycle_status != "draft":
                skipped_items.append(
                    WorkflowPublishedEndpointLegacyAuthCleanupSkipItem(
                        binding_id=record.id,
                        endpoint_id=record.endpoint_id,
                        endpoint_name=record.endpoint_name,
                        workflow_version=record.workflow_version,
                        lifecycle_status=record.lifecycle_status,
                        reason="binding_not_draft",
                        detail=(
                            "Only draft legacy bindings can be batch-offlined. "
                            "Publish a supported replacement first if this binding is still live."
                        ),
                    )
                )
                continue

            self.update_lifecycle_status(
                db,
                workflow_id=workflow_id,
                binding_id=record.id,
                lifecycle_status="offline",
            )
            updated_binding_ids.append(record.id)

        return WorkflowPublishedEndpointLegacyAuthCleanupResult(
            requested_count=len(normalized_binding_ids),
            updated_count=len(updated_binding_ids),
            skipped_count=len(skipped_items),
            updated_binding_ids=updated_binding_ids,
            skipped_items=skipped_items,
        )

    def _ensure_external_identity_available(
        self,
        db: Session,
        *,
        record: WorkflowPublishedEndpoint,
    ) -> None:
        conflicting_records = db.scalars(
            select(WorkflowPublishedEndpoint).where(
                WorkflowPublishedEndpoint.id != record.id,
                WorkflowPublishedEndpoint.lifecycle_status == "published",
                or_(
                    WorkflowPublishedEndpoint.endpoint_alias == record.endpoint_alias,
                    WorkflowPublishedEndpoint.route_path == record.route_path,
                ),
            )
        ).all()
        for conflicting_record in conflicting_records:
            if (
                conflicting_record.workflow_id == record.workflow_id
                and conflicting_record.endpoint_id == record.endpoint_id
            ):
                continue
            if conflicting_record.endpoint_alias == record.endpoint_alias:
                raise WorkflowPublishBindingError(
                    "Published endpoint alias "
                    f"'{record.endpoint_alias}' is already used by another published endpoint."
                )
            if conflicting_record.route_path == record.route_path:
                raise WorkflowPublishBindingError(
                    "Published endpoint path "
                    f"'{record.route_path}' is already used by another published endpoint."
                )

use std::{
    cmp::Ordering,
    collections::{HashMap, HashSet},
};

use access_control::ensure_permission;
use anyhow::Result;
use uuid::Uuid;

use crate::{
    audit::audit_log,
    errors::ControlPlaneError,
    ports::{
        CreateFrontstagePageInput, FrontstagePageRepository, MoveFrontstagePageInput,
        SaveFrontstageBlockCodeInput, SaveFrontstagePageContentInput,
        UpdateFrontstagePageTitleInput,
    },
};

pub struct CreateFrontstageGroupCommand {
    pub actor_user_id: Uuid,
    pub workspace_id: Uuid,
    pub title: Option<String>,
    pub parent_id: Option<Uuid>,
    pub rank: Option<String>,
}

pub struct CreateFrontstagePageCommand {
    pub actor_user_id: Uuid,
    pub workspace_id: Uuid,
    pub title: Option<String>,
    pub parent_id: Option<Uuid>,
    pub rank: Option<String>,
}

pub struct UpdateFrontstagePageTitleCommand {
    pub actor_user_id: Uuid,
    pub workspace_id: Uuid,
    pub page_id: Uuid,
    pub title: Option<String>,
}

pub struct MoveFrontstagePageCommand {
    pub actor_user_id: Uuid,
    pub workspace_id: Uuid,
    pub page_id: Uuid,
    pub parent_id: Option<Uuid>,
    pub rank: Option<String>,
}

pub struct DeleteFrontstagePageCommand {
    pub actor_user_id: Uuid,
    pub workspace_id: Uuid,
    pub page_id: Uuid,
}

pub struct GetFrontstagePageDetailCommand {
    pub actor_user_id: Uuid,
    pub workspace_id: Uuid,
    pub page_id: Uuid,
}

pub struct GetFrontstageBlockCodeCommand {
    pub actor_user_id: Uuid,
    pub workspace_id: Uuid,
    pub page_id: Uuid,
    pub code_ref: String,
}

pub struct SaveFrontstagePageContentCommand {
    pub actor_user_id: Uuid,
    pub workspace_id: Uuid,
    pub page_id: Uuid,
    pub schema_payload: serde_json::Value,
    pub root_payload: serde_json::Value,
}

pub struct SaveFrontstageBlockCodeCommand {
    pub actor_user_id: Uuid,
    pub workspace_id: Uuid,
    pub page_id: Uuid,
    pub code_ref: String,
    pub code: String,
}

pub struct FrontstagePageService<R> {
    repository: R,
}

impl<R> FrontstagePageService<R>
where
    R: FrontstagePageRepository,
{
    pub fn new(repository: R) -> Self {
        Self { repository }
    }

    pub async fn list_page_tree(
        &self,
        actor_user_id: Uuid,
        workspace_id: Uuid,
    ) -> Result<Vec<domain::FrontstagePageTreeNode>> {
        self.repository
            .load_actor_context_for_workspace(actor_user_id, workspace_id)
            .await?;
        let pages = self.repository.list_frontstage_pages(workspace_id).await?;

        Ok(build_frontstage_page_tree(pages))
    }

    pub async fn create_group(
        &self,
        command: CreateFrontstageGroupCommand,
    ) -> Result<domain::FrontstagePageRecord> {
        let actor = self
            .repository
            .load_actor_context_for_workspace(command.actor_user_id, command.workspace_id)
            .await?;
        ensure_design_permission(&actor)?;

        if command.parent_id.is_some() {
            return Err(ControlPlaneError::InvalidInput("parent_id").into());
        }

        let created = self
            .repository
            .create_frontstage_page(&CreateFrontstagePageInput {
                id: Uuid::now_v7(),
                workspace_id: command.workspace_id,
                actor_user_id: command.actor_user_id,
                parent_id: None,
                kind: domain::FrontstagePageKind::Group,
                title: command.title,
                rank: normalize_rank(command.rank),
                schema_root_uid: None,
            })
            .await?;
        self.audit(&actor, &created, "frontstage.page_group_created")
            .await?;

        Ok(created)
    }

    pub async fn create_page(
        &self,
        command: CreateFrontstagePageCommand,
    ) -> Result<domain::FrontstagePageRecord> {
        let actor = self
            .repository
            .load_actor_context_for_workspace(command.actor_user_id, command.workspace_id)
            .await?;
        ensure_design_permission(&actor)?;
        self.ensure_page_parent(command.workspace_id, command.parent_id)
            .await?;

        let page_id = Uuid::now_v7();
        let created = self
            .repository
            .create_frontstage_page(&CreateFrontstagePageInput {
                id: page_id,
                workspace_id: command.workspace_id,
                actor_user_id: command.actor_user_id,
                parent_id: command.parent_id,
                kind: domain::FrontstagePageKind::Page,
                title: command.title,
                rank: normalize_rank(command.rank),
                schema_root_uid: Some(reserved_schema_root_uid(page_id)),
            })
            .await?;
        self.audit(&actor, &created, "frontstage.page_created")
            .await?;

        Ok(created)
    }

    pub async fn get_page_detail(
        &self,
        command: GetFrontstagePageDetailCommand,
    ) -> Result<domain::frontstage::FrontstagePageDetail> {
        self.repository
            .load_actor_context_for_workspace(command.actor_user_id, command.workspace_id)
            .await?;

        let detail = self
            .repository
            .get_frontstage_page_detail(command.workspace_id, command.page_id)
            .await?
            .ok_or(ControlPlaneError::NotFound("frontstage_page"))?;
        ensure_page_record(&detail.page)?;

        Ok(detail)
    }

    pub async fn update_title(
        &self,
        command: UpdateFrontstagePageTitleCommand,
    ) -> Result<domain::FrontstagePageRecord> {
        let actor = self
            .repository
            .load_actor_context_for_workspace(command.actor_user_id, command.workspace_id)
            .await?;
        ensure_design_permission(&actor)?;

        let updated = self
            .repository
            .update_frontstage_page_title(&UpdateFrontstagePageTitleInput {
                workspace_id: command.workspace_id,
                actor_user_id: command.actor_user_id,
                page_id: command.page_id,
                title: command.title,
            })
            .await?;
        self.audit(&actor, &updated, "frontstage.page_title_updated")
            .await?;

        Ok(updated)
    }

    pub async fn move_page(
        &self,
        command: MoveFrontstagePageCommand,
    ) -> Result<domain::FrontstagePageRecord> {
        let actor = self
            .repository
            .load_actor_context_for_workspace(command.actor_user_id, command.workspace_id)
            .await?;
        ensure_design_permission(&actor)?;

        let existing = self
            .repository
            .get_frontstage_page(command.workspace_id, command.page_id)
            .await?
            .ok_or(ControlPlaneError::NotFound("frontstage_page"))?;
        match existing.kind {
            domain::FrontstagePageKind::Group if command.parent_id.is_some() => {
                return Err(ControlPlaneError::InvalidInput("parent_id").into());
            }
            domain::FrontstagePageKind::Page => {
                self.ensure_page_parent(command.workspace_id, command.parent_id)
                    .await?;
            }
            domain::FrontstagePageKind::Group => {}
        }

        let moved = self
            .repository
            .move_frontstage_page(&MoveFrontstagePageInput {
                workspace_id: command.workspace_id,
                actor_user_id: command.actor_user_id,
                page_id: command.page_id,
                parent_id: command.parent_id,
                rank: normalize_rank(command.rank),
            })
            .await?;
        self.audit(&actor, &moved, "frontstage.page_moved").await?;

        Ok(moved)
    }

    pub async fn delete_page(&self, command: DeleteFrontstagePageCommand) -> Result<()> {
        let actor = self
            .repository
            .load_actor_context_for_workspace(command.actor_user_id, command.workspace_id)
            .await?;
        ensure_design_permission(&actor)?;

        let existing = self
            .repository
            .get_frontstage_page(command.workspace_id, command.page_id)
            .await?
            .ok_or(ControlPlaneError::NotFound("frontstage_page"))?;
        self.repository
            .delete_frontstage_page(command.workspace_id, command.page_id)
            .await?;
        self.audit(&actor, &existing, "frontstage.page_deleted")
            .await?;

        Ok(())
    }

    pub async fn save_page_content(
        &self,
        command: SaveFrontstagePageContentCommand,
    ) -> Result<domain::frontstage::FrontstagePageDetail> {
        let actor = self
            .repository
            .load_actor_context_for_workspace(command.actor_user_id, command.workspace_id)
            .await?;
        ensure_design_permission(&actor)?;
        self.ensure_existing_page(command.workspace_id, command.page_id)
            .await?;

        let detail = self
            .repository
            .save_frontstage_page_content(&SaveFrontstagePageContentInput {
                workspace_id: command.workspace_id,
                page_id: command.page_id,
                schema_payload: command.schema_payload,
                root_payload: command.root_payload,
            })
            .await?;
        self.audit(&actor, &detail.page, "frontstage.page_content_saved")
            .await?;

        Ok(detail)
    }

    pub async fn get_block_code(
        &self,
        command: GetFrontstageBlockCodeCommand,
    ) -> Result<domain::frontstage::FrontstageBlockCodeRecord> {
        self.repository
            .load_actor_context_for_workspace(command.actor_user_id, command.workspace_id)
            .await?;
        self.ensure_existing_page(command.workspace_id, command.page_id)
            .await?;
        let code_ref = normalize_code_ref(command.code_ref)?;

        self.repository
            .get_frontstage_block_code(command.workspace_id, command.page_id, &code_ref)
            .await?
            .ok_or(ControlPlaneError::NotFound("frontstage_block_code").into())
    }

    pub async fn save_block_code(
        &self,
        command: SaveFrontstageBlockCodeCommand,
    ) -> Result<domain::frontstage::FrontstageBlockCodeRecord> {
        let actor = self
            .repository
            .load_actor_context_for_workspace(command.actor_user_id, command.workspace_id)
            .await?;
        ensure_design_permission(&actor)?;
        self.ensure_existing_page(command.workspace_id, command.page_id)
            .await?;
        let code_ref = normalize_code_ref(command.code_ref)?;

        let saved = self
            .repository
            .save_frontstage_block_code(&SaveFrontstageBlockCodeInput {
                workspace_id: command.workspace_id,
                page_id: command.page_id,
                code_ref,
                code: command.code,
            })
            .await?;

        Ok(saved)
    }

    async fn ensure_page_parent(&self, workspace_id: Uuid, parent_id: Option<Uuid>) -> Result<()> {
        let Some(parent_id) = parent_id else {
            return Ok(());
        };

        let parent = self
            .repository
            .get_frontstage_page(workspace_id, parent_id)
            .await?
            .ok_or(ControlPlaneError::InvalidInput("parent_id"))?;

        if parent.kind != domain::FrontstagePageKind::Group {
            return Err(ControlPlaneError::InvalidInput("parent_id").into());
        }

        Ok(())
    }

    async fn ensure_existing_page(&self, workspace_id: Uuid, page_id: Uuid) -> Result<()> {
        let page = self
            .repository
            .get_frontstage_page(workspace_id, page_id)
            .await?
            .ok_or(ControlPlaneError::NotFound("frontstage_page"))?;
        ensure_page_record(&page)
    }

    async fn audit(
        &self,
        actor: &domain::ActorContext,
        page: &domain::FrontstagePageRecord,
        event_code: &'static str,
    ) -> Result<()> {
        self.repository
            .append_audit_log(&audit_log(
                Some(actor.current_workspace_id),
                Some(actor.user_id),
                "frontstage_page",
                Some(page.id),
                event_code,
                serde_json::json!({
                    "kind": page.kind.as_str(),
                    "title": page.title,
                    "parent_id": page.parent_id,
                }),
            ))
            .await
    }
}

fn ensure_design_permission(actor: &domain::ActorContext) -> Result<()> {
    ensure_permission(actor, "frontstage.page.design")
        .map_err(ControlPlaneError::PermissionDenied)?;
    Ok(())
}

fn ensure_page_record(page: &domain::FrontstagePageRecord) -> Result<()> {
    if page.kind != domain::FrontstagePageKind::Page {
        return Err(ControlPlaneError::NotFound("frontstage_page").into());
    }

    Ok(())
}

fn normalize_code_ref(code_ref: String) -> Result<String> {
    let trimmed = code_ref.trim();
    if trimmed.is_empty() || trimmed.len() > 200 {
        return Err(ControlPlaneError::InvalidInput("code_ref").into());
    }

    Ok(trimmed.to_owned())
}

fn normalize_rank(rank: Option<String>) -> String {
    rank.unwrap_or_default()
}

fn reserved_schema_root_uid(page_id: Uuid) -> String {
    format!("frontstage_page_schema_root:{page_id}")
}

fn build_frontstage_page_tree(
    mut records: Vec<domain::FrontstagePageRecord>,
) -> Vec<domain::FrontstagePageTreeNode> {
    let existing_ids = records
        .iter()
        .map(|record| record.id)
        .collect::<HashSet<_>>();

    for record in &mut records {
        if !matches!(record.parent_id, Some(parent_id) if existing_ids.contains(&parent_id)) {
            record.parent_id = None;
        }
    }

    records.sort_by(compare_frontstage_pages);

    let mut nodes_by_parent: HashMap<Option<Uuid>, Vec<domain::FrontstagePageRecord>> =
        HashMap::new();
    for record in records {
        nodes_by_parent
            .entry(record.parent_id)
            .or_default()
            .push(record);
    }

    fn flatten_group_children(
        group_id: Uuid,
        nodes_by_parent: &HashMap<Option<Uuid>, Vec<domain::FrontstagePageRecord>>,
        visiting_groups: &mut HashSet<Uuid>,
    ) -> Vec<domain::FrontstagePageTreeNode> {
        if !visiting_groups.insert(group_id) {
            return vec![];
        }

        let mut output = vec![];
        if let Some(children) = nodes_by_parent.get(&Some(group_id)) {
            output.reserve(children.len());
            for child in children {
                if child.kind == domain::FrontstagePageKind::Page {
                    output.push(domain::FrontstagePageTreeNode {
                        page: child.clone(),
                        children: vec![],
                    });
                    continue;
                }

                output.extend(flatten_group_children(
                    child.id,
                    nodes_by_parent,
                    visiting_groups,
                ));
            }
        }

        visiting_groups.remove(&group_id);
        output
    }

    nodes_by_parent
        .remove(&None)
        .unwrap_or_default()
        .into_iter()
        .map(|record| {
            let children = if record.kind == domain::FrontstagePageKind::Group {
                flatten_group_children(record.id, &nodes_by_parent, &mut HashSet::new())
            } else {
                vec![]
            };

            domain::FrontstagePageTreeNode {
                page: record,
                children,
            }
        })
        .collect()
}

fn compare_frontstage_pages(
    left: &domain::FrontstagePageRecord,
    right: &domain::FrontstagePageRecord,
) -> Ordering {
    let parent_cmp = left.parent_id.cmp(&right.parent_id);
    if parent_cmp != Ordering::Equal {
        return parent_cmp;
    }

    let rank_cmp = left.rank.cmp(&right.rank);
    if rank_cmp != Ordering::Equal {
        return rank_cmp;
    }

    left.id.cmp(&right.id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use domain::FrontstagePageKind;
    use time::OffsetDateTime;

    fn test_uuid(value: u128) -> Uuid {
        Uuid::from_u128(value)
    }

    fn page_record(
        id: u128,
        kind: FrontstagePageKind,
        parent_id: Option<Uuid>,
        rank: &str,
    ) -> domain::FrontstagePageRecord {
        domain::FrontstagePageRecord {
            id: test_uuid(id),
            workspace_id: test_uuid(0x100),
            parent_id,
            kind,
            title: None,
            slug: None,
            schema_root_uid: (kind == FrontstagePageKind::Page)
                .then(|| format!("schema-root:{id}")),
            rank: rank.to_owned(),
            created_at: OffsetDateTime::UNIX_EPOCH,
            updated_at: OffsetDateTime::UNIX_EPOCH,
        }
    }

    #[test]
    fn build_frontstage_page_tree_promotes_missing_parent_records_to_root() {
        let orphan_group_id = test_uuid(0x10);
        let orphan_page_id = test_uuid(0x20);
        let root_group_id = test_uuid(0x30);
        let child_page_id = test_uuid(0x40);
        let missing_parent_id = test_uuid(0x999);

        let tree = build_frontstage_page_tree(vec![
            page_record(
                0x20,
                FrontstagePageKind::Page,
                Some(missing_parent_id),
                "b",
            ),
            page_record(0x30, FrontstagePageKind::Group, None, "c"),
            page_record(0x40, FrontstagePageKind::Page, Some(root_group_id), "a"),
            page_record(
                0x10,
                FrontstagePageKind::Group,
                Some(missing_parent_id),
                "a",
            ),
        ]);

        let root_ids = tree.iter().map(|node| node.page.id).collect::<Vec<_>>();
        assert_eq!(root_ids, vec![orphan_group_id, orphan_page_id, root_group_id]);
        assert_eq!(tree[0].page.parent_id, None);
        assert_eq!(tree[1].page.parent_id, None);
        assert!(tree[0].children.is_empty());
        assert!(tree[1].children.is_empty());
        assert_eq!(
            tree[2]
                .children
                .iter()
                .map(|node| node.page.id)
                .collect::<Vec<_>>(),
            vec![child_page_id]
        );
    }

    #[test]
    fn build_frontstage_page_tree_flattens_nested_groups_and_ignores_reentrant_group_edges() {
        let root_group_id = test_uuid(0x10);
        let nested_page_id = test_uuid(0x30);

        let tree = build_frontstage_page_tree(vec![
            page_record(0x10, FrontstagePageKind::Group, None, "a"),
            page_record(0x10, FrontstagePageKind::Group, Some(root_group_id), "a"),
            page_record(0x20, FrontstagePageKind::Group, Some(root_group_id), "b"),
            page_record(0x30, FrontstagePageKind::Page, Some(test_uuid(0x20)), "a"),
        ]);

        assert_eq!(tree.len(), 1);
        assert_eq!(tree[0].page.id, root_group_id);
        assert_eq!(
            tree[0]
                .children
                .iter()
                .map(|node| (node.page.id, node.page.kind))
                .collect::<Vec<_>>(),
            vec![(nested_page_id, FrontstagePageKind::Page)]
        );
        assert!(tree[0]
            .children
            .iter()
            .all(|node| node.children.is_empty()));
    }
}

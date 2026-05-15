use std::{cmp::Ordering, collections::HashMap, sync::Arc};

use axum::{
    extract::{Path, State},
    http::HeaderMap,
    routing::get,
    Json, Router,
};
use control_plane::workspace::WorkspaceService;
use serde::{Deserialize, Serialize};
use sqlx::Row;
use utoipa::ToSchema;
use uuid::Uuid;

use crate::{
    app_state::ApiState, error_response::ApiError, middleware::require_session::require_session,
    response::ApiSuccess,
};

#[derive(Debug, Deserialize, Serialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum FrontstagePageTreeNodeKind {
    Group,
    Page,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct FrontstagePageTreeNodeResponse {
    pub id: String,
    pub title: Option<String>,
    pub kind: FrontstagePageTreeNodeKind,
    #[serde(default)]
    pub children: Vec<FrontstagePageTreeNodeResponse>,
}

#[derive(Debug)]
struct FrontstagePageRecord {
    id: Uuid,
    title: Option<String>,
    kind: FrontstagePageTreeNodeKind,
    parent_id: Option<Uuid>,
    rank: Option<String>,
}

#[derive(Debug)]
struct FrontstagePageTreeNode {
    id: Uuid,
    node: FrontstagePageTreeNodeResponse,
}

pub fn router() -> Router<Arc<ApiState>> {
    Router::new().route("/frontstage/:workspace_id/pages", get(list_frontstage_pages))
}

#[utoipa::path(
    get,
    path = "/api/console/frontstage/{workspace_id}/pages",
    params(
        ("workspace_id" = String, Path, description = "Workspace id"),
    ),
    responses(
        (status = 200, body = [FrontstagePageTreeNodeResponse]),
        (status = 400, body = crate::error_response::ErrorBody),
        (status = 401, body = crate::error_response::ErrorBody),
        (status = 403, body = crate::error_response::ErrorBody)
    )
)]
pub async fn list_frontstage_pages(
    State(state): State<Arc<ApiState>>,
    headers: HeaderMap,
    Path(workspace_id): Path<String>,
) -> Result<Json<ApiSuccess<Vec<FrontstagePageTreeNodeResponse>>>, ApiError> {
    let context = require_session(&state, &headers).await?;

    let workspace_id = parse_uuid(&workspace_id, "workspace_id")?;
    WorkspaceService::new(state.store.clone())
        .get_accessible_workspace(context.user.id, workspace_id)
        .await?;

    let rows = sqlx::query(
        "
        select id, title, kind, parent_id, rank
        from frontstage_pages
        where workspace_id = $1
        order by workspace_id, parent_id nulls first, rank nulls last
        ",
    )
    .bind(workspace_id)
    .fetch_all(state.store.pool())
    .await?;

    let records = rows
        .into_iter()
        .map(|row| {
            let raw_kind = row.get::<String, _>("kind");
            Ok(FrontstagePageRecord {
                id: row.get("id"),
                title: row.get("title"),
                kind: parse_frontstage_page_kind(&raw_kind)?,
                parent_id: row.get("parent_id"),
                rank: row.get("rank"),
            })
        })
        .collect::<Result<Vec<_>, ApiError>>()?;

    Ok(Json(ApiSuccess::new(build_frontstage_page_tree(records))))
}

fn parse_uuid(raw: &str, field: &'static str) -> Result<Uuid, ApiError> {
    Uuid::parse_str(raw).map_err(|_| control_plane::errors::ControlPlaneError::InvalidInput(field).into())
}

fn parse_frontstage_page_kind(
    raw_kind: &str,
) -> Result<FrontstagePageTreeNodeKind, ApiError> {
    match raw_kind {
        "group" => Ok(FrontstagePageTreeNodeKind::Group),
        "page" => Ok(FrontstagePageTreeNodeKind::Page),
        _ => Err(control_plane::errors::ControlPlaneError::InvalidInput("kind").into()),
    }
}

fn build_frontstage_page_tree(
    mut records: Vec<FrontstagePageRecord>,
) -> Vec<FrontstagePageTreeNodeResponse> {
    records.sort_by(|left, right| {
        let parent_cmp = left.parent_id.cmp(&right.parent_id);
        if parent_cmp != Ordering::Equal {
            return parent_cmp;
        }

        match (&left.rank, &right.rank) {
            (Some(left_rank), Some(right_rank)) => left_rank.cmp(right_rank),
            (None, None) => left.id.cmp(&right.id),
            (Some(_), None) => Ordering::Less,
            (None, Some(_)) => Ordering::Greater,
        }
    });

    let mut nodes_by_parent: HashMap<Option<Uuid>, Vec<FrontstagePageTreeNode>> = HashMap::new();
    for record in records {
        nodes_by_parent
            .entry(record.parent_id)
            .or_default()
            .push(FrontstagePageTreeNode {
                id: record.id,
                node: FrontstagePageTreeNodeResponse {
                    id: record.id.to_string(),
                    title: record.title,
                    kind: record.kind,
                    children: vec![],
                },
            });
    }

    fn flatten_group_children(
        group_id: Uuid,
        nodes_by_parent: &HashMap<Option<Uuid>, Vec<FrontstagePageTreeNode>>,
    ) -> Vec<FrontstagePageTreeNodeResponse> {
        nodes_by_parent
            .get(&Some(group_id))
            .map(|children| {
                let mut output = Vec::with_capacity(children.len());
                for child in children {
                    if child.node.kind == FrontstagePageTreeNodeKind::Page {
                        output.push(child.node.clone());
                    } else {
                        output.extend(flatten_group_children(child.id, nodes_by_parent));
                    }
                }

                output
            })
            .unwrap_or_default()
    }

    let mut roots = nodes_by_parent.remove(&None).unwrap_or_default();
    for root in &mut roots {
        if root.node.kind == FrontstagePageTreeNodeKind::Group {
            root.node.children = flatten_group_children(root.id, &nodes_by_parent);
        }
    }

    roots.into_iter().map(|node| node.node).collect()
}

#[cfg(test)]
mod tests {
    use std::str::FromStr;

    use super::*;

    #[test]
    fn build_frontstage_page_tree_flattens_nested_groups_into_group_pages() {
        let root_group_id = Uuid::from_str("11111111-1111-1111-1111-111111111111").unwrap();
        let nested_group_id = Uuid::from_str("11111111-1111-1111-1111-111111111112").unwrap();
        let nested_page_id = Uuid::from_str("11111111-1111-1111-1111-111111111113").unwrap();
        let root_page_id = Uuid::from_str("11111111-1111-1111-1111-111111111114").unwrap();

        let output = build_frontstage_page_tree(vec![
            FrontstagePageRecord {
                id: nested_page_id,
                title: Some("Nested".to_string()),
                kind: FrontstagePageTreeNodeKind::Page,
                parent_id: Some(nested_group_id),
                rank: Some("a".to_string()),
            },
            FrontstagePageRecord {
                id: nested_group_id,
                title: Some("Nested Group".to_string()),
                kind: FrontstagePageTreeNodeKind::Group,
                parent_id: Some(root_group_id),
                rank: Some("a".to_string()),
            },
            FrontstagePageRecord {
                id: root_group_id,
                title: Some("Root Group".to_string()),
                kind: FrontstagePageTreeNodeKind::Group,
                parent_id: None,
                rank: Some("a".to_string()),
            },
            FrontstagePageRecord {
                id: root_page_id,
                title: Some("Root Page".to_string()),
                kind: FrontstagePageTreeNodeKind::Page,
                parent_id: None,
                rank: Some("b".to_string()),
            },
        ]);

        assert_eq!(output.len(), 2);
        assert_eq!(output[0].kind, FrontstagePageTreeNodeKind::Group);
        assert_eq!(output[0].id, root_group_id.to_string());
        assert_eq!(output[0].children.len(), 1);
        assert_eq!(output[0].children[0].id, nested_page_id.to_string());
        assert_eq!(output[0].children[0].kind, FrontstagePageTreeNodeKind::Page);
        assert_eq!(output[1].id, root_page_id.to_string());
    }
}

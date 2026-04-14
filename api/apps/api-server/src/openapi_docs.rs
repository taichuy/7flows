use std::collections::{BTreeSet, HashMap, HashSet};

use anyhow::{anyhow, bail, Context, Result};
use serde::Serialize;
use serde_json::{Map, Value};
use utoipa::{OpenApi, ToSchema};

const HTTP_METHODS: &[&str] = &[
    "get", "put", "post", "delete", "options", "head", "patch", "trace",
];

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct DocsCatalogOperation {
    pub id: String,
    pub method: String,
    pub path: String,
    pub summary: Option<String>,
    pub description: Option<String>,
    pub tags: Vec<String>,
    pub group: String,
    pub deprecated: bool,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct DocsCatalogCategory {
    pub id: String,
    pub label: String,
    pub operation_count: usize,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct DocsCatalogCategoryOperations {
    pub id: String,
    pub label: String,
    pub operations: Vec<DocsCatalogOperation>,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct DocsCatalog {
    pub title: String,
    pub version: String,
    pub categories: Vec<DocsCatalogCategory>,
}

#[derive(Debug, Clone)]
pub struct ApiDocsRegistry {
    catalog: DocsCatalog,
    category_operations: HashMap<String, DocsCatalogCategoryOperations>,
    operation_specs: HashMap<String, Value>,
}

impl ApiDocsRegistry {
    pub fn catalog(&self) -> &DocsCatalog {
        &self.catalog
    }

    pub fn operation_spec(&self, operation_id: &str) -> Option<&Value> {
        self.operation_specs.get(operation_id)
    }

    pub fn category_operations(&self, category_id: &str) -> Option<&DocsCatalogCategoryOperations> {
        self.category_operations.get(category_id)
    }
}

pub fn build_default_api_docs_registry() -> Result<ApiDocsRegistry> {
    build_api_docs_registry(serde_json::to_value(crate::openapi::ApiDoc::openapi())?)
}

pub fn build_api_docs_registry(canonical: Value) -> Result<ApiDocsRegistry> {
    let canonical_map = canonical
        .as_object()
        .context("canonical OpenAPI document must be a JSON object")?;
    let title = canonical_map
        .get("info")
        .and_then(Value::as_object)
        .and_then(|info| info.get("title"))
        .and_then(Value::as_str)
        .context("canonical OpenAPI document must contain info.title")?
        .to_string();
    let version = canonical_map
        .get("info")
        .and_then(Value::as_object)
        .and_then(|info| info.get("version"))
        .and_then(Value::as_str)
        .context("canonical OpenAPI document must contain info.version")?
        .to_string();
    canonical_map
        .get("openapi")
        .and_then(Value::as_str)
        .context("canonical OpenAPI document must contain openapi")?;

    let paths = canonical_map
        .get("paths")
        .and_then(Value::as_object)
        .context("canonical OpenAPI document must contain paths")?;

    let mut category_operations = HashMap::<String, DocsCatalogCategoryOperations>::new();
    let mut category_singleton_flags = HashMap::<String, bool>::new();
    let mut operation_specs = HashMap::new();
    let mut seen_ids = HashSet::new();

    for (path, path_item) in paths {
        let path_item_map = path_item
            .as_object()
            .with_context(|| format!("path item `{path}` must be an object"))?;

        for method in HTTP_METHODS {
            let Some(operation) = path_item_map.get(*method) else {
                continue;
            };

            let operation_map = operation
                .as_object()
                .with_context(|| format!("operation `{method} {path}` must be an object"))?;
            let operation_id = operation_map
                .get("operationId")
                .and_then(Value::as_str)
                .with_context(|| format!("operation `{method} {path}` must define operationId"))?;

            if !seen_ids.insert(operation_id.to_string()) {
                bail!("duplicate operationId `{operation_id}`");
            }

            let tags = extract_tags(operation);
            let (category_id, category_label, is_singleton) = derive_category(path, operation_id);
            let catalog_operation = DocsCatalogOperation {
                id: operation_id.to_string(),
                method: method.to_ascii_uppercase(),
                path: path.to_string(),
                summary: operation_map
                    .get("summary")
                    .and_then(Value::as_str)
                    .map(ToString::to_string),
                description: operation_map
                    .get("description")
                    .and_then(Value::as_str)
                    .map(ToString::to_string),
                tags: tags.clone(),
                group: category_label.clone(),
                deprecated: operation_map
                    .get("deprecated")
                    .and_then(Value::as_bool)
                    .unwrap_or(false),
            };

            category_singleton_flags.insert(category_id.clone(), is_singleton);
            category_operations
                .entry(category_id.clone())
                .or_insert_with(|| DocsCatalogCategoryOperations {
                    id: category_id.clone(),
                    label: category_label.clone(),
                    operations: Vec::new(),
                })
                .operations
                .push(catalog_operation);

            operation_specs.insert(
                operation_id.to_string(),
                close_operation_spec(&canonical, path, method, operation)?,
            );
        }
    }

    for operations in category_operations.values_mut() {
        operations.operations.sort_by(compare_operations);
    }

    let mut categories = category_operations
        .values()
        .map(|operations| DocsCatalogCategory {
            id: operations.id.clone(),
            label: operations.label.clone(),
            operation_count: operations.operations.len(),
        })
        .collect::<Vec<_>>();
    categories.sort_by(|left, right| compare_categories(left, right, &category_singleton_flags));

    Ok(ApiDocsRegistry {
        catalog: DocsCatalog {
            title,
            version,
            categories,
        },
        category_operations,
        operation_specs,
    })
}

fn extract_tags(operation: &Value) -> Vec<String> {
    operation
        .get("tags")
        .and_then(Value::as_array)
        .map(|tags| {
            tags.iter()
                .filter_map(Value::as_str)
                .map(ToString::to_string)
                .collect()
        })
        .unwrap_or_default()
}

fn derive_category(path: &str, operation_id: &str) -> (String, String, bool) {
    let segments = path
        .split('/')
        .filter(|segment| !segment.is_empty())
        .collect::<Vec<_>>();

    match segments.as_slice() {
        ["api", category, ..] if !category.starts_with('{') => {
            let category = (*category).to_string();
            (category.clone(), category, false)
        }
        _ => (format!("single:{operation_id}"), path.to_string(), true),
    }
}

fn compare_operations(
    left: &DocsCatalogOperation,
    right: &DocsCatalogOperation,
) -> std::cmp::Ordering {
    left.path
        .cmp(&right.path)
        .then_with(|| left.method.cmp(&right.method))
        .then_with(|| left.id.cmp(&right.id))
}

fn compare_categories(
    left: &DocsCatalogCategory,
    right: &DocsCatalogCategory,
    singleton_flags: &HashMap<String, bool>,
) -> std::cmp::Ordering {
    let left_is_singleton = singleton_flags.get(&left.id).copied().unwrap_or(false);
    let right_is_singleton = singleton_flags.get(&right.id).copied().unwrap_or(false);

    left_is_singleton
        .cmp(&right_is_singleton)
        .then_with(|| left.label.cmp(&right.label))
        .then_with(|| left.id.cmp(&right.id))
}

pub fn collect_refs(value: &Value, refs: &mut BTreeSet<String>) {
    match value {
        Value::Object(map) => {
            if let Some(target) = map.get("$ref").and_then(Value::as_str) {
                refs.insert(target.to_string());
            }
            for nested in map.values() {
                collect_refs(nested, refs);
            }
        }
        Value::Array(items) => {
            for item in items {
                collect_refs(item, refs);
            }
        }
        _ => {}
    }
}

fn close_operation_spec(
    canonical: &Value,
    path: &str,
    method: &str,
    operation: &Value,
) -> Result<Value> {
    let canonical_map = canonical
        .as_object()
        .context("canonical OpenAPI document must be a JSON object")?;
    let path_item_map = canonical_map
        .get("paths")
        .and_then(Value::as_object)
        .and_then(|paths| paths.get(path))
        .and_then(Value::as_object)
        .with_context(|| format!("path `{path}` not found in canonical document"))?;

    let mut scoped_path_item = Map::new();
    for (key, value) in path_item_map {
        if key == method || !HTTP_METHODS.contains(&key.as_str()) {
            scoped_path_item.insert(key.clone(), value.clone());
        }
    }

    scoped_path_item.insert(method.to_string(), operation.clone());

    let mut refs = BTreeSet::new();
    collect_refs(&Value::Object(scoped_path_item.clone()), &mut refs);

    let mut components = Value::Object(Map::new());
    let mut pending_refs = refs.iter().cloned().collect::<Vec<_>>();
    let mut visited_refs = HashSet::new();

    while let Some(reference) = pending_refs.pop() {
        if !visited_refs.insert(reference.clone()) {
            continue;
        }

        let pointer = reference
            .strip_prefix('#')
            .ok_or_else(|| anyhow!("unsupported external $ref `{reference}`"))?;
        let referenced_value = canonical
            .pointer(pointer)
            .with_context(|| format!("missing referenced node `{reference}`"))?
            .clone();

        if let Some(component_pointer) = pointer.strip_prefix("/components") {
            insert_pointer(&mut components, component_pointer, referenced_value.clone())?;
        } else {
            bail!("unsupported non-components $ref `{reference}`");
        }

        let mut nested_refs = BTreeSet::new();
        collect_refs(&referenced_value, &mut nested_refs);
        pending_refs.extend(nested_refs);
    }

    let operation_tags = extract_tags(operation).into_iter().collect::<BTreeSet<_>>();
    let filtered_tags = canonical_map
        .get("tags")
        .and_then(Value::as_array)
        .map(|tags| {
            tags.iter()
                .filter(|tag| {
                    tag.get("name")
                        .and_then(Value::as_str)
                        .map(|name| operation_tags.contains(name))
                        .unwrap_or(false)
                })
                .cloned()
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    let mut spec = Map::new();
    spec.insert(
        "openapi".to_string(),
        canonical_map
            .get("openapi")
            .cloned()
            .context("canonical OpenAPI document must contain openapi")?,
    );
    spec.insert(
        "info".to_string(),
        canonical_map
            .get("info")
            .cloned()
            .context("canonical OpenAPI document must contain info")?,
    );
    if let Some(servers) = canonical_map.get("servers") {
        spec.insert("servers".to_string(), servers.clone());
    }
    spec.insert(
        "paths".to_string(),
        Value::Object(Map::from_iter([(
            path.to_string(),
            Value::Object(scoped_path_item),
        )])),
    );
    spec.insert("components".to_string(), components);
    if !filtered_tags.is_empty() {
        spec.insert("tags".to_string(), Value::Array(filtered_tags));
    }

    Ok(Value::Object(spec))
}

fn insert_pointer(target: &mut Value, pointer: &str, value: Value) -> Result<()> {
    if pointer.is_empty() {
        *target = value;
        return Ok(());
    }

    let mut current = target;
    let mut tokens = pointer
        .trim_start_matches('/')
        .split('/')
        .map(unescape_json_pointer_token)
        .peekable();

    while let Some(token) = tokens.next() {
        let is_last = tokens.peek().is_none();
        let map = current
            .as_object_mut()
            .context("JSON pointer target must be an object")?;

        if is_last {
            map.insert(token, value);
            return Ok(());
        }

        current = map
            .entry(token)
            .or_insert_with(|| Value::Object(Map::new()));
    }

    Ok(())
}

fn unescape_json_pointer_token(token: &str) -> String {
    token.replace("~1", "/").replace("~0", "~")
}

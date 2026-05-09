use anyhow::Result;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::errors::ControlPlaneError;
use crate::{
    application_public_api::{
        ensure_application_edit_permission, ensure_application_view_permission,
    },
    ports::{
        ApplicationApiMappingRepository, ApplicationRepository, ReplaceApplicationApiMappingInput,
    },
};

#[derive(Debug, Clone)]
pub struct GetApplicationApiMappingCommand {
    pub actor_user_id: Uuid,
    pub application_id: Uuid,
}

#[derive(Debug, Clone)]
pub struct ReplaceApplicationApiMappingCommand {
    pub actor_user_id: Uuid,
    pub application_id: Uuid,
    pub mapping: ApplicationApiMappingConfig,
}

pub struct ApplicationApiMappingService<R> {
    repository: R,
}

impl<R> ApplicationApiMappingService<R>
where
    R: ApplicationRepository + ApplicationApiMappingRepository,
{
    pub fn new(repository: R) -> Self {
        Self { repository }
    }

    pub async fn get_mapping(
        &self,
        command: GetApplicationApiMappingCommand,
    ) -> Result<ApplicationApiMappingConfig> {
        let actor = self
            .repository
            .load_actor_context_for_user(command.actor_user_id)
            .await?;
        let application = self
            .repository
            .get_application(actor.current_workspace_id, command.application_id)
            .await?
            .ok_or(ControlPlaneError::NotFound("application"))?;
        ensure_application_view_permission(&actor, &application)?;

        Ok(self
            .repository
            .get_application_api_mapping(application.id)
            .await?
            .unwrap_or_else(ApplicationApiMappingConfig::default_native))
    }

    pub async fn replace_mapping(
        &self,
        command: ReplaceApplicationApiMappingCommand,
    ) -> Result<ApplicationApiMappingConfig> {
        validate_application_api_mapping(&command.mapping)?;
        let actor = self
            .repository
            .load_actor_context_for_user(command.actor_user_id)
            .await?;
        let application = self
            .repository
            .get_application(actor.current_workspace_id, command.application_id)
            .await?
            .ok_or(ControlPlaneError::NotFound("application"))?;
        ensure_application_edit_permission(&actor, &application)?;

        self.repository
            .replace_application_api_mapping(&ReplaceApplicationApiMappingInput {
                actor_user_id: command.actor_user_id,
                application_id: application.id,
                mapping: command.mapping,
            })
            .await
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ApplicationApiMappingConfig {
    pub input: ApplicationApiMappingInput,
    pub output: ApplicationApiMappingOutput,
}

impl ApplicationApiMappingConfig {
    pub fn default_native() -> Self {
        Self {
            input: ApplicationApiMappingInput {
                query_target: "start.query".to_string(),
                model_target: None,
                inputs_target: None,
                history_target: None,
                attachments_target: None,
            },
            output: ApplicationApiMappingOutput::default(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ApplicationApiMappingInput {
    pub query_target: String,
    pub model_target: Option<String>,
    pub inputs_target: Option<String>,
    pub history_target: Option<String>,
    pub attachments_target: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct ApplicationApiMappingOutput {
    pub answer_selector: Option<String>,
    pub usage_selector: Option<String>,
    pub files_selector: Option<String>,
    pub error_selector: Option<String>,
}

pub fn validate_application_api_mapping(mapping: &ApplicationApiMappingConfig) -> Result<()> {
    validate_required_selector("query_target", &mapping.input.query_target)?;
    validate_optional_selector("model_target", mapping.input.model_target.as_deref())?;
    validate_optional_selector("inputs_target", mapping.input.inputs_target.as_deref())?;
    validate_optional_selector("history_target", mapping.input.history_target.as_deref())?;
    validate_optional_selector(
        "attachments_target",
        mapping.input.attachments_target.as_deref(),
    )?;
    validate_optional_selector("answer_selector", mapping.output.answer_selector.as_deref())?;
    validate_optional_selector("usage_selector", mapping.output.usage_selector.as_deref())?;
    validate_optional_selector("files_selector", mapping.output.files_selector.as_deref())?;
    validate_optional_selector("error_selector", mapping.output.error_selector.as_deref())?;
    Ok(())
}

fn validate_required_selector(field: &'static str, selector: &str) -> Result<()> {
    if selector.trim().is_empty() {
        return Err(ControlPlaneError::InvalidInput(field).into());
    }
    validate_selector_syntax(selector)
}

fn validate_optional_selector(field: &'static str, selector: Option<&str>) -> Result<()> {
    let Some(selector) = selector else {
        return Ok(());
    };
    if selector.trim().is_empty() {
        return Err(ControlPlaneError::InvalidInput(field).into());
    }
    validate_selector_syntax(selector)
}

fn validate_selector_syntax(selector: &str) -> Result<()> {
    if selector.trim() != selector
        || selector.contains('*')
        || selector.contains('[')
        || selector.contains(']')
        || selector.contains('(')
        || selector.contains(')')
        || selector.contains('?')
    {
        return Err(ControlPlaneError::InvalidInput("selector").into());
    }

    let valid = selector.split('.').all(|part| {
        !part.is_empty()
            && part.chars().all(|character| {
                character.is_ascii_alphanumeric() || character == '_' || character == '-'
            })
    });
    if !valid {
        return Err(ControlPlaneError::InvalidInput("selector").into());
    }

    Ok(())
}

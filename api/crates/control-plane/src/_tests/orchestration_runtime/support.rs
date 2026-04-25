use super::*;

use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
};

use crate::capability_plugin_runtime::{
    CapabilityExecutionOutput, ResolveCapabilityOptionsInput, ResolveCapabilityOutputSchemaInput,
    ValidateCapabilityConfigInput,
};
use crate::ports::{
    AppendRunEventInput, CompleteFlowRunInput, CompleteNodeRunInput, CreateCallbackTaskInput,
    CreateCheckpointInput, CreateFlowRunInput, CreateNodeRunInput, UpdateFlowRunInput,
    UpdateNodeRunInput, UpsertCompiledPlanInput,
};
use plugin_framework::provider_contract::ProviderStreamEvent;

use crate::{
    flow::InMemoryFlowRepository,
    ports::{
        ApplicationVisibility, CreateApplicationInput, CreateApplicationTagInput,
        UpdateApplicationInput,
    },
};

#[path = "support/fixtures.rs"]
mod fixtures;
#[path = "support/repository.rs"]
mod repository;

pub(crate) use repository::{InMemoryOrchestrationRuntimeRepository, InMemoryProviderRuntime};

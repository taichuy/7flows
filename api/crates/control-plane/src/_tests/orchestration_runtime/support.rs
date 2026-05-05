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
    AppendBillingSessionInput, AppendCapabilityInvocationInput, AppendContextProjectionInput,
    AppendCostLedgerInput, AppendCreditLedgerInput, AppendModelFailoverAttemptLedgerInput,
    AppendRunEventInput, AppendRuntimeEventInput, AppendRuntimeItemInput, AppendRuntimeSpanInput,
    AppendUsageLedgerInput, CompleteFlowRunInput, CompleteNodeRunInput, CreateCallbackTaskInput,
    CreateCheckpointInput, CreateFlowRunInput, CreateModelDefinitionInput, CreateNodeRunInput,
    CreateScopeDataModelGrantInput, LinkUsageLedgerToModelFailoverAttemptInput,
    ModelDefinitionRepository, OrchestrationRuntimeRepository, UpdateFlowRunInput,
    UpdateModelDefinitionInput, UpdateModelFieldInput, UpdateNodeRunInput,
    UpdateScopeDataModelGrantInput, UpsertCompiledPlanInput,
};
use plugin_framework::provider_contract::ProviderStreamEvent;

use crate::{
    flow::InMemoryFlowRepository,
    ports::{
        ApplicationVisibility, CreateApplicationInput, CreateApplicationTagInput,
        DeleteApplicationInput, UpdateApplicationInput,
    },
};

#[path = "support/fixtures.rs"]
mod fixtures;
#[path = "support/repository/mod.rs"]
mod repository;

pub(crate) use repository::{InMemoryOrchestrationRuntimeRepository, InMemoryProviderRuntime};

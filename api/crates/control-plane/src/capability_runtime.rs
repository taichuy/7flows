/// CapabilitySpec is a runtime identity, not a display label.
/// Provider plugins may request these IDs through model tool-call intent,
/// but only CapabilityRuntime may authorize and execute them.
#[derive(Debug, Clone)]
pub struct CapabilitySpec {
    pub id: String,
    pub kind: String,
    pub source: String,
    pub namespace: String,
    pub name: String,
    pub version: String,
    pub schema: serde_json::Value,
    pub result_schema: serde_json::Value,
    pub permissions: serde_json::Value,
}

#[derive(Debug, Clone)]
pub struct CapabilityResult {
    pub result_type: String,
    pub payload: serde_json::Value,
    pub artifact_ref: Option<String>,
}

pub fn host_tool_capability_id(name: &str) -> String {
    format!("host_tool:model:{name}@runtime")
}

pub fn mcp_tool_capability_id(server: &str, method: &str) -> String {
    format!("mcp_tool:mcp:{server}:{method}@runtime")
}

pub fn skill_action_capability_id(
    source: &str,
    namespace: &str,
    name: &str,
    version: &str,
) -> String {
    format!("skill_action:{source}:{namespace}:{name}@{version}")
}

pub fn workflow_tool_capability_id(application_id: &str, flow_id: &str, version: &str) -> String {
    format!("workflow_tool:{application_id}:{flow_id}@{version}")
}

pub fn approval_capability_id(policy_id: &str, version: &str) -> String {
    format!("approval:policy:{policy_id}@{version}")
}

pub fn subagent_capability_id(agent_source: &str, agent_name: &str, version: &str) -> String {
    format!("system_agent:{agent_source}:{agent_name}@{version}")
}

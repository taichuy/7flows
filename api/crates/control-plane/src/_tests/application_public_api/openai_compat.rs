use control_plane::application_public_api::compat::openai::{
    map_chat_completion_request, OpenAiCompatError,
};
use serde_json::{json, Value};

fn base_request() -> Value {
    json!({
        "model": "provider/custom-model",
        "messages": [
            {"role": "user", "content": "Earlier question"},
            {"role": "assistant", "content": "Earlier answer"},
            {"role": "user", "content": "Final question"}
        ]
    })
}

fn assert_unsupported_feature(request: Value, param: &str) {
    let error = map_chat_completion_request(request).unwrap_err();

    assert_openai_unsupported_feature(error, param);
}

fn assert_openai_unsupported_feature(error: OpenAiCompatError, param: &str) {
    assert_eq!(error.error_type, "invalid_request_error");
    assert_eq!(error.code, "unsupported_feature");
    assert_eq!(error.param.as_deref(), Some(param));
    assert_eq!(
        error.message,
        format!("{param} is not supported by this endpoint")
    );
}

#[test]
fn last_user_text_maps_to_native_query() {
    let native = map_chat_completion_request(base_request()).unwrap();

    assert_eq!(native.query, "Final question");
}

#[test]
fn prior_messages_map_to_native_history() {
    let native = map_chat_completion_request(json!({
        "model": "gpt-compatible",
        "messages": [
            {"role": "system", "content": "Use the support playbook."},
            {"role": "user", "content": "Earlier question"},
            {"role": "assistant", "content": "Earlier answer"},
            {"role": "user", "content": "Final question"}
        ]
    }))
    .unwrap();

    assert_eq!(
        native.history,
        vec![
            json!({"role": "system", "content": "Use the support playbook."}),
            json!({"role": "user", "content": "Earlier question"}),
            json!({"role": "assistant", "content": "Earlier answer"})
        ]
    );
}

#[test]
fn stream_true_maps_to_native_streaming_response_mode() {
    let mut request = base_request();
    request["stream"] = json!(true);

    let native = map_chat_completion_request(request).unwrap();

    assert_eq!(native.response_mode.as_deref(), Some("streaming"));
}

#[test]
fn user_maps_to_native_conversation_user() {
    let mut request = base_request();
    request["user"] = json!("external-user-123");

    let native = map_chat_completion_request(request).unwrap();

    assert_eq!(
        native.conversation.get("user"),
        Some(&json!("external-user-123"))
    );
}

#[test]
fn metadata_maps_to_native_metadata() {
    let mut request = base_request();
    request["metadata"] = json!({
        "trace_id": "trace-123",
        "customer_tier": "enterprise"
    });

    let native = map_chat_completion_request(request).unwrap();

    assert_eq!(
        native.metadata.as_value(),
        json!({
            "trace_id": "trace-123",
            "customer_tier": "enterprise"
        })
    );
}

#[test]
fn model_maps_exactly_without_validation() {
    let mut request = base_request();
    request["model"] = json!("unregistered/provider:model.with/slashes");

    let native = map_chat_completion_request(request).unwrap();

    assert_eq!(
        native.model.as_deref(),
        Some("unregistered/provider:model.with/slashes")
    );
}

#[test]
fn tools_map_to_native_compatibility_inputs_and_metadata() {
    let mut request = base_request();
    request["tools"] = json!([
        {
            "type": "function",
            "function": {
                "name": "lookup_order",
                "parameters": {"type": "object"}
            }
        }
    ]);
    request["tool_choice"] = json!({"type": "function", "function": {"name": "lookup_order"}});

    let native = map_chat_completion_request(request).unwrap();

    assert_eq!(
        native.inputs.as_value()["compatibility"]["tools"][0]["function"]["name"],
        json!("lookup_order")
    );
    assert_eq!(
        native.inputs.as_value()["compatibility"]["tool_choice"]["function"]["name"],
        json!("lookup_order")
    );
    assert_eq!(
        native.metadata.as_value()["compatibility"]["tool_choice"]["function"]["name"],
        json!("lookup_order")
    );
}

#[test]
fn tool_messages_map_to_native_history() {
    let mut request = base_request();
    request["messages"] = json!([
        {"role": "user", "content": "Find order"},
        {
            "role": "assistant",
            "content": null,
            "tool_calls": [
                {
                    "id": "call_123",
                    "type": "function",
                    "function": {"name": "lookup_order", "arguments": "{\"order_id\":\"order_123\"}"}
                }
            ]
        },
        {"role": "tool", "tool_call_id": "call_123", "content": "{\"status\":\"shipped\"}"}
    ]);

    let native = map_chat_completion_request(request).unwrap();

    assert_eq!(native.query, "Find order");
    assert_eq!(
        native.history,
        vec![
            json!({
                "role": "assistant",
                "content": "",
                "tool_calls": [
                    {
                        "id": "call_123",
                        "type": "function",
                        "function": {"name": "lookup_order", "arguments": "{\"order_id\":\"order_123\"}"}
                    }
                ]
            }),
            json!({
                "role": "tool",
                "content": "{\"status\":\"shipped\"}",
                "tool_call_id": "call_123"
            })
        ]
    );
}

#[test]
fn legacy_function_call_maps_to_native_compatibility_inputs() {
    let mut request = base_request();
    request["function_call"] = json!({"name": "lookup_order"});

    let native = map_chat_completion_request(request).unwrap();

    assert_eq!(
        native.inputs.as_value()["compatibility"]["function_call"]["name"],
        json!("lookup_order")
    );
}

#[test]
fn audio_output_returns_unsupported_feature() {
    let mut request = base_request();
    request["audio"] = json!({
        "voice": "alloy",
        "format": "mp3"
    });

    assert_unsupported_feature(request, "audio");
}

#[test]
fn multimodal_generation_returns_unsupported_feature() {
    let mut request = base_request();
    request["modalities"] = json!(["text", "audio"]);

    assert_unsupported_feature(request, "modalities");
}

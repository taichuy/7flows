use serde_json::Value;

fn remove_payload_keys(
    output_payload: &mut serde_json::Map<String, Value>,
    payload: Option<&Value>,
) {
    let Some(payload) = payload.and_then(Value::as_object) else {
        return;
    };

    for key in payload.keys() {
        output_payload.remove(key);
    }
}

pub(super) fn persisted_node_output_payload(
    output_payload: &Value,
    metrics_payload: &Value,
    error_payload: Option<&Value>,
    debug_payload: &Value,
) -> Value {
    let Some(output_object) = output_payload.as_object() else {
        return output_payload.clone();
    };
    let mut persisted_output = output_object.clone();

    remove_payload_keys(&mut persisted_output, Some(metrics_payload));
    remove_payload_keys(&mut persisted_output, error_payload);
    remove_payload_keys(&mut persisted_output, Some(debug_payload));

    Value::Object(persisted_output)
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::persisted_node_output_payload;

    #[test]
    fn persisted_output_keeps_success_output_separate_from_metrics_and_debug() {
        let output_payload = json!({
            "text": "正式回答",
            "reasoning_content": "先分析",
            "attempts": [{ "status": "succeeded" }],
            "event_count": 12,
            "provider_events": [{ "type": "text_delta", "delta": "正式回答" }],
        });
        let metrics_payload = json!({
            "attempts": [{ "status": "succeeded" }],
            "event_count": 12,
        });
        let debug_payload = json!({
            "provider_events": [{ "type": "text_delta", "delta": "正式回答" }],
        });

        let persisted =
            persisted_node_output_payload(&output_payload, &metrics_payload, None, &debug_payload);

        assert_eq!(
            persisted,
            json!({
                "text": "正式回答",
                "reasoning_content": "先分析",
            })
        );
    }
}

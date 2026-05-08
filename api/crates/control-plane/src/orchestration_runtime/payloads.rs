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

    if error_payload.is_some() {
        remove_payload_keys(&mut persisted_output, Some(metrics_payload));
    }
    remove_payload_keys(&mut persisted_output, error_payload);
    remove_payload_keys(&mut persisted_output, Some(debug_payload));

    Value::Object(persisted_output)
}

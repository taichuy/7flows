use serde_json::json;
use storage_ephemeral::{EphemeralBackendKind, EphemeralKvStore, MemoryKvStore};
use time::Duration;

#[tokio::test]
async fn memory_kv_store_expires_entries_on_read() {
    let store = MemoryKvStore::new("flowbase:test");
    store
        .set_json(
            "session:1",
            json!({ "ok": true }),
            Some(Duration::seconds(1)),
        )
        .await
        .unwrap();

    tokio::time::sleep(std::time::Duration::from_secs(2)).await;

    assert_eq!(store.get_json("session:1").await.unwrap(), None);
}

#[tokio::test]
async fn memory_kv_store_set_if_absent_only_writes_once() {
    let store = MemoryKvStore::new("flowbase:test");

    assert!(store
        .set_if_absent_json("key", json!({ "value": 1 }), None)
        .await
        .unwrap());
    assert!(!store
        .set_if_absent_json("key", json!({ "value": 2 }), None)
        .await
        .unwrap());
}

#[tokio::test]
async fn memory_kv_store_prefixes_namespace_and_extends_ttl() {
    let store = MemoryKvStore::new("flowbase:test");
    store
        .set_json(
            "session:2",
            json!({ "ok": true }),
            Some(Duration::milliseconds(50)),
        )
        .await
        .unwrap();

    tokio::time::sleep(std::time::Duration::from_millis(20)).await;

    assert!(store
        .touch("session:2", Duration::milliseconds(120))
        .await
        .unwrap());
    assert_eq!(
        store.raw_key_for_test("session:2"),
        "flowbase:test:session:2".to_string()
    );

    tokio::time::sleep(std::time::Duration::from_millis(80)).await;
    assert_eq!(
        store.get_json("session:2").await.unwrap(),
        Some(json!({ "ok": true }))
    );
}

#[test]
fn backend_kind_parses_memory_and_redis() {
    assert_eq!(
        EphemeralBackendKind::from_env_value("memory")
            .unwrap()
            .as_str(),
        "memory"
    );
    assert_eq!(
        EphemeralBackendKind::from_env_value("redis")
            .unwrap()
            .as_str(),
        "redis"
    );
}

#[test]
fn public_exports_match_capability_names() {
    use storage_ephemeral::{EphemeralBackendKind, EphemeralKvStore, MemoryKvStore};

    assert_eq!(EphemeralBackendKind::Memory.as_str(), "memory");
    let _ = std::any::type_name::<MemoryKvStore>();
    let _ = std::any::type_name::<&dyn EphemeralKvStore>();
}

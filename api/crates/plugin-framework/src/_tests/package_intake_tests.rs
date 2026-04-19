use std::{
    fs,
    io::{Cursor, Write},
    path::{Path, PathBuf},
};

use ed25519_dalek::pkcs8::spki::der::pem::LineEnding;
use ed25519_dalek::{pkcs8::EncodePublicKey, Signer, SigningKey};
use flate2::{write::GzEncoder, Compression};
use plugin_framework::{intake_package_bytes, PackageIntakePolicy, TrustedPublicKey};
use serde::Serialize;
use sha2::{Digest, Sha256};
use tar::Builder;
use uuid::Uuid;
use zip::{write::SimpleFileOptions, CompressionMethod, ZipWriter};

#[derive(Clone, Copy)]
enum ArchiveFormat {
    TarGz,
    Zip,
}

struct SignedFixtureInput<'a> {
    plugin_code: &'a str,
    version: &'a str,
    include_signature: bool,
    tamper_signature: bool,
    archive_format: ArchiveFormat,
}

struct SignedPackageFixture {
    package_bytes: Vec<u8>,
    artifact_sha256: String,
    public_key: TrustedPublicKey,
}

#[derive(Serialize)]
struct OfficialReleaseDocument<'a> {
    schema_version: u32,
    plugin_id: String,
    provider_code: &'a str,
    version: &'a str,
    contract_version: &'static str,
    artifact_sha256: &'a str,
    payload_sha256: String,
    signature_algorithm: &'static str,
    signing_key_id: &'static str,
    issued_at: &'static str,
}

struct TempFixtureDir {
    root: PathBuf,
}

impl TempFixtureDir {
    fn new() -> Self {
        let root = std::env::temp_dir().join(format!("plugin-intake-tests-{}", Uuid::now_v7()));
        fs::create_dir_all(&root).unwrap();
        Self { root }
    }

    fn path(&self) -> &Path {
        &self.root
    }

    fn write_bytes(&self, relative_path: &str, content: &[u8]) {
        let path = self.root.join(relative_path);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).unwrap();
        }
        fs::write(path, content).unwrap();
    }

    fn write_str(&self, relative_path: &str, content: &str) {
        self.write_bytes(relative_path, content.as_bytes());
    }
}

impl Drop for TempFixtureDir {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.root);
    }
}

#[tokio::test]
async fn package_intake_verifies_signed_official_archive_and_derives_verified_official() {
    let fixture = create_signed_package_fixture(SignedFixtureInput {
        plugin_code: "openai_compatible",
        version: "0.2.0",
        include_signature: true,
        tamper_signature: false,
        archive_format: ArchiveFormat::TarGz,
    });

    let result = intake_package_bytes(
        &fixture.package_bytes,
        &PackageIntakePolicy {
            source_kind: "official_registry".to_string(),
            trust_mode: "signature_required".to_string(),
            expected_artifact_sha256: Some(fixture.artifact_sha256.clone()),
            trusted_public_keys: vec![fixture.public_key.clone()],
            original_filename: Some("openai_compatible-0.2.0.1flowbasepkg".into()),
        },
    )
    .await
    .unwrap();

    assert_eq!(result.source_kind, "official_registry");
    assert_eq!(result.trust_level, "verified_official");
    assert_eq!(result.signature_status, "verified");
    assert_eq!(result.signature_algorithm.as_deref(), Some("ed25519"));
    assert_eq!(
        result.signing_key_id.as_deref(),
        Some("official-key-2026-04")
    );
}

#[tokio::test]
async fn package_intake_rejects_unsigned_signature_required_mirror_archive() {
    let fixture = create_signed_package_fixture(SignedFixtureInput {
        plugin_code: "openai_compatible",
        version: "0.2.0",
        include_signature: false,
        tamper_signature: false,
        archive_format: ArchiveFormat::TarGz,
    });

    let error = intake_package_bytes(
        &fixture.package_bytes,
        &PackageIntakePolicy {
            source_kind: "mirror_registry".to_string(),
            trust_mode: "signature_required".to_string(),
            expected_artifact_sha256: Some(fixture.artifact_sha256.clone()),
            trusted_public_keys: vec![fixture.public_key.clone()],
            original_filename: Some("openai_compatible-0.2.0.1flowbasepkg".into()),
        },
    )
    .await
    .expect_err("unsigned mirror packages must be rejected");

    assert!(error
        .to_string()
        .contains("requires a valid official signature"));
}

#[tokio::test]
async fn package_intake_marks_uploaded_unsigned_archive_as_unverified() {
    let fixture = create_signed_package_fixture(SignedFixtureInput {
        plugin_code: "fixture_provider",
        version: "0.1.0",
        include_signature: false,
        tamper_signature: false,
        archive_format: ArchiveFormat::Zip,
    });

    let result = intake_package_bytes(
        &fixture.package_bytes,
        &PackageIntakePolicy {
            source_kind: "uploaded".to_string(),
            trust_mode: "allow_unsigned".to_string(),
            expected_artifact_sha256: None,
            trusted_public_keys: vec![fixture.public_key.clone()],
            original_filename: Some("fixture_provider-0.1.0.zip".into()),
        },
    )
    .await
    .unwrap();

    assert_eq!(result.source_kind, "uploaded");
    assert_eq!(result.trust_level, "unverified");
    assert_eq!(result.signature_status, "unsigned");
}

fn create_signed_package_fixture(input: SignedFixtureInput<'_>) -> SignedPackageFixture {
    let fixture_dir = TempFixtureDir::new();
    write_provider_fixture(&fixture_dir, input.plugin_code, input.version);

    let payload_sha256 = payload_sha256(fixture_dir.path());
    let signing_key = SigningKey::from_bytes(&[7u8; 32]);
    let public_key = TrustedPublicKey {
        key_id: "official-key-2026-04".to_string(),
        algorithm: "ed25519".to_string(),
        public_key_pem: signing_key
            .verifying_key()
            .to_public_key_pem(LineEnding::LF)
            .unwrap(),
    };

    if input.include_signature {
        let release = OfficialReleaseDocument {
            schema_version: 1,
            plugin_id: format!("1flowbase.{}", input.plugin_code),
            provider_code: input.plugin_code,
            version: input.version,
            contract_version: "1flowbase.provider/v1",
            artifact_sha256: "sha256:fixture-artifact",
            payload_sha256,
            signature_algorithm: "ed25519",
            signing_key_id: "official-key-2026-04",
            issued_at: "2026-04-19T13:00:00Z",
        };
        let release_bytes = serde_json::to_vec(&release).unwrap();
        let mut signature = signing_key.sign(&release_bytes).to_bytes().to_vec();
        if input.tamper_signature {
            signature[0] ^= 0xFF;
        }
        fixture_dir.write_bytes("_meta/official-release.json", &release_bytes);
        fixture_dir.write_bytes("_meta/official-release.sig", &signature);
    }

    let package_bytes = match input.archive_format {
        ArchiveFormat::TarGz => pack_tar_gz(fixture_dir.path()),
        ArchiveFormat::Zip => pack_zip(fixture_dir.path()),
    };

    SignedPackageFixture {
        artifact_sha256: format!("sha256:{:x}", Sha256::digest(&package_bytes)),
        package_bytes,
        public_key,
    }
}

fn write_provider_fixture(dir: &TempFixtureDir, plugin_code: &str, version: &str) {
    dir.write_str(
        "manifest.yaml",
        &format!(
            r#"schema_version: 2
plugin_type: model_provider
plugin_code: {plugin_code}
version: {version}
contract_version: 1flowbase.provider/v1
metadata:
  author: taichuy
provider:
  definition: provider/{plugin_code}.yaml
runtime:
  kind: executable
  protocol: stdio-json
  executable:
    path: bin/{plugin_code}-provider
limits:
  memory_bytes: 268435456
  invoke_timeout_ms: 30000
capabilities:
  model_types:
    - llm
compat:
  minimum_host_version: 0.1.0
"#
        ),
    );
    dir.write_str(
        &format!("provider/{plugin_code}.yaml"),
        &format!(
            r#"provider_code: {plugin_code}
display_name: {plugin_code}
protocol: openai_compatible
model_discovery: hybrid
config_schema:
  - key: api_key
    type: secret
    required: true
"#
        ),
    );
    dir.write_str(
        &format!("bin/{plugin_code}-provider"),
        "#!/usr/bin/env bash\nexit 0\n",
    );
    dir.write_str(
        "models/llm/_position.yaml",
        &format!("items:\n  - {plugin_code}_chat\n"),
    );
    dir.write_str(
        &format!("models/llm/{plugin_code}_chat.yaml"),
        &format!(
            r#"model: {plugin_code}_chat
label: {plugin_code} chat
family: llm
capabilities:
  - stream
"#
        ),
    );
    dir.write_str(
        "i18n/en_US.json",
        &format!(r#"{{ "plugin": {{ "label": "{plugin_code}" }} }}"#),
    );
}

fn payload_sha256(root: &Path) -> String {
    fn walk(root: &Path, current: &Path, entries: &mut Vec<(String, Vec<u8>)>) {
        let mut children = fs::read_dir(current)
            .unwrap()
            .map(|entry| entry.unwrap())
            .collect::<Vec<_>>();
        children.sort_by_key(|entry| entry.path());
        for entry in children {
            let path = entry.path();
            let relative = path
                .strip_prefix(root)
                .unwrap()
                .to_string_lossy()
                .replace('\\', "/");
            if relative.starts_with("_meta/") {
                continue;
            }
            if path.is_dir() {
                walk(root, &path, entries);
                continue;
            }
            entries.push((relative, fs::read(&path).unwrap()));
        }
    }

    let mut entries = Vec::new();
    walk(root, root, &mut entries);
    let mut hasher = Sha256::new();
    for (relative, content) in entries {
        hasher.update(relative.as_bytes());
        hasher.update([0]);
        hasher.update(content);
        hasher.update([0]);
    }
    format!("sha256:{:x}", hasher.finalize())
}

fn pack_tar_gz(root: &Path) -> Vec<u8> {
    let encoder = GzEncoder::new(Vec::new(), Compression::default());
    let mut builder = Builder::new(encoder);
    append_dir_to_tar(&mut builder, root, root);
    builder.finish().unwrap();
    builder.into_inner().unwrap().finish().unwrap()
}

fn append_dir_to_tar(builder: &mut Builder<GzEncoder<Vec<u8>>>, root: &Path, current: &Path) {
    let mut children = fs::read_dir(current)
        .unwrap()
        .map(|entry| entry.unwrap())
        .collect::<Vec<_>>();
    children.sort_by_key(|entry| entry.path());
    for entry in children {
        let path = entry.path();
        let relative = path.strip_prefix(root).unwrap();
        if path.is_dir() {
            builder.append_dir(relative, &path).unwrap();
            append_dir_to_tar(builder, root, &path);
            continue;
        }
        builder.append_path_with_name(&path, relative).unwrap();
    }
}

fn pack_zip(root: &Path) -> Vec<u8> {
    let cursor = Cursor::new(Vec::new());
    let mut writer = ZipWriter::new(cursor);
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
    append_dir_to_zip(&mut writer, root, root, options);
    writer.finish().unwrap().into_inner()
}

fn append_dir_to_zip(
    writer: &mut ZipWriter<Cursor<Vec<u8>>>,
    root: &Path,
    current: &Path,
    options: SimpleFileOptions,
) {
    let mut children = fs::read_dir(current)
        .unwrap()
        .map(|entry| entry.unwrap())
        .collect::<Vec<_>>();
    children.sort_by_key(|entry| entry.path());
    for entry in children {
        let path = entry.path();
        let relative = path
            .strip_prefix(root)
            .unwrap()
            .to_string_lossy()
            .replace('\\', "/");
        if path.is_dir() {
            writer
                .add_directory(format!("{relative}/"), options)
                .unwrap();
            append_dir_to_zip(writer, root, &path, options);
            continue;
        }
        writer.start_file(relative, options).unwrap();
        writer.write_all(&fs::read(&path).unwrap()).unwrap();
    }
}

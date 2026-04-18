use std::{
    fs,
    path::{Path, PathBuf},
};

use plugin_framework::{
    error::{FrameworkResult, PluginFrameworkError},
    provider_package::ProviderPackage,
};

#[derive(Debug, Clone)]
pub struct LoadedProviderPackage {
    pub package_root: PathBuf,
    pub runtime_entrypoint: PathBuf,
    pub package: ProviderPackage,
}

pub struct PackageLoader;

impl PackageLoader {
    pub fn load(package_root: impl AsRef<Path>) -> FrameworkResult<LoadedProviderPackage> {
        let package_root = fs::canonicalize(package_root.as_ref()).map_err(|error| {
            PluginFrameworkError::invalid_provider_package(format!(
                "cannot resolve package root: {error}"
            ))
        })?;

        if Self::looks_like_source_tree(&package_root) {
            return Err(PluginFrameworkError::invalid_provider_package(
                "provider package root looks like a source tree; load an installed or unpacked artifact instead",
            ));
        }

        let package = ProviderPackage::load_from_dir(&package_root)?;
        let runtime_entrypoint = package_root.join(&package.manifest.runner.entrypoint);
        if !runtime_entrypoint.is_file() {
            return Err(PluginFrameworkError::invalid_provider_package(format!(
                "provider runtime entrypoint does not exist: {}",
                runtime_entrypoint.display()
            )));
        }

        Ok(LoadedProviderPackage {
            package_root,
            runtime_entrypoint,
            package,
        })
    }

    fn looks_like_source_tree(package_root: &Path) -> bool {
        package_root.join("demo").exists() || package_root.join("scripts").exists()
    }
}

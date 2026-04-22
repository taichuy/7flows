use super::*;

pub(super) fn remove_path_if_exists(path: &Path) -> Result<()> {
    if !path.exists() {
        return Ok(());
    }

    let metadata = fs::metadata(path)?;
    if metadata.is_dir() {
        fs::remove_dir_all(path)?;
    } else {
        fs::remove_file(path)?;
    }

    Ok(())
}

pub(super) fn copy_installation_artifact(source_root: &Path, target_root: &Path) -> Result<()> {
    if target_root.exists() {
        fs::remove_dir_all(target_root).with_context(|| {
            format!(
                "failed to remove previous installation artifact at {}",
                target_root.display()
            )
        })?;
    }
    fs::create_dir_all(target_root).with_context(|| {
        format!(
            "failed to create installation artifact root {}",
            target_root.display()
        )
    })?;
    copy_dir(source_root, target_root)
}

fn copy_dir(source_root: &Path, target_root: &Path) -> Result<()> {
    for entry in fs::read_dir(source_root)
        .with_context(|| format!("failed to read {}", source_root.display()))?
    {
        let entry = entry?;
        let source_path = entry.path();
        let target_path = target_root.join(entry.file_name());
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if source_path.is_dir() {
            if matches!(name.as_ref(), "demo" | "scripts") {
                continue;
            }
            fs::create_dir_all(&target_path)
                .with_context(|| format!("failed to create {}", target_path.display()))?;
            copy_dir(&source_path, &target_path)?;
            continue;
        }

        fs::copy(&source_path, &target_path).with_context(|| {
            format!(
                "failed to copy installation artifact {} -> {}",
                source_path.display(),
                target_path.display()
            )
        })?;
    }
    Ok(())
}

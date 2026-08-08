use std::path::PathBuf;

pub fn zdotdir() -> Result<PathBuf, String> {
    let dir = std::env::temp_dir().join("gitspy-term-zdotdir");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    std::fs::write(
        dir.join(".zshrc"),
        include_str!("../resources/gitspy.zshrc"),
    )
    .map_err(|e| e.to_string())?;
    Ok(dir)
}

use ignore::gitignore::{Gitignore, GitignoreBuilder};
use std::path::{Path, PathBuf};

pub struct Ignores {
    root: PathBuf,
    rules: Gitignore,
}

impl Ignores {
    pub fn at(root: &Path) -> Self {
        let mut builder = GitignoreBuilder::new(root);
        for source in [
            root.join(".gitignore"),
            root.join(".git").join("info").join("exclude"),
        ] {
            let _ = builder.add(source);
        }

        Self {
            root: root.to_path_buf(),
            rules: builder.build().unwrap_or_else(|_| Gitignore::empty()),
        }
    }

    pub fn hides(&self, path: &Path) -> bool {
        let Ok(relative) = path.strip_prefix(&self.root) else {
            return true;
        };
        if relative.components().any(|part| part.as_os_str() == ".git") {
            return true;
        }

        let mut walked = self.root.clone();
        for part in relative.components() {
            walked.push(part);
            let directory = walked.is_dir();
            if self.rules.matched(&walked, directory).is_ignore() {
                return true;
            }
        }
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn repo(gitignore: &str) -> TempDir {
        let dir = TempDir::new().expect("временный каталог");
        std::fs::create_dir_all(dir.path().join(".git")).expect("каталог");
        std::fs::write(dir.path().join(".gitignore"), gitignore).expect("файл");
        dir
    }

    #[test]
    fn a_built_bundle_does_not_wake_the_application() {
        let dir = repo("target/\nnode_modules/\ndist\n");
        std::fs::create_dir_all(dir.path().join("target/debug")).expect("каталог");
        let ignores = Ignores::at(dir.path());

        assert!(
            ignores.hides(&dir.path().join("target/debug/gitspy-app")),
            "сборка писала бы события тысячами"
        );
        assert!(ignores.hides(&dir.path().join("dist/index.js")));
        assert!(!ignores.hides(&dir.path().join("src/main.rs")));
    }

    #[test]
    fn the_git_directory_is_someone_elses_business() {
        let dir = repo("");
        assert!(
            Ignores::at(dir.path()).hides(&dir.path().join(".git/index")),
            "за .git следит отдельный наблюдатель, иначе одно изменение придёт дважды"
        );
    }

    #[test]
    fn a_path_from_another_repository_is_not_ours_to_report() {
        let dir = repo("");
        assert!(Ignores::at(dir.path()).hides(Path::new("/tmp/чужое/file.txt")));
    }

    #[test]
    fn rules_come_from_the_repository_rather_than_from_a_list_in_the_code() {
        let dir = repo("секрет.txt\n");
        let ignores = Ignores::at(dir.path());
        assert!(ignores.hides(&dir.path().join("секрет.txt")));
        assert!(!ignores.hides(&dir.path().join("target/debug/app")));
    }
}

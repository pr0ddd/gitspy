use crate::Error;
use std::path::{Path, PathBuf};

pub trait Secrets: Send + Sync {
    fn read(&self, key: &str) -> Result<Option<String>, Error>;
    fn write(&self, key: &str, value: &str) -> Result<(), Error>;
    fn forget(&self, key: &str) -> Result<(), Error>;
}

pub struct Files {
    dir: PathBuf,
}

impl Files {
    pub fn at(dir: &Path) -> Self {
        Self {
            dir: dir.to_path_buf(),
        }
    }

    fn file(&self, key: &str) -> Result<PathBuf, Error> {
        if key.is_empty() || !key.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
            return Err(Error::Storage {
                detail: format!("bad key {key}"),
            });
        }
        Ok(self.dir.join(format!("{key}.token")))
    }

    fn only_for_the_owner(file: &Path) -> Result<(), Error> {
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(file, std::fs::Permissions::from_mode(0o600)).map_err(
                |e| Error::Storage {
                    detail: e.to_string(),
                },
            )?;
        }
        #[cfg(not(unix))]
        let _ = file;
        Ok(())
    }
}

impl Secrets for Files {
    fn read(&self, key: &str) -> Result<Option<String>, Error> {
        match std::fs::read_to_string(self.file(key)?) {
            Ok(text) => Ok(Some(text.trim().to_string()).filter(|t| !t.is_empty())),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(e) => Err(Error::Storage {
                detail: e.to_string(),
            }),
        }
    }

    fn write(&self, key: &str, value: &str) -> Result<(), Error> {
        let file = self.file(key)?;
        std::fs::create_dir_all(&self.dir).map_err(|e| Error::Storage {
            detail: e.to_string(),
        })?;
        std::fs::write(&file, value).map_err(|e| Error::Storage {
            detail: e.to_string(),
        })?;
        Self::only_for_the_owner(&file)
    }

    fn forget(&self, key: &str) -> Result<(), Error> {
        match std::fs::remove_file(self.file(key)?) {
            Ok(()) => Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(e) => Err(Error::Storage {
                detail: e.to_string(),
            }),
        }
    }
}

#[derive(Default)]
pub struct InMemory {
    values: std::sync::Mutex<std::collections::HashMap<String, String>>,
}

impl Secrets for InMemory {
    fn read(&self, key: &str) -> Result<Option<String>, Error> {
        Ok(self
            .values
            .lock()
            .expect("хранилище не отравлено")
            .get(key)
            .cloned())
    }

    fn write(&self, key: &str, value: &str) -> Result<(), Error> {
        self.values
            .lock()
            .expect("хранилище не отравлено")
            .insert(key.to_string(), value.to_string());
        Ok(())
    }

    fn forget(&self, key: &str) -> Result<(), Error> {
        self.values
            .lock()
            .expect("хранилище не отравлено")
            .remove(key);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_secret_that_was_never_written_reads_as_absent_not_as_an_error() {
        let store = InMemory::default();
        assert_eq!(store.read("github").expect("чтение"), None);
    }

    #[test]
    fn a_written_secret_comes_back() {
        let store = InMemory::default();
        store.write("github", "ghp_x").expect("запись");
        assert_eq!(
            store.read("github").expect("чтение").as_deref(),
            Some("ghp_x")
        );
    }

    #[test]
    fn forgetting_twice_is_not_an_error() {
        let store = InMemory::default();
        store.write("github", "ghp_x").expect("запись");
        store.forget("github").expect("первое забывание");
        store.forget("github").expect("второе тоже проходит");
        assert_eq!(store.read("github").expect("чтение"), None);
    }

    #[test]
    fn a_token_on_disk_survives_a_restart_but_stays_readable_only_by_its_owner() {
        let dir = tempfile::TempDir::new().expect("временный каталог");
        let store = Files::at(dir.path());

        store.write("github", "gho_x").expect("запись");
        assert_eq!(
            Files::at(dir.path())
                .read("github")
                .expect("чтение")
                .as_deref(),
            Some("gho_x"),
            "новый экземпляр читает то же, что записал прежний"
        );

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = std::fs::metadata(dir.path().join("github.token"))
                .expect("файл на месте")
                .permissions()
                .mode();
            assert_eq!(mode & 0o777, 0o600, "токен не виден остальным на машине");
        }
    }

    #[test]
    fn a_key_that_could_climb_out_of_the_folder_is_refused() {
        let dir = tempfile::TempDir::new().expect("временный каталог");
        let store = Files::at(dir.path());
        assert!(store.write("../../passwd", "x").is_err());
        assert!(store.read("..").is_err());
    }

    #[test]
    fn a_forgotten_token_leaves_no_file_behind() {
        let dir = tempfile::TempDir::new().expect("временный каталог");
        let store = Files::at(dir.path());

        store.write("github", "gho_x").expect("запись");
        store.forget("github").expect("забывание");
        assert_eq!(store.read("github").expect("чтение"), None);
        assert!(!dir.path().join("github.token").exists());
    }

    #[test]
    fn hosts_do_not_share_a_slot() {
        let store = InMemory::default();
        store.write("github", "one").expect("запись");
        store.write("gitlab", "two").expect("запись");
        store.forget("github").expect("забывание");
        assert_eq!(
            store.read("gitlab").expect("чтение").as_deref(),
            Some("two")
        );
    }
}

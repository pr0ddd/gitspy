use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use gitspy_acp::{Attachment, PromptAbilities};
use std::path::Path;

const LARGEST_INLINED_ATTACHMENT: u64 = 5 * 1024 * 1024;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Facts<'a> {
    pub directory: bool,
    pub mime: Option<&'a str>,
    pub size: u64,
    pub utf8: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Form<'a> {
    Image { mime: &'a str },
    Embedded { mime: Option<&'a str> },
    Link,
}

fn an_image_by_extension(mime: Option<&str>) -> Option<&str> {
    mime.filter(|kind| kind.starts_with("image/"))
}

pub fn form_of(facts: Facts<'_>, can: PromptAbilities) -> Form<'_> {
    if facts.directory || facts.size > LARGEST_INLINED_ATTACHMENT {
        return Form::Link;
    }
    if let Some(mime) = an_image_by_extension(facts.mime) {
        return if can.image {
            Form::Image { mime }
        } else {
            Form::Link
        };
    }
    if facts.utf8 && can.embedded_context {
        return Form::Embedded { mime: facts.mime };
    }
    Form::Link
}

fn mime_by_extension(path: &Path) -> Option<&'static str> {
    let extension = path.extension()?.to_str()?.to_ascii_lowercase();
    match extension.as_str() {
        "png" => Some("image/png"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "gif" => Some("image/gif"),
        "webp" => Some("image/webp"),
        "bmp" => Some("image/bmp"),
        "md" => Some("text/markdown"),
        "txt" => Some("text/plain"),
        "json" => Some("application/json"),
        _ => None,
    }
}

fn file_uri(path: &Path) -> String {
    format!("file://{}", path.display())
}

fn name_of(path: &Path) -> String {
    path.file_name()
        .unwrap_or(path.as_os_str())
        .to_string_lossy()
        .into_owned()
}

fn beside_path(path: &Path, failure: std::io::Error) -> String {
    format!("{}: {failure}", path.display())
}

fn read_unless_too_big_to_inline(
    path: &Path,
    directory: bool,
    size: u64,
) -> Result<Vec<u8>, String> {
    if directory || size > LARGEST_INLINED_ATTACHMENT {
        return Ok(Vec::new());
    }
    std::fs::read(path).map_err(|failure| beside_path(path, failure))
}

fn size_only_of_a_file(directory: bool, size: u64) -> Option<u64> {
    if directory {
        None
    } else {
        Some(size)
    }
}

pub fn attachment_of(path: &Path, can: PromptAbilities) -> Result<Attachment, String> {
    let seen = std::fs::metadata(path).map_err(|failure| beside_path(path, failure))?;
    let directory = seen.is_dir();
    let size = seen.len();
    let bytes = read_unless_too_big_to_inline(path, directory, size)?;
    let mime = mime_by_extension(path);
    let facts = Facts {
        directory,
        mime,
        size,
        utf8: std::str::from_utf8(&bytes).is_ok(),
    };
    Ok(match form_of(facts, can) {
        Form::Image { mime } => Attachment::Image {
            mime: mime.to_owned(),
            base64: STANDARD.encode(&bytes),
        },
        Form::Embedded { mime } => Attachment::Embedded {
            uri: file_uri(path),
            text: String::from_utf8_lossy(&bytes).into_owned(),
            mime: mime.map(str::to_owned),
        },
        Form::Link => Attachment::Link {
            uri: file_uri(path),
            name: name_of(path),
            mime: mime.map(str::to_owned),
            size: size_only_of_a_file(directory, size),
        },
    })
}

pub fn attachments_of(paths: &[String], can: PromptAbilities) -> Result<Vec<Attachment>, String> {
    paths
        .iter()
        .map(|path| attachment_of(Path::new(path), can))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    const EVERYTHING: PromptAbilities = PromptAbilities {
        image: true,
        embedded_context: true,
    };
    const NOTHING: PromptAbilities = PromptAbilities {
        image: false,
        embedded_context: false,
    };
    const PNG_HEAD: &[u8] = b"\x89PNG\r\n\x1a\n";
    const PNG_HEAD_IN_BASE64: &str = "iVBORw0KGgo=";

    fn file_with(dir: &Path, name: &str, bytes: &[u8]) -> std::path::PathBuf {
        let path = dir.join(name);
        std::fs::write(&path, bytes).expect("фикстура пишется");
        path
    }

    #[test]
    fn a_directory_goes_as_a_link_because_a_prompt_block_cannot_hold_a_tree() {
        let dir = tempfile::tempdir().expect("временный каталог");
        let inside = dir.path().join("src");
        std::fs::create_dir(&inside).expect("каталог создаётся");
        assert_eq!(
            attachment_of(&inside, EVERYTHING).expect("каталог прикладывается"),
            Attachment::Link {
                uri: format!("file://{}", inside.display()),
                name: "src".to_string(),
                mime: None,
                size: None,
            },
            "каталог уходит ссылкой: агент откроет его сам, а размер каталога ничего не значит"
        );
    }

    #[test]
    fn a_png_goes_as_an_image_block_when_the_agent_declared_images() {
        let dir = tempfile::tempdir().expect("временный каталог");
        let shot = file_with(dir.path(), "shot.png", PNG_HEAD);
        assert_eq!(
            attachment_of(&shot, EVERYTHING).expect("картинка прикладывается"),
            Attachment::Image {
                mime: "image/png".to_string(),
                base64: PNG_HEAD_IN_BASE64.to_string(),
            },
            "картинку агент видит только блоком image с base64: ссылкой на файл он её не прочтёт"
        );
    }

    #[test]
    fn a_png_falls_back_to_a_link_when_the_agent_did_not_declare_images() {
        let dir = tempfile::tempdir().expect("временный каталог");
        let shot = file_with(dir.path(), "shot.png", PNG_HEAD);
        assert_eq!(
            attachment_of(&shot, NOTHING).expect("картинка прикладывается"),
            Attachment::Link {
                uri: format!("file://{}", shot.display()),
                name: "shot.png".to_string(),
                mime: Some("image/png".to_string()),
                size: Some(PNG_HEAD.len() as u64),
            },
            "необъявленный блок агент отвергнет ошибкой протокола — остаётся ссылка, обязательная для всех"
        );
    }

    #[test]
    fn a_text_file_goes_embedded_when_the_agent_takes_embedded_context() {
        let dir = tempfile::tempdir().expect("временный каталог");
        let note = file_with(dir.path(), "note.md", "# заголовок\nстрока\n".as_bytes());
        assert_eq!(
            attachment_of(&note, EVERYTHING).expect("текст прикладывается"),
            Attachment::Embedded {
                uri: format!("file://{}", note.display()),
                text: "# заголовок\nстрока\n".to_string(),
                mime: Some("text/markdown".to_string()),
            },
            "содержимое едет в промпте: так агент отвечает по файлу, не тратя ход на чтение"
        );
    }

    #[test]
    fn a_text_file_falls_back_to_a_link_without_embedded_context() {
        let dir = tempfile::tempdir().expect("временный каталог");
        let note = file_with(dir.path(), "note.txt", "строка".as_bytes());
        assert_eq!(
            attachment_of(&note, NOTHING).expect("текст прикладывается"),
            Attachment::Link {
                uri: format!("file://{}", note.display()),
                name: "note.txt".to_string(),
                mime: Some("text/plain".to_string()),
                size: Some("строка".len() as u64),
            },
            "без embeddedContext содержимое отправлять некуда — агент прочтёт файл сам по ссылке"
        );
    }

    #[test]
    fn a_file_over_the_limit_goes_as_a_link_however_capable_the_agent_is() {
        let dir = tempfile::tempdir().expect("временный каталог");
        let heavy = file_with(dir.path(), "heavy.txt", &vec![b'a'; 6 * 1024 * 1024]);
        assert_eq!(
            attachment_of(&heavy, EVERYTHING).expect("большой файл прикладывается"),
            Attachment::Link {
                uri: format!("file://{}", heavy.display()),
                name: "heavy.txt".to_string(),
                mime: Some("text/plain".to_string()),
                size: Some(6 * 1024 * 1024),
            },
            "шесть мегабайт в промпте — это окно контекста целиком и минуты ожидания"
        );
    }

    #[test]
    fn a_binary_file_that_is_not_an_image_goes_as_a_link() {
        let dir = tempfile::tempdir().expect("временный каталог");
        let blob = file_with(dir.path(), "app.bin", &[0x00, 0xff, 0xfe, 0x01]);
        assert_eq!(
            attachment_of(&blob, EVERYTHING).expect("двоичный файл прикладывается"),
            Attachment::Link {
                uri: format!("file://{}", blob.display()),
                name: "app.bin".to_string(),
                mime: None,
                size: Some(4),
            },
            "в блок resource кладут текст, и не-UTF-8 в нём порвёт разбор у агента"
        );
    }

    #[test]
    fn the_form_is_chosen_by_facts_and_declared_abilities_alone() {
        let png = Facts {
            directory: false,
            mime: Some("image/png"),
            size: 8,
            utf8: false,
        };
        assert_eq!(
            form_of(png, EVERYTHING),
            Form::Image { mime: "image/png" },
            "правило выбора формы — чистая функция: те же факты дают ту же форму без диска"
        );
        assert_eq!(
            form_of(png, NOTHING),
            Form::Link,
            "необъявленная возможность вычёркивает форму, что бы ни лежало на диске"
        );
        let text = Facts {
            directory: false,
            mime: None,
            size: LARGEST_INLINED_ATTACHMENT,
            utf8: true,
        };
        assert_eq!(
            form_of(text, EVERYTHING),
            Form::Embedded { mime: None },
            "ровно пять мегабайт — ещё не перебор, и неизвестное расширение не мешает вложить текст"
        );
        assert_eq!(
            form_of(
                Facts {
                    size: LARGEST_INLINED_ATTACHMENT + 1,
                    ..text
                },
                EVERYTHING
            ),
            Form::Link,
            "граница лимита проходит по строгому больше, иначе тест на шесть мегабайт ловил бы её случайно"
        );
    }
}

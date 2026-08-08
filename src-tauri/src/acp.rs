use crate::acp_attach::attachments_of;
use crate::acp_terminal::BorderTerminals;
use crate::state::on_reader;
use crate::views::{state_lock_failed, ErrorView};
use gitspy_acp::{
    AcpClient, AgentEvent, CommandInfo, ConfigOption, FsBridge, PermissionOption, PlanEntry,
    PromptAbilities, RateLimit,
};
use gitspy_exec::checkpoint::{checkpoint_create, checkpoint_pin, checkpoint_restore};
use serde::Serialize;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};
use tauri::ipc::Channel;
use ts_rs::TS;

#[derive(Serialize, Clone, TS)]
#[ts(export, export_to = "../../src/generated/")]
pub struct AcpOptionView {
    pub id: String,
    pub label: String,
}

#[derive(Serialize, Clone, TS)]
#[ts(export, export_to = "../../src/generated/")]
#[serde(rename_all = "camelCase")]
pub struct AcpConfigChoiceView {
    pub value: String,
    pub name: String,
}

#[derive(Serialize, Clone, TS)]
#[ts(export, export_to = "../../src/generated/")]
#[serde(rename_all = "camelCase")]
pub struct AcpConfigOptionView {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub category: String,
    pub current_value: String,
    pub choices: Vec<AcpConfigChoiceView>,
}

#[derive(Serialize, Clone, TS)]
#[ts(export, export_to = "../../src/generated/")]
#[serde(rename_all = "camelCase")]
pub struct AcpPlanEntryView {
    pub content: String,
    pub status: String,
}

#[derive(Serialize, Clone, TS)]
#[ts(export, export_to = "../../src/generated/")]
#[serde(rename_all = "camelCase")]
pub struct AcpRateLimitView {
    pub kind: String,
    #[ts(type = "number | null")]
    pub resets_at: Option<i64>,
    pub used_share: Option<f64>,
    pub status: String,
}

#[derive(Serialize, Clone, TS)]
#[ts(export, export_to = "../../src/generated/")]
#[serde(rename_all = "camelCase")]
pub struct AcpCommandView {
    pub name: String,
    pub description: String,
    pub hint: Option<String>,
}

#[derive(Serialize, Clone, TS)]
#[ts(export, export_to = "../../src/generated/")]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum AcpEventView {
    Abilities {
        image: bool,
        embedded_context: bool,
    },
    MessageChunk {
        text: String,
    },
    Thought {
        text: String,
    },
    ToolCall {
        id: String,
        title: String,
        status: String,
        terminal_id: Option<String>,
        parent_id: Option<String>,
        subagent: bool,
    },
    ToolCallUpdate {
        id: String,
        status: String,
        terminal_id: Option<String>,
    },
    TerminalOutput {
        terminal_id: String,
        #[ts(type = "number[]")]
        bytes: Vec<u8>,
    },
    TerminalExit {
        terminal_id: String,
        code: Option<i32>,
        signal: Option<String>,
    },
    Plan {
        entries: Vec<AcpPlanEntryView>,
    },
    Config {
        options: Vec<AcpConfigOptionView>,
    },
    ConfigValue {
        config_id: String,
        value: String,
    },
    Commands {
        commands: Vec<AcpCommandView>,
    },
    Usage {
        #[ts(type = "number")]
        used: u64,
        #[ts(type = "number")]
        size: u64,
        cost: Option<f64>,
        currency: Option<String>,
        limits: Vec<AcpRateLimitView>,
    },
    Permission {
        #[ts(type = "number")]
        request_id: u64,
        title: String,
        options: Vec<AcpOptionView>,
    },
    Checkpoint {
        oid: Option<String>,
        path: String,
    },
    TurnEnded {
        stop_reason: String,
    },
    Fatal {
        detail: String,
    },
}

fn option_views(options: Vec<PermissionOption>) -> Vec<AcpOptionView> {
    options
        .into_iter()
        .map(|option| AcpOptionView {
            id: option.id,
            label: option.label,
        })
        .collect()
}

fn config_views(options: Vec<ConfigOption>) -> Vec<AcpConfigOptionView> {
    options
        .into_iter()
        .map(|option| AcpConfigOptionView {
            id: option.id,
            name: option.name,
            description: option.description,
            category: option.category,
            current_value: option.current_value,
            choices: option
                .choices
                .into_iter()
                .map(|choice| AcpConfigChoiceView {
                    value: choice.value,
                    name: choice.name,
                })
                .collect(),
        })
        .collect()
}

fn plan_views(entries: Vec<PlanEntry>) -> Vec<AcpPlanEntryView> {
    entries
        .into_iter()
        .map(|entry| AcpPlanEntryView {
            content: entry.content,
            status: entry.status,
        })
        .collect()
}

fn rate_limit_views(limits: Vec<RateLimit>) -> Vec<AcpRateLimitView> {
    limits
        .into_iter()
        .map(|limit| AcpRateLimitView {
            kind: limit.kind,
            resets_at: limit.resets_at,
            used_share: limit.used_share,
            status: limit.status,
        })
        .collect()
}

fn command_views(commands: Vec<CommandInfo>) -> Vec<AcpCommandView> {
    commands
        .into_iter()
        .map(|command| AcpCommandView {
            name: command.name,
            description: command.description,
            hint: command.hint,
        })
        .collect()
}

fn abilities_view(can: PromptAbilities) -> AcpEventView {
    AcpEventView::Abilities {
        image: can.image,
        embedded_context: can.embedded_context,
    }
}

fn view_of(event: AgentEvent) -> AcpEventView {
    match event {
        AgentEvent::MessageChunk { text } => AcpEventView::MessageChunk { text },
        AgentEvent::Thought { text } => AcpEventView::Thought { text },
        AgentEvent::ToolCall {
            id,
            title,
            status,
            terminal_id,
            parent_id,
            subagent,
        } => AcpEventView::ToolCall {
            id,
            title,
            status,
            terminal_id,
            parent_id,
            subagent,
        },
        AgentEvent::ToolCallUpdate {
            id,
            status,
            terminal_id,
        } => AcpEventView::ToolCallUpdate {
            id,
            status,
            terminal_id,
        },
        AgentEvent::TerminalOutput { terminal_id, bytes } => {
            AcpEventView::TerminalOutput { terminal_id, bytes }
        }
        AgentEvent::TerminalExit {
            terminal_id,
            code,
            signal,
        } => AcpEventView::TerminalExit {
            terminal_id,
            code,
            signal,
        },
        AgentEvent::Plan { entries } => AcpEventView::Plan {
            entries: plan_views(entries),
        },
        AgentEvent::Config { options } => AcpEventView::Config {
            options: config_views(options),
        },
        AgentEvent::ConfigValue { config_id, value } => {
            AcpEventView::ConfigValue { config_id, value }
        }
        AgentEvent::Commands { commands } => AcpEventView::Commands {
            commands: command_views(commands),
        },
        AgentEvent::Usage {
            used,
            size,
            cost,
            currency,
            limits,
        } => AcpEventView::Usage {
            used,
            size,
            cost,
            currency,
            limits: rate_limit_views(limits),
        },
        AgentEvent::PermissionRequest {
            request_id,
            title,
            options,
        } => AcpEventView::Permission {
            request_id,
            title,
            options: option_views(options),
        },
        AgentEvent::TurnEnded { stop_reason } => AcpEventView::TurnEnded { stop_reason },
        AgentEvent::Fatal { detail } => AcpEventView::Fatal { detail },
    }
}

pub trait EventSink: Send + Sync {
    fn emit(&self, event: AcpEventView);
}

impl EventSink for Channel<AcpEventView> {
    fn emit(&self, event: AcpEventView) {
        let _ = self.send(event);
    }
}

fn lock_through_poison<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

struct Turns {
    number: u32,
    checkpoint_taken: bool,
    checkpoint_oid: Option<String>,
}

impl Turns {
    fn new() -> Turns {
        Turns {
            number: 0,
            checkpoint_taken: false,
            checkpoint_oid: None,
        }
    }

    fn begin(&mut self) {
        self.number += 1;
        self.checkpoint_taken = false;
        self.checkpoint_oid = None;
    }

    fn remember_checkpoint(&mut self, oid: Option<String>) {
        self.checkpoint_taken = true;
        self.checkpoint_oid = oid;
    }
}

fn path_inside_repository(repo: &Path, path: &str) -> Result<PathBuf, String> {
    let root = repo.canonicalize().map_err(|e| e.to_string())?;
    let asked = Path::new(path);
    let joined = if asked.is_absolute() {
        asked.to_path_buf()
    } else {
        root.join(asked)
    };
    let folder = joined
        .parent()
        .ok_or_else(|| format!("path without a parent: {path}"))?;
    let name = joined
        .file_name()
        .ok_or_else(|| format!("path without a file name: {path}"))?;
    let settled = folder
        .canonicalize()
        .map_err(|e| format!("{path}: {e}"))?
        .join(name);
    if settled.starts_with(&root) {
        Ok(settled)
    } else {
        Err(format!("path outside the repository: {path}"))
    }
}

fn path_under_repository(repo: &Path, settled: &Path) -> Result<String, String> {
    let root = repo.canonicalize().map_err(|e| e.to_string())?;
    settled
        .strip_prefix(&root)
        .map(|rest| rest.to_string_lossy().into_owned())
        .map_err(|e| e.to_string())
}

struct BorderFs {
    repo: PathBuf,
    name: String,
    turns: Arc<Mutex<Turns>>,
    sink: Arc<dyn EventSink>,
}

impl BorderFs {
    fn checkpoint_taken_once_per_turn(&self) -> Result<Option<String>, String> {
        let mut turns = lock_through_poison(&self.turns);
        if turns.checkpoint_taken {
            return Ok(turns.checkpoint_oid.clone());
        }
        let oid = checkpoint_create(&self.repo)?;
        if let Some(snapshot) = oid.as_deref() {
            checkpoint_pin(&self.repo, &self.name, turns.number, snapshot)?;
        }
        turns.remember_checkpoint(oid.clone());
        Ok(oid)
    }
}

impl FsBridge for BorderFs {
    fn read(&mut self, path: &str) -> Result<String, String> {
        let settled = path_inside_repository(&self.repo, path)?;
        std::fs::read_to_string(settled).map_err(|e| e.to_string())
    }

    fn write(&mut self, path: &str, content: &str) -> Result<(), String> {
        let settled = path_inside_repository(&self.repo, path)?;
        let under_root = path_under_repository(&self.repo, &settled)?;
        let oid = self.checkpoint_taken_once_per_turn()?;
        self.sink.emit(AcpEventView::Checkpoint {
            oid,
            path: under_root,
        });
        std::fs::write(settled, content).map_err(|e| e.to_string())
    }
}

type SwitchedByMode = Arc<Mutex<HashMap<String, bool>>>;

fn remember_how_each_option_switches(known: &SwitchedByMode, options: &[ConfigOption]) {
    let mut lock = lock_through_poison(known);
    for option in options {
        lock.insert(option.id.clone(), option.via_set_mode);
    }
}

struct Session {
    client: AcpClient,
    agent_session: String,
    turns: Arc<Mutex<Turns>>,
    switched_by_mode: SwitchedByMode,
}

static NEXT_ID: AtomicU32 = AtomicU32::new(1);
static SESSIONS: Mutex<Option<HashMap<u32, Session>>> = Mutex::new(None);

fn sessions() -> Result<MutexGuard<'static, Option<HashMap<u32, Session>>>, ErrorView> {
    SESSIONS.lock().map_err(|_| state_lock_failed())
}

fn session_gone() -> ErrorView {
    ErrorView::new("acp.gone")
}

fn with_session<T>(
    id: u32,
    act: impl FnOnce(&mut Session) -> Result<T, String>,
) -> Result<T, ErrorView> {
    let mut lock = sessions()?;
    let session = lock
        .as_mut()
        .and_then(|open| open.get_mut(&id))
        .ok_or_else(session_gone)?;
    act(session).map_err(|detail| session_gone().detail(detail))
}

#[tauri::command]
pub async fn acp_open(
    app: tauri::AppHandle,
    repo: String,
    on_event: Channel<AcpEventView>,
) -> Result<u32, ErrorView> {
    let home = crate::paths::data_dir(&app)?.join("acp");
    on_reader(move || {
        let launch = crate::acp_adapter::ready_adapter(&home)?;
        let command = launch.program;
        let args = launch.args;
        let root = PathBuf::from(&repo);
        let id = NEXT_ID.fetch_add(1, Ordering::SeqCst);
        let turns = Arc::new(Mutex::new(Turns::new()));
        let sink: Arc<dyn EventSink> = Arc::new(on_event);
        let streaming = Arc::clone(&sink);
        let opening = Arc::clone(&sink);
        let switched_by_mode: SwitchedByMode = Arc::new(Mutex::new(HashMap::new()));
        let switching = Arc::clone(&switched_by_mode);
        let running = Arc::clone(&sink);
        let bridge = BorderFs {
            repo: root.clone(),
            name: id.to_string(),
            turns: Arc::clone(&turns),
            sink,
        };
        let mut client = AcpClient::spawn(
            &command,
            &args,
            &root,
            &gitspy_acp::claude::claude_code_env(),
            Box::new(move |event| {
                if let AgentEvent::Config { options } = &event {
                    remember_how_each_option_switches(&switching, options);
                }
                streaming.emit(view_of(event))
            }),
            Box::new(bridge),
            Box::new(BorderTerminals::new(root.clone(), running)),
        )
        .map_err(|detail| ErrorView::new("acp.spawn").detail(detail))?;
        let greeted = client.initialize().and_then(|()| client.new_session(&root));
        let started = match greeted {
            Ok(started) => started,
            Err(detail) => {
                client.kill();
                return Err(ErrorView::new("acp.spawn").detail(detail));
            }
        };
        remember_how_each_option_switches(&switched_by_mode, &started.config);
        opening.emit(abilities_view(client.abilities()));
        opening.emit(AcpEventView::Config {
            options: config_views(started.config),
        });
        sessions()?.get_or_insert_with(HashMap::new).insert(
            id,
            Session {
                client,
                agent_session: started.session_id,
                turns,
                switched_by_mode,
            },
        );
        Ok(id)
    })
    .await
}

#[tauri::command]
pub fn acp_prompt(id: u32, text: String, paths: Vec<String>) -> Result<(), ErrorView> {
    let can = with_session(id, |session| Ok(session.client.abilities()))?;
    let attach = attachments_of(&paths, can)
        .map_err(|detail| ErrorView::new("acp.attach").detail(detail))?;
    with_session(id, |session| {
        lock_through_poison(&session.turns).begin();
        session
            .client
            .prompt(&session.agent_session, &text, &attach)
    })
}

#[tauri::command]
pub fn acp_permission(id: u32, request_id: u64, option_id: String) -> Result<(), ErrorView> {
    with_session(id, |session| {
        session.client.respond_permission(request_id, &option_id)
    })
}

#[tauri::command]
pub fn acp_set_config(id: u32, config_id: String, value: String) -> Result<(), ErrorView> {
    with_session(id, |session| {
        let via_set_mode = lock_through_poison(&session.switched_by_mode)
            .get(&config_id)
            .copied()
            .unwrap_or_default();
        session
            .client
            .set_config(&session.agent_session, &config_id, &value, via_set_mode)
    })
}

#[tauri::command]
pub fn acp_cancel(id: u32) -> Result<(), ErrorView> {
    with_session(id, |session| session.client.cancel(&session.agent_session))
}

#[tauri::command]
pub fn acp_kill(id: u32) -> Result<(), ErrorView> {
    let mut session = sessions()?
        .as_mut()
        .and_then(|open| open.remove(&id))
        .ok_or_else(session_gone)?;
    session.client.kill();
    Ok(())
}

#[tauri::command]
pub async fn acp_rollback(
    repo: String,
    oid: Option<String>,
    paths: Vec<String>,
) -> Result<(), ErrorView> {
    on_reader(move || {
        checkpoint_restore(Path::new(&repo), oid.as_deref(), &paths)
            .map_err(|detail| ErrorView::new("acp.rollback").detail(detail))
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use gitspy_acp::{AgentEvent, PermissionOption};
    use serde_json::json;
    use std::process::Command;
    use std::sync::{Arc, Mutex};

    struct Collected(Arc<Mutex<Vec<AcpEventView>>>);

    impl EventSink for Collected {
        fn emit(&self, event: AcpEventView) {
            self.0.lock().expect("собранные события").push(event);
        }
    }

    fn repo_with_a_file_edited_before_the_agent() -> tempfile::TempDir {
        let dir = tempfile::tempdir().expect("временный каталог");
        {
            let git = |args: &[&str]| {
                let ok = Command::new("git")
                    .args(args)
                    .current_dir(dir.path())
                    .env("GIT_CONFIG_GLOBAL", "/dev/null")
                    .env("GIT_CONFIG_SYSTEM", "/dev/null")
                    .status()
                    .expect("git запускается")
                    .success();
                assert!(ok, "git {args:?} обязан пройти");
            };
            git(&["init", "-q"]);
            std::fs::write(dir.path().join("a.txt"), "исходное").expect("файл пишется");
            git(&["add", "a.txt"]);
            git(&[
                "-c",
                "user.name=t",
                "-c",
                "user.email=t@t",
                "commit",
                "-q",
                "-m",
                "a",
            ]);
            std::fs::write(dir.path().join("a.txt"), "правка до агента").expect("файл пишется");
        }
        dir
    }

    fn resolved(oid: &str, repo: &std::path::Path) -> String {
        let out = Command::new("git")
            .args(["rev-parse", oid])
            .current_dir(repo)
            .output()
            .expect("git запускается");
        String::from_utf8_lossy(&out.stdout).trim().to_owned()
    }

    #[test]
    fn a_write_outside_the_repository_is_refused() {
        let dir = tempfile::tempdir().expect("временный каталог");
        assert!(
            path_inside_repository(dir.path(), "../beyond.txt").is_err(),
            "выход из репозитория через .. — не наше дело чинить дерево снаружи"
        );
        assert!(
            path_inside_repository(dir.path(), "/etc/hosts").is_err(),
            "абсолютный путь мимо репозитория закрыт"
        );
    }

    #[test]
    fn a_write_inside_the_repository_keeps_the_root_prefix() {
        let dir = tempfile::tempdir().expect("временный каталог");
        let root = dir.path().canonicalize().expect("корень канонизируется");
        assert_eq!(
            path_inside_repository(dir.path(), "a.txt").expect("путь внутри разрешён"),
            root.join("a.txt"),
            "относительный путь считается от корня репозитория"
        );
        assert_eq!(
            path_inside_repository(dir.path(), root.join("a.txt").to_str().expect("utf8"))
                .expect("путь внутри разрешён"),
            root.join("a.txt"),
            "абсолютный путь внутри репозитория проходит как есть"
        );
    }

    #[test]
    fn a_new_turn_starts_without_a_checkpoint_and_numbers_the_next_ref() {
        let mut turns = Turns::new();
        turns.begin();
        assert_eq!(turns.number, 1, "первый ход — первый номер ссылки");
        assert!(!turns.checkpoint_taken, "до первой записи снимка нет");
        turns.remember_checkpoint(Some("abc".to_string()));
        assert!(turns.checkpoint_taken, "снимок хода берётся один раз");
        turns.begin();
        assert_eq!(turns.number, 2, "номер хода — номер ссылки чекпоинта");
        assert!(
            !turns.checkpoint_taken,
            "новый ход обязан взять свой снимок, иначе откат вернёт чужой"
        );
        assert_eq!(
            turns.checkpoint_oid, None,
            "oid прошлого хода не должен утечь в новый"
        );
    }

    #[test]
    fn every_write_of_a_turn_reports_the_one_checkpoint_and_lands_on_disk() {
        let dir = repo_with_a_file_edited_before_the_agent();
        let seen = Arc::new(Mutex::new(Vec::new()));
        let turns = Arc::new(Mutex::new(Turns::new()));
        turns.lock().expect("ходы").begin();
        let mut bridge = BorderFs {
            repo: dir.path().to_path_buf(),
            name: "7".to_string(),
            turns: Arc::clone(&turns),
            sink: Arc::new(Collected(Arc::clone(&seen))),
        };

        bridge
            .write("a.txt", "агент правит")
            .expect("запись проходит");
        bridge
            .write("b.txt", "агент создаёт")
            .expect("запись проходит");

        let events = seen.lock().expect("собранные события");
        let checkpoints: Vec<(Option<String>, String)> = events
            .iter()
            .filter_map(|event| match event {
                AcpEventView::Checkpoint { oid, path } => Some((oid.clone(), path.clone())),
                _ => None,
            })
            .collect();
        assert_eq!(
            checkpoints.len(),
            2,
            "откат должен знать все пути хода, значит каждая запись отчитывается"
        );
        assert_eq!(
            checkpoints[0].0, checkpoints[1].0,
            "снимок на ход один, второй перезаписал бы правки агента"
        );
        let oid = checkpoints[0]
            .0
            .clone()
            .expect("грязное дерево до агента даёт снимок");
        assert_eq!(
            checkpoints.iter().map(|c| c.1.clone()).collect::<Vec<_>>(),
            vec!["a.txt".to_string(), "b.txt".to_string()],
            "пути отдаются относительно корня, откат зовёт git restore ими"
        );
        assert_eq!(
            resolved("refs/gitspy/checkpoints/7/1", dir.path()),
            oid,
            "снимок закреплён ссылкой хода, иначе сборщик мусора его съест"
        );
        assert_eq!(
            std::fs::read_to_string(dir.path().join("a.txt")).expect("файл читается"),
            "агент правит",
            "запись агента доходит до диска"
        );
        assert_eq!(
            std::fs::read_to_string(dir.path().join("b.txt")).expect("файл читается"),
            "агент создаёт",
            "новый файл агента доходит до диска"
        );
    }

    #[test]
    fn the_event_view_crosses_the_border_tagged_by_kind_in_camel_case() {
        assert_eq!(
            serde_json::to_value(AcpEventView::TurnEnded {
                stop_reason: "end_turn".to_string()
            })
            .expect("вид сериализуется"),
            json!({ "kind": "turnEnded", "stopReason": "end_turn" }),
            "фронт разбирает ленту по kind, поля границы — camelCase"
        );
        assert_eq!(
            serde_json::to_value(AcpEventView::Permission {
                request_id: 5,
                title: "Edit demo.txt".to_string(),
                options: vec![AcpOptionView {
                    id: "allow".to_string(),
                    label: "Allow".to_string()
                }]
            })
            .expect("вид сериализуется"),
            json!({
                "kind": "permission",
                "requestId": 5,
                "title": "Edit demo.txt",
                "options": [{ "id": "allow", "label": "Allow" }]
            }),
            "ответ на разрешение уходит по requestId — имя поля часть договора"
        );
    }

    #[test]
    fn declared_abilities_cross_the_border_before_the_first_prompt() {
        assert_eq!(
            serde_json::to_value(abilities_view(PromptAbilities {
                image: true,
                embedded_context: false
            }))
            .expect("вид сериализуется"),
            json!({ "kind": "abilities", "image": true, "embeddedContext": false }),
            "фронт предлагает ровно то, что агент объявил: блок сверх объявленного он отвергнет ошибкой протокола"
        );
    }

    #[test]
    fn agent_events_reach_the_border_view_without_losing_fields() {
        assert_eq!(
            serde_json::to_value(view_of(AgentEvent::PermissionRequest {
                request_id: 12,
                title: "Edit demo.txt".to_string(),
                options: vec![PermissionOption {
                    id: "deny".to_string(),
                    label: "Отклонить".to_string()
                }]
            }))
            .expect("вид сериализуется"),
            json!({
                "kind": "permission",
                "requestId": 12,
                "title": "Edit demo.txt",
                "options": [{ "id": "deny", "label": "Отклонить" }]
            }),
            "кнопки разрешения рисуются по options — они обязаны пережить границу"
        );
        assert_eq!(
            serde_json::to_value(view_of(AgentEvent::ToolCallUpdate {
                id: "t1".to_string(),
                status: "completed".to_string(),
                terminal_id: None
            }))
            .expect("вид сериализуется"),
            json!({ "kind": "toolCallUpdate", "id": "t1", "status": "completed", "terminalId": null }),
            "обновление инструмента находит карточку по id"
        );
        assert_eq!(
            serde_json::to_value(view_of(AgentEvent::ToolCall {
                id: "t1".to_string(),
                title: "Terminal".to_string(),
                status: "in_progress".to_string(),
                terminal_id: Some("term_1".to_string()),
                parent_id: None,
                subagent: false
            }))
            .expect("вид сериализуется"),
            json!({
                "kind": "toolCall",
                "id": "t1",
                "title": "Terminal",
                "status": "in_progress",
                "terminalId": "term_1",
                "parentId": null,
                "subagent": false
            }),
            "панель терминала под карточкой находится по terminalId — без него команды агента остаются невидимыми"
        );
        assert_eq!(
            serde_json::to_value(view_of(AgentEvent::ToolCall {
                id: "inner1".to_string(),
                title: "ls -la".to_string(),
                status: "pending".to_string(),
                terminal_id: None,
                parent_id: Some("sub1".to_string()),
                subagent: false
            }))
            .expect("вид сериализуется"),
            json!({
                "kind": "toolCall",
                "id": "inner1",
                "title": "ls -la",
                "status": "pending",
                "terminalId": null,
                "parentId": "sub1",
                "subagent": false
            }),
            "родитель вызова переезжает границу — по нему лента кладёт карточку внутрь стенограммы субагента"
        );
    }

    #[test]
    fn declared_options_cross_the_border_without_the_wire_method() {
        let crossed = serde_json::to_value(view_of(AgentEvent::Config {
            options: vec![ConfigOption {
                id: "model".to_string(),
                name: "Model".to_string(),
                description: None,
                category: "model".to_string(),
                current_value: "opus".to_string(),
                choices: vec![gitspy_acp::ConfigChoice {
                    value: "opus".to_string(),
                    name: "Opus".to_string(),
                }],
                via_set_mode: true,
            }],
        }))
        .expect("вид сериализуется");
        assert_eq!(
            crossed,
            json!({
                "kind": "config",
                "options": [{
                    "id": "model",
                    "name": "Model",
                    "description": null,
                    "category": "model",
                    "currentValue": "opus",
                    "choices": [{ "value": "opus", "name": "Opus" }]
                }]
            }),
            "фронт рисует чипы из этих полей, а каким методом опция переключается — знает только граница"
        );
    }

    #[test]
    fn usage_and_commands_keep_their_shape_across_the_border() {
        assert_eq!(
            serde_json::to_value(view_of(AgentEvent::Usage {
                used: 34762,
                size: 1_000_000,
                cost: Some(0.21),
                currency: Some("USD".to_string()),
                limits: Vec::new(),
            }))
            .expect("вид сериализуется"),
            json!({
                "kind": "usage",
                "used": 34762,
                "size": 1000000,
                "cost": 0.21,
                "currency": "USD",
                "limits": []
            }),
            "доля окна контекста считается из used и size на фронте"
        );
        assert_eq!(
            serde_json::to_value(view_of(AgentEvent::Commands {
                commands: vec![CommandInfo {
                    name: "usage".to_string(),
                    description: "Show usage".to_string(),
                    hint: None,
                }],
            }))
            .expect("вид сериализуется"),
            json!({
                "kind": "commands",
                "commands": [{ "name": "usage", "description": "Show usage", "hint": null }]
            }),
            "список слэш-команд приходит от агента и рисуется как есть"
        );
    }

    #[test]
    fn plan_limits_of_the_account_cross_the_border_with_the_usage_they_arrived_with() {
        assert_eq!(
            serde_json::to_value(view_of(AgentEvent::Usage {
                used: 34580,
                size: 1_000_000,
                cost: None,
                currency: None,
                limits: vec![gitspy_acp::RateLimit {
                    kind: "five_hour".to_string(),
                    resets_at: Some(1_786_116_000),
                    used_share: None,
                    status: "allowed".to_string(),
                }],
            }))
            .expect("вид сериализуется"),
            json!({
                "kind": "usage",
                "used": 34580,
                "size": 1000000,
                "cost": null,
                "currency": null,
                "limits": [{
                    "kind": "five_hour",
                    "resetsAt": 1786116000,
                    "usedShare": null,
                    "status": "allowed"
                }]
            }),
            "имя лимита фронт берёт по kind, а сколько осталось — считает из resetsAt"
        );
    }

    #[test]
    fn the_border_remembers_which_option_switches_through_set_mode() {
        let known: SwitchedByMode = Arc::new(Mutex::new(HashMap::new()));
        remember_how_each_option_switches(
            &known,
            &[
                ConfigOption {
                    id: "mode".to_string(),
                    name: String::new(),
                    description: None,
                    category: "mode".to_string(),
                    current_value: "plan".to_string(),
                    choices: Vec::new(),
                    via_set_mode: true,
                },
                ConfigOption {
                    id: "model".to_string(),
                    name: "Model".to_string(),
                    description: None,
                    category: "model".to_string(),
                    current_value: "opus".to_string(),
                    choices: Vec::new(),
                    via_set_mode: false,
                },
            ],
        );
        let lock = known.lock().expect("методы переключения");
        assert_eq!(
            lock.get("mode"),
            Some(&true),
            "иначе смена режима у агента старой формы ушла бы несуществующим методом"
        );
        assert_eq!(
            lock.get("model"),
            Some(&false),
            "объявленная опция переключается через session/set_config_option"
        );
    }
}

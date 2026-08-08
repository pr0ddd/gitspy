pub mod claude;
mod wire;

use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::path::Path;
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc;
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::Duration;
use wire::{text_field, Envelope};

const REPLY_TIMEOUT: Duration = Duration::from_secs(10);

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct PromptAbilities {
    pub image: bool,
    pub embedded_context: bool,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Attachment {
    Image {
        mime: String,
        base64: String,
    },
    Embedded {
        uri: String,
        text: String,
        mime: Option<String>,
    },
    Link {
        uri: String,
        name: String,
        mime: Option<String>,
        size: Option<u64>,
    },
}

#[derive(Clone, Debug)]
pub struct PermissionOption {
    pub id: String,
    pub label: String,
}

#[derive(Clone, Debug)]
pub struct ConfigChoice {
    pub value: String,
    pub name: String,
}

#[derive(Clone, Debug)]
pub struct ConfigOption {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub category: String,
    pub current_value: String,
    pub choices: Vec<ConfigChoice>,
    pub via_set_mode: bool,
}

#[derive(Clone, Debug)]
pub struct PlanEntry {
    pub content: String,
    pub status: String,
}

#[derive(Clone, Debug)]
pub struct RateLimit {
    pub kind: String,
    pub resets_at: Option<i64>,
    pub used_share: Option<f64>,
    pub status: String,
}

#[derive(Clone, Debug)]
pub struct CommandInfo {
    pub name: String,
    pub description: String,
    pub hint: Option<String>,
}

#[derive(Clone, Debug)]
pub struct SessionStart {
    pub session_id: String,
    pub config: Vec<ConfigOption>,
}

#[derive(Clone, Debug)]
pub enum AgentEvent {
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
        bytes: Vec<u8>,
    },
    TerminalExit {
        terminal_id: String,
        code: Option<i32>,
        signal: Option<String>,
    },
    Plan {
        entries: Vec<PlanEntry>,
    },
    Config {
        options: Vec<ConfigOption>,
    },
    ConfigValue {
        config_id: String,
        value: String,
    },
    Commands {
        commands: Vec<CommandInfo>,
    },
    Usage {
        used: u64,
        size: u64,
        cost: Option<f64>,
        currency: Option<String>,
        limits: Vec<RateLimit>,
    },
    PermissionRequest {
        request_id: u64,
        title: String,
        options: Vec<PermissionOption>,
    },
    TurnEnded {
        stop_reason: String,
    },
    Fatal {
        detail: String,
    },
}

pub trait FsBridge: Send {
    fn read(&mut self, path: &str) -> Result<String, String>;
    fn write(&mut self, path: &str, content: &str) -> Result<(), String>;
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TerminalExit {
    pub code: Option<i32>,
    pub signal: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TerminalOutput {
    pub output: String,
    pub truncated: bool,
    pub exit: Option<TerminalExit>,
}

pub trait TerminalBridge: Send {
    fn create(
        &mut self,
        command: &str,
        args: &[String],
        cwd: Option<&str>,
        env: &[(String, String)],
        limit: Option<u64>,
    ) -> Result<String, String>;
    fn output(&mut self, id: &str) -> Result<TerminalOutput, String>;
    fn wait(&mut self, id: &str) -> Result<TerminalExit, String>;
    fn kill(&mut self, id: &str) -> Result<(), String>;
    fn release(&mut self, id: &str) -> Result<(), String>;
}

pub type OnEvent = Box<dyn FnMut(AgentEvent) + Send>;

fn lock_through_poison<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

enum Waiter {
    Reply(mpsc::Sender<Envelope>),
    ConfigApplied(mpsc::Sender<Envelope>),
    TurnEnd,
}

struct Wire {
    stdin: Mutex<ChildStdin>,
    pending: Mutex<HashMap<u64, Waiter>>,
    next_id: AtomicU64,
}

impl Wire {
    fn send(&self, message: &Value) -> Result<(), String> {
        let mut stdin = lock_through_poison(&self.stdin);
        writeln!(stdin, "{message}").map_err(|e| e.to_string())?;
        stdin.flush().map_err(|e| e.to_string())
    }

    fn take_id(&self) -> u64 {
        self.next_id.fetch_add(1, Ordering::Relaxed)
    }

    fn expect_reply(&self, id: u64) -> mpsc::Receiver<Envelope> {
        self.expect(id, Waiter::Reply)
    }

    fn expect_config_reply(&self, id: u64) -> mpsc::Receiver<Envelope> {
        self.expect(id, Waiter::ConfigApplied)
    }

    fn expect(
        &self,
        id: u64,
        waiting: impl FnOnce(mpsc::Sender<Envelope>) -> Waiter,
    ) -> mpsc::Receiver<Envelope> {
        let (tx, rx) = mpsc::channel();
        lock_through_poison(&self.pending).insert(id, waiting(tx));
        rx
    }

    fn expect_turn_end(&self, id: u64) {
        lock_through_poison(&self.pending).insert(id, Waiter::TurnEnd);
    }

    fn forget(&self, id: u64) {
        lock_through_poison(&self.pending).remove(&id);
    }

    fn take_waiter(&self, id: u64) -> Option<Waiter> {
        lock_through_poison(&self.pending).remove(&id)
    }
}

fn permission_options(value: &Value) -> Vec<PermissionOption> {
    value
        .as_array()
        .map(|items| {
            items
                .iter()
                .map(|item| PermissionOption {
                    id: text_field(item, "optionId"),
                    label: text_field(item, "name"),
                })
                .collect()
        })
        .unwrap_or_default()
}

fn turn_outcome(envelope: Envelope) -> AgentEvent {
    if envelope.error.is_null() {
        AgentEvent::TurnEnded {
            stop_reason: text_field(&envelope.result, "stopReason"),
        }
    } else {
        AgentEvent::Fatal {
            detail: envelope.error.to_string(),
        }
    }
}

fn usage_event(update: &Value) -> AgentEvent {
    let (used, size, cost, currency) = wire::usage_of(update);
    AgentEvent::Usage {
        used,
        size,
        cost,
        currency,
        limits: wire::rate_limits_of(update),
    }
}

fn session_update_event(update: &Value) -> Option<AgentEvent> {
    match update["sessionUpdate"].as_str()? {
        "agent_message_chunk" => Some(AgentEvent::MessageChunk {
            text: text_field(&update["content"], "text"),
        }),
        "agent_thought_chunk" => Some(AgentEvent::Thought {
            text: text_field(&update["content"], "text"),
        }),
        "tool_call" => Some(AgentEvent::ToolCall {
            id: text_field(update, "toolCallId"),
            title: text_field(update, "title"),
            status: text_field(update, "status"),
            terminal_id: wire::terminal_of(update),
            parent_id: wire::parent_tool_call_of(update),
            subagent: wire::runs_a_subagent(update),
        }),
        "tool_call_update" => Some(AgentEvent::ToolCallUpdate {
            id: text_field(update, "toolCallId"),
            status: text_field(update, "status"),
            terminal_id: wire::terminal_of(update),
        }),
        "plan" => Some(AgentEvent::Plan {
            entries: wire::plan_entries_of(&update["entries"]),
        }),
        "available_commands_update" => Some(AgentEvent::Commands {
            commands: wire::commands_of(&update["availableCommands"]),
        }),
        "config_option_update" => Some(AgentEvent::Config {
            options: wire::config_options_of(update),
        }),
        "current_mode_update" => Some(AgentEvent::ConfigValue {
            config_id: "mode".to_owned(),
            value: text_field(update, "currentModeId"),
        }),
        "usage_update" => Some(usage_event(update)),
        _ => None,
    }
}

fn config_outcome(result: &Value) -> Option<AgentEvent> {
    result.get("configOptions").map(|_| AgentEvent::Config {
        options: wire::config_options_of(result),
    })
}

struct Reader {
    wire: Arc<Wire>,
    on_event: OnEvent,
    fs: Box<dyn FsBridge>,
    terminals: Box<dyn TerminalBridge>,
}

impl Reader {
    fn read_until_process_dies(mut self, stdout: ChildStdout) {
        let mut lines = BufReader::new(stdout).lines();
        let detail = loop {
            match lines.next() {
                None => break "stdout closed".to_owned(),
                Some(Err(e)) => break e.to_string(),
                Some(Ok(line)) => self.dispatch(&line),
            }
        };
        (self.on_event)(AgentEvent::Fatal { detail });
    }

    fn dispatch(&mut self, line: &str) {
        let Ok(envelope) = serde_json::from_str::<Envelope>(line) else {
            return;
        };
        match (envelope.id, envelope.method.clone()) {
            (Some(id), Some(method)) => self.answer_agent_request(id, &method, &envelope.params),
            (Some(id), None) => self.settle_pending(id, envelope),
            (None, Some(method)) => self.emit_notification(&method, &envelope.params),
            (None, None) => {}
        }
    }

    fn answer_agent_request(&mut self, id: u64, method: &str, params: &Value) {
        match method {
            "fs/read_text_file" => {
                let reply = match self.fs.read(&text_field(params, "path")) {
                    Ok(content) => wire::response(id, json!({ "content": content })),
                    Err(detail) => wire::failed_response(id, &detail),
                };
                let _ = self.wire.send(&reply);
            }
            "fs/write_text_file" => {
                let written = self
                    .fs
                    .write(&text_field(params, "path"), &text_field(params, "content"));
                let reply = match written {
                    Ok(()) => wire::response(id, json!({})),
                    Err(detail) => wire::failed_response(id, &detail),
                };
                let _ = self.wire.send(&reply);
            }
            "session/request_permission" => (self.on_event)(AgentEvent::PermissionRequest {
                request_id: id,
                title: text_field(&params["toolCall"], "title"),
                options: permission_options(&params["options"]),
            }),
            "terminal/create"
            | "terminal/output"
            | "terminal/wait_for_exit"
            | "terminal/kill"
            | "terminal/release" => {
                let reply = match self.run_terminal_request(method, params) {
                    Ok(result) => wire::response(id, result),
                    Err(detail) => wire::failed_response(id, &detail),
                };
                let _ = self.wire.send(&reply);
            }
            _ => {
                let _ = self.wire.send(&wire::method_not_found(id, method));
            }
        }
    }

    fn run_terminal_request(&mut self, method: &str, params: &Value) -> Result<Value, String> {
        let named = || text_field(params, "terminalId");
        match method {
            "terminal/create" => self
                .terminals
                .create(
                    &text_field(params, "command"),
                    &wire::args_of(params),
                    params["cwd"].as_str(),
                    &wire::env_pairs(params),
                    params["outputByteLimit"].as_u64(),
                )
                .map(|id| wire::created_terminal(&id)),
            "terminal/output" => self
                .terminals
                .output(&named())
                .map(|captured| wire::output_result(&captured)),
            "terminal/wait_for_exit" => self
                .terminals
                .wait(&named())
                .map(|exit| wire::exit_result(&exit)),
            "terminal/kill" => self.terminals.kill(&named()).map(|()| json!({})),
            _ => self.terminals.release(&named()).map(|()| json!({})),
        }
    }

    fn settle_pending(&mut self, id: u64, envelope: Envelope) {
        match self.wire.take_waiter(id) {
            Some(Waiter::Reply(tx)) => {
                let _ = tx.send(envelope);
            }
            Some(Waiter::ConfigApplied(tx)) => {
                if let Some(event) = config_outcome(&envelope.result) {
                    (self.on_event)(event);
                }
                let _ = tx.send(envelope);
            }
            Some(Waiter::TurnEnd) => (self.on_event)(turn_outcome(envelope)),
            None => {}
        }
    }

    fn emit_notification(&mut self, method: &str, params: &Value) {
        if method != "session/update" {
            return;
        }
        let update = &params["update"];
        for event in wire::terminal_events_of(update) {
            (self.on_event)(event);
        }
        if let Some(event) = session_update_event(update) {
            (self.on_event)(event);
        }
    }
}

pub struct AcpClient {
    wire: Arc<Wire>,
    child: Child,
    abilities: PromptAbilities,
}

impl AcpClient {
    pub fn spawn(
        command: &str,
        args: &[String],
        cwd: &Path,
        envs: &[(String, String)],
        on_event: OnEvent,
        fs: Box<dyn FsBridge>,
        terminals: Box<dyn TerminalBridge>,
    ) -> Result<AcpClient, String> {
        let mut child = Command::new(command)
            .args(args)
            .current_dir(cwd)
            .envs(envs.iter().map(|(k, v)| (k.as_str(), v.as_str())))
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .spawn()
            .map_err(|e| e.to_string())?;
        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| "stdin unavailable".to_owned())?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| "stdout unavailable".to_owned())?;
        let wire = Arc::new(Wire {
            stdin: Mutex::new(stdin),
            pending: Mutex::new(HashMap::new()),
            next_id: AtomicU64::new(1),
        });
        let reader = Reader {
            wire: Arc::clone(&wire),
            on_event,
            fs,
            terminals,
        };
        std::thread::spawn(move || reader.read_until_process_dies(stdout));
        Ok(AcpClient {
            wire,
            child,
            abilities: PromptAbilities::default(),
        })
    }

    pub fn initialize(&mut self) -> Result<(), String> {
        let greeting = self.request_blocking("initialize", wire::initialize_params())?;
        self.abilities = wire::prompt_abilities_of(&greeting);
        Ok(())
    }

    pub fn abilities(&self) -> PromptAbilities {
        self.abilities
    }

    pub fn new_session(&mut self, cwd: &Path) -> Result<SessionStart, String> {
        let result = self.request_blocking(
            "session/new",
            wire::new_session_params(&cwd.to_string_lossy()),
        )?;
        let session_id = result["sessionId"]
            .as_str()
            .map(|id| id.to_owned())
            .ok_or_else(|| format!("session/new without sessionId: {result}"))?;
        Ok(SessionStart {
            session_id,
            config: wire::config_options_of(&result),
        })
    }

    pub fn set_config(
        &mut self,
        session: &str,
        config_id: &str,
        value: &str,
        via_set_mode: bool,
    ) -> Result<(), String> {
        if via_set_mode {
            self.config_request_blocking(
                "session/set_mode",
                wire::set_mode_params(session, value),
            )?;
        } else {
            self.config_request_blocking(
                "session/set_config_option",
                wire::set_config_params(session, config_id, value),
            )?;
        }
        Ok(())
    }

    pub fn prompt(
        &mut self,
        session: &str,
        text: &str,
        attach: &[Attachment],
    ) -> Result<(), String> {
        let id = self.wire.take_id();
        self.wire.expect_turn_end(id);
        let sent = self.wire.send(&wire::request(
            id,
            "session/prompt",
            wire::prompt_params(session, text, attach),
        ));
        if sent.is_err() {
            self.wire.forget(id);
        }
        sent
    }

    pub fn respond_permission(&mut self, request_id: u64, option_id: &str) -> Result<(), String> {
        self.wire.send(&wire::response(
            request_id,
            wire::permission_outcome(option_id),
        ))
    }

    pub fn cancel(&mut self, session: &str) -> Result<(), String> {
        self.wire.send(&wire::cancel_notification(session))
    }

    pub fn kill(&mut self) {
        let _ = self.child.kill();
    }

    fn request_blocking(&self, method: &str, params: Value) -> Result<Value, String> {
        let id = self.wire.take_id();
        let replies = self.wire.expect_reply(id);
        self.settle(id, method, params, replies)
    }

    fn config_request_blocking(&self, method: &str, params: Value) -> Result<Value, String> {
        let id = self.wire.take_id();
        let replies = self.wire.expect_config_reply(id);
        self.settle(id, method, params, replies)
    }

    fn settle(
        &self,
        id: u64,
        method: &str,
        params: Value,
        replies: mpsc::Receiver<Envelope>,
    ) -> Result<Value, String> {
        if let Err(detail) = self.wire.send(&wire::request(id, method, params)) {
            self.wire.forget(id);
            return Err(detail);
        }
        let envelope = match replies.recv_timeout(REPLY_TIMEOUT) {
            Ok(envelope) => envelope,
            Err(e) => {
                self.wire.forget(id);
                return Err(format!("{method}: {e}"));
            }
        };
        if envelope.error.is_null() {
            Ok(envelope.result)
        } else {
            Err(format!("{method}: {}", envelope.error))
        }
    }
}

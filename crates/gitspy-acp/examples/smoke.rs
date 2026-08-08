use gitspy_acp::{AcpClient, AgentEvent, FsBridge, TerminalBridge, TerminalExit, TerminalOutput};
use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Output;
use std::sync::mpsc;
use std::time::{Duration, Instant};

const ADAPTER: &str = "@agentclientprotocol/claude-agent-acp";
const PROMPT: &str = "Ответь одним словом: ок";
const TURN_BUDGET: Duration = Duration::from_secs(120);

struct RealFs;

impl FsBridge for RealFs {
    fn read(&mut self, path: &str) -> Result<String, String> {
        std::fs::read_to_string(path).map_err(|e| e.to_string())
    }

    fn write(&mut self, path: &str, content: &str) -> Result<(), String> {
        std::fs::write(path, content).map_err(|e| e.to_string())
    }
}

#[derive(Default)]
struct FinishedTerminals {
    ran: HashMap<String, Output>,
    next: u32,
}

impl TerminalBridge for FinishedTerminals {
    fn create(
        &mut self,
        command: &str,
        args: &[String],
        cwd: Option<&str>,
        env: &[(String, String)],
        _limit: Option<u64>,
    ) -> Result<String, String> {
        let mut run = std::process::Command::new(command);
        run.args(args);
        run.envs(env.iter().map(|(name, value)| (name, value)));
        if let Some(dir) = cwd {
            run.current_dir(dir);
        }
        let done = run.output().map_err(|e| e.to_string())?;
        self.next += 1;
        let id = format!("term_{}", self.next);
        self.ran.insert(id.clone(), done);
        Ok(id)
    }

    fn output(&mut self, id: &str) -> Result<TerminalOutput, String> {
        let done = self.ran.get(id).ok_or_else(|| "terminal gone".to_owned())?;
        Ok(TerminalOutput {
            output: String::from_utf8_lossy(&done.stdout).into_owned(),
            truncated: false,
            exit: Some(TerminalExit {
                code: done.status.code(),
                signal: None,
            }),
        })
    }

    fn wait(&mut self, id: &str) -> Result<TerminalExit, String> {
        let done = self.ran.get(id).ok_or_else(|| "terminal gone".to_owned())?;
        Ok(TerminalExit {
            code: done.status.code(),
            signal: None,
        })
    }

    fn kill(&mut self, _id: &str) -> Result<(), String> {
        Ok(())
    }

    fn release(&mut self, id: &str) -> Result<(), String> {
        self.ran.remove(id);
        Ok(())
    }
}

fn repo_from_args() -> Result<PathBuf, String> {
    std::env::args()
        .nth(1)
        .map(PathBuf::from)
        .ok_or_else(|| "usage: smoke <repo-path>".to_owned())
}

fn describe(event: &AgentEvent) -> String {
    match event {
        AgentEvent::MessageChunk { text } => format!("MessageChunk {text:?}"),
        AgentEvent::Thought { text } => format!("Thought {text:?}"),
        AgentEvent::ToolCall {
            id,
            title,
            status,
            terminal_id,
            parent_id,
            subagent,
        } => format!("ToolCall {id} {title:?} {status} {terminal_id:?} {parent_id:?} {subagent}"),
        AgentEvent::ToolCallUpdate {
            id,
            status,
            terminal_id,
        } => format!("ToolCallUpdate {id} {status} {terminal_id:?}"),
        AgentEvent::TerminalOutput { terminal_id, bytes } => format!(
            "TerminalOutput {terminal_id} {:?}",
            String::from_utf8_lossy(bytes)
        ),
        AgentEvent::TerminalExit {
            terminal_id,
            code,
            signal,
        } => format!("TerminalExit {terminal_id} {code:?} {signal:?}"),
        AgentEvent::Plan { entries } => format!("Plan {} entries", entries.len()),
        AgentEvent::Config { options } => {
            let ids: Vec<&str> = options.iter().map(|option| option.id.as_str()).collect();
            format!("Config [{}]", ids.join(", "))
        }
        AgentEvent::ConfigValue { config_id, value } => format!("ConfigValue {config_id} {value}"),
        AgentEvent::Commands { commands } => format!("Commands {}", commands.len()),
        AgentEvent::Usage {
            used,
            size,
            cost,
            currency,
            limits,
        } => {
            let kinds: Vec<&str> = limits.iter().map(|limit| limit.kind.as_str()).collect();
            format!(
                "Usage {used}/{size} {cost:?} {currency:?} [{}]",
                kinds.join(", ")
            )
        }
        AgentEvent::PermissionRequest {
            request_id,
            title,
            options,
        } => {
            let ids: Vec<&str> = options.iter().map(|option| option.id.as_str()).collect();
            format!(
                "PermissionRequest {request_id} {title:?} [{}]",
                ids.join(", ")
            )
        }
        AgentEvent::TurnEnded { stop_reason } => format!("TurnEnded {stop_reason}"),
        AgentEvent::Fatal { detail } => format!("Fatal {detail}"),
    }
}

fn wait_for_turn_end_within_budget(
    events: &mpsc::Receiver<AgentEvent>,
    asked: Instant,
) -> Result<(), String> {
    let mut first_chunk: Option<Duration> = None;
    let mut answer = String::new();
    loop {
        let left = TURN_BUDGET
            .checked_sub(asked.elapsed())
            .ok_or_else(|| format!("ход не кончился за {} с", TURN_BUDGET.as_secs()))?;
        let event = events
            .recv_timeout(left)
            .map_err(|e| format!("{e} через {} мс после prompt", asked.elapsed().as_millis()))?;
        let at = asked.elapsed().as_millis();
        println!("{at:>7} ms  {}", describe(&event));
        match event {
            AgentEvent::MessageChunk { text } => {
                first_chunk.get_or_insert_with(|| asked.elapsed());
                answer.push_str(&text);
            }
            AgentEvent::TurnEnded { stop_reason } => {
                let first = first_chunk.map(|d| d.as_millis());
                println!("first chunk: {first:?} ms, turn end: {at} ms, stop: {stop_reason}");
                println!("answer: {answer:?}");
                return Ok(());
            }
            AgentEvent::Fatal { detail } => return Err(format!("агент умер: {detail}")),
            _ => {}
        }
    }
}

fn main() -> Result<(), String> {
    let repo = repo_from_args()?;
    let (tx, events) = mpsc::channel();
    let started = Instant::now();
    let entry = std::env::var("GITSPY_ACP_ENTRY").ok();
    let (program, args) = match &entry {
        Some(path) => ("node", vec![path.clone()]),
        None => ("npx", vec!["-y".to_owned(), ADAPTER.to_owned()]),
    };
    let mut client = AcpClient::spawn(
        program,
        &args,
        &repo,
        &gitspy_acp::claude::claude_code_env(),
        Box::new(move |event| {
            let _ = tx.send(event);
        }),
        Box::new(RealFs),
        Box::new(FinishedTerminals::default()),
    )?;
    client.initialize()?;
    println!("initialize: {} ms", started.elapsed().as_millis());
    let opened = client.new_session(&repo)?;
    println!(
        "session {}: {} ms, options {}",
        opened.session_id,
        started.elapsed().as_millis(),
        opened.config.len()
    );
    let asked = Instant::now();
    client.prompt(&opened.session_id, PROMPT, &[])?;
    let outcome = wait_for_turn_end_within_budget(&events, asked);
    client.kill();
    outcome
}

use gitspy_acp::claude::claude_code_env;
use serde_json::{json, Value};
use std::io::{BufRead, BufReader, Write};
use std::process::{ChildStdin, Command, Stdio};
use std::sync::mpsc::{self, Receiver};
use std::sync::Mutex;
use std::time::Duration;

const ADAPTER: &str = "@agentclientprotocol/claude-agent-acp";
const PROMPT: &str = "перечисли три файла в этом репозитории";
const REPLY_BUDGET: Duration = Duration::from_secs(60);
const TURN_BUDGET: Duration = Duration::from_secs(240);

fn request(id: u64, method: &str, params: Value) -> Value {
    json!({ "jsonrpc": "2.0", "id": id, "method": method, "params": params })
}

fn response(id: u64, result: Value) -> Value {
    json!({ "jsonrpc": "2.0", "id": id, "result": result })
}

fn answer_to_agent_request(method: &str, params: &Value) -> Value {
    match method {
        "fs/read_text_file" => {
            let path = params["path"].as_str().unwrap_or_default();
            match std::fs::read_to_string(path) {
                Ok(content) => json!({ "content": content }),
                Err(e) => json!({ "content": e.to_string() }),
            }
        }
        "session/request_permission" => json!({
            "outcome": {
                "outcome": "selected",
                "optionId": params["options"][0]["optionId"].as_str().unwrap_or_default()
            }
        }),
        _ => json!({}),
    }
}

fn option_worth_switching(started: &Value) -> Option<(String, String)> {
    started["configOptions"]
        .as_array()?
        .iter()
        .find_map(|option| {
            let id = option["id"].as_str()?;
            let first = option["options"][0]["value"].as_str()?;
            let current = option["currentValue"].as_str()?;
            (first != current).then(|| (id.to_owned(), first.to_owned()))
        })
}

fn say_through(stdin: &Mutex<Option<ChildStdin>>, message: Value) {
    let mut handle = stdin.lock().expect("stdin адаптера");
    if let Some(pipe) = handle.as_mut() {
        let _ = writeln!(pipe, "{message}");
        let _ = pipe.flush();
    }
}

fn close_stdin_so_the_adapter_exits_on_its_own(stdin: &Mutex<Option<ChildStdin>>) {
    stdin.lock().expect("stdin адаптера").take();
}

fn wait_for_reply(replies: &Receiver<(u64, Value)>, id: u64, budget: Duration) -> Value {
    loop {
        let (seen, envelope) = replies
            .recv_timeout(budget)
            .unwrap_or_else(|e| panic!("ответ на {id} не пришёл: {e}"));
        if seen == id {
            return envelope;
        }
    }
}

fn main() -> Result<(), String> {
    let repo = std::env::args()
        .nth(1)
        .ok_or_else(|| "usage: discover <repo-path>".to_owned())?;
    let mut child = Command::new("npx")
        .args(["-y", ADAPTER])
        .current_dir(&repo)
        .envs(claude_code_env())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .spawn()
        .map_err(|e| e.to_string())?;
    let stdin = Mutex::new(Some(
        child
            .stdin
            .take()
            .ok_or_else(|| "stdin unavailable".to_owned())?,
    ));
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "stdout unavailable".to_owned())?;
    let (tx, replies) = mpsc::channel();

    std::thread::scope(|scope| {
        scope.spawn(|| {
            for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                println!("{line}");
                let Ok(envelope) = serde_json::from_str::<Value>(&line) else {
                    continue;
                };
                let id = envelope["id"].as_u64();
                match (id, envelope["method"].as_str()) {
                    (Some(id), Some(method)) => {
                        let result = answer_to_agent_request(method, &envelope["params"]);
                        say_through(&stdin, response(id, result));
                    }
                    (Some(id), None) => {
                        let _ = tx.send((id, envelope));
                    }
                    _ => {}
                }
            }
        });

        let say = |message: Value| say_through(&stdin, message);

        say(request(
            1,
            "initialize",
            json!({
                "protocolVersion": 1,
                "clientCapabilities": {
                    "fs": { "readTextFile": true, "writeTextFile": true },
                    "terminal": false
                }
            }),
        ));
        wait_for_reply(&replies, 1, REPLY_BUDGET);

        say(request(
            2,
            "session/new",
            json!({ "cwd": repo, "mcpServers": [] }),
        ));
        let started = wait_for_reply(&replies, 2, REPLY_BUDGET);
        let session = started["result"]["sessionId"]
            .as_str()
            .unwrap_or_default()
            .to_owned();

        if let Some((config_id, value)) = option_worth_switching(&started["result"]) {
            say(request(
                3,
                "session/set_config_option",
                json!({ "sessionId": session, "configId": config_id, "value": value }),
            ));
            wait_for_reply(&replies, 3, REPLY_BUDGET);
        }

        let text = std::env::args().nth(2).unwrap_or_else(|| PROMPT.to_owned());
        say(request(
            4,
            "session/prompt",
            json!({ "sessionId": session, "prompt": [{ "type": "text", "text": text }] }),
        ));
        wait_for_reply(&replies, 4, TURN_BUDGET);
        close_stdin_so_the_adapter_exits_on_its_own(&stdin);
    });

    let _ = child.wait();
    Ok(())
}

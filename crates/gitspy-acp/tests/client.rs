use gitspy_acp::{
    AcpClient, AgentEvent, Attachment, FsBridge, TerminalBridge, TerminalExit, TerminalOutput,
};
use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::time::Duration;

struct TempFs {
    written: mpsc::Sender<(String, String)>,
}

impl FsBridge for TempFs {
    fn read(&mut self, _path: &str) -> Result<String, String> {
        Ok(String::new())
    }
    fn write(&mut self, path: &str, content: &str) -> Result<(), String> {
        self.written
            .send((path.into(), content.into()))
            .map_err(|e| e.to_string())
    }
}

type Created = (String, Vec<String>, Vec<(String, String)>, Option<u64>);

struct TestTerminals {
    created: mpsc::Sender<Created>,
}

impl TerminalBridge for TestTerminals {
    fn create(
        &mut self,
        command: &str,
        args: &[String],
        _cwd: Option<&str>,
        env: &[(String, String)],
        limit: Option<u64>,
    ) -> Result<String, String> {
        self.created
            .send((command.to_owned(), args.to_vec(), env.to_vec(), limit))
            .map_err(|e| e.to_string())?;
        Ok("t1".to_owned())
    }
    fn output(&mut self, _id: &str) -> Result<TerminalOutput, String> {
        Ok(TerminalOutput {
            output: "ok".to_owned(),
            truncated: false,
            exit: Some(TerminalExit {
                code: Some(0),
                signal: None,
            }),
        })
    }
    fn wait(&mut self, _id: &str) -> Result<TerminalExit, String> {
        Ok(TerminalExit {
            code: Some(0),
            signal: None,
        })
    }
    fn kill(&mut self, _id: &str) -> Result<(), String> {
        Ok(())
    }
    fn release(&mut self, _id: &str) -> Result<(), String> {
        Ok(())
    }
}

fn fixture() -> String {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures/mock-agent.mjs")
        .to_string_lossy()
        .into_owned()
}

fn spawned(
    terminals: Box<dyn TerminalBridge>,
) -> (
    AcpClient,
    mpsc::Receiver<AgentEvent>,
    mpsc::Receiver<(String, String)>,
) {
    let (ev_tx, ev_rx) = mpsc::channel();
    let (fs_tx, fs_rx) = mpsc::channel();
    let mut client = AcpClient::spawn(
        "node",
        &[fixture()],
        &PathBuf::from("/tmp"),
        &[],
        Box::new(move |e| {
            let _ = ev_tx.send(e);
        }),
        Box::new(TempFs { written: fs_tx }),
        terminals,
    )
    .expect("мок-агент должен запуститься");
    client.initialize().expect("initialize отвечает");
    (client, ev_rx, fs_rx)
}

fn start() -> (
    AcpClient,
    mpsc::Receiver<AgentEvent>,
    mpsc::Receiver<(String, String)>,
) {
    let (unused, _) = mpsc::channel();
    spawned(Box::new(TestTerminals { created: unused }))
}

fn start_with_terminals() -> (
    AcpClient,
    mpsc::Receiver<AgentEvent>,
    mpsc::Receiver<Created>,
) {
    let (created_tx, created_rx) = mpsc::channel();
    let (client, events, _) = spawned(Box::new(TestTerminals {
        created: created_tx,
    }));
    (client, events, created_rx)
}

fn drain_until<T>(
    rx: &mpsc::Receiver<AgentEvent>,
    mut pred: impl FnMut(&AgentEvent) -> Option<T>,
) -> T {
    loop {
        let ev = rx
            .recv_timeout(Duration::from_secs(5))
            .expect("событие обязано прийти");
        if let Some(v) = pred(&ev) {
            return v;
        }
    }
}

fn echoed_prompt_blocks(attach: &[Attachment]) -> String {
    let (mut client, events, _) = start();
    let started = client
        .new_session(&PathBuf::from("/tmp"))
        .expect("сессия создаётся");
    client
        .prompt(&started.session_id, "attach", attach)
        .expect("prompt уходит");
    let echoed = drain_until(&events, |e| match e {
        AgentEvent::MessageChunk { text } => Some(text.clone()),
        _ => None,
    });
    client.kill();
    echoed
}

#[test]
fn prompt_abilities_declared_by_the_agent_are_known_after_initialize() {
    let (mut client, _events, _) = start();
    let can = client.abilities();
    assert!(
        can.image,
        "живой адаптер кладёт promptCapabilities внутрь agentCapabilities, и не найдя их там, мы никогда не предложим картинку"
    );
    assert!(
        can.embedded_context,
        "содержимое файла уходит блоком только тем, кто объявил embeddedContext"
    );
    client.kill();
}

#[test]
fn an_attached_image_travels_as_an_image_block() {
    assert_eq!(
        echoed_prompt_blocks(&[Attachment::Image {
            mime: "image/png".to_owned(),
            base64: "iVBORw0KGgo=".to_owned(),
        }]),
        "image image/png iVBORw0KGgo= | text attach",
        "картинка уходит блоком image: mime и base64 лежат в mimeType и data, а не внутри resource"
    );
}

#[test]
fn an_attached_text_file_travels_as_an_embedded_resource() {
    assert_eq!(
        echoed_prompt_blocks(&[Attachment::Embedded {
            uri: "file:///tmp/note.txt".to_owned(),
            text: "две строки".to_owned(),
            mime: Some("text/plain".to_owned()),
        }]),
        "resource file:///tmp/note.txt две строки | text attach",
        "содержимое файла едет внутри resource вместе со своим uri, иначе агент не знает, что именно ему показали"
    );
}

#[test]
fn an_attached_path_travels_as_a_resource_link() {
    assert_eq!(
        echoed_prompt_blocks(&[Attachment::Link {
            uri: "file:///tmp/src".to_owned(),
            name: "src".to_owned(),
            mime: None,
            size: Some(4096),
        }]),
        "resource_link file:///tmp/src src 4096 | text attach",
        "ссылку обязаны понимать все агенты: имя и размер идут рядом с uri в самом блоке"
    );
}

#[test]
fn the_typed_text_is_the_last_block_of_the_prompt() {
    assert_eq!(
        echoed_prompt_blocks(&[
            Attachment::Link {
                uri: "file:///tmp/a".to_owned(),
                name: "a".to_owned(),
                mime: None,
                size: Some(2),
            },
            Attachment::Image {
                mime: "image/png".to_owned(),
                base64: "AA==".to_owned(),
            },
        ]),
        "resource_link file:///tmp/a a 2 | image image/png AA== | text attach",
        "вложения идут перед текстом в порядке приложения: просьба пользователя читается после того, на что она ссылается"
    );
}

#[test]
fn echo_scenario_streams_chunks_and_turn_end() {
    let (mut client, events, _) = start();
    let started = client
        .new_session(&PathBuf::from("/tmp"))
        .expect("сессия создаётся");
    client
        .prompt(&started.session_id, "echo", &[])
        .expect("prompt уходит");
    let mut text = String::new();
    let reason = drain_until(&events, |e| match e {
        AgentEvent::MessageChunk { text: t } => {
            text.push_str(t);
            None
        }
        AgentEvent::TurnEnded { stop_reason } => Some(stop_reason.clone()),
        _ => None,
    });
    assert_eq!(text, "привет мир", "чанки обязаны прийти по порядку");
    assert_eq!(reason, "end_turn", "ход завершается end_turn");
    client.kill();
}

#[test]
fn write_scenario_asks_permission_then_writes_through_bridge() {
    let (mut client, events, fs) = start();
    let started = client
        .new_session(&PathBuf::from("/tmp"))
        .expect("сессия создаётся");
    client
        .prompt(&started.session_id, "write", &[])
        .expect("prompt уходит");
    let (request_id, option) = drain_until(&events, |e| match e {
        AgentEvent::PermissionRequest {
            request_id,
            options,
            ..
        } => Some((*request_id, options[0].id.clone())),
        _ => None,
    });
    client
        .respond_permission(request_id, &option)
        .expect("ответ уходит");
    let (path, content) = fs
        .recv_timeout(Duration::from_secs(5))
        .expect("запись обязана дойти до моста");
    assert!(
        path.ends_with("demo.txt"),
        "путь из запроса агента, пришло: {path}"
    );
    assert_eq!(content, "из мока", "содержимое из запроса агента");
    drain_until(&events, |e| match e {
        AgentEvent::ToolCallUpdate { status, .. } if status == "completed" => Some(()),
        _ => None,
    });
    client.kill();
}

#[test]
fn agent_runs_its_command_through_the_client_terminal() {
    let (mut client, events, terminals) = start_with_terminals();
    let started = client
        .new_session(&PathBuf::from("/tmp"))
        .expect("сессия создаётся");
    client
        .prompt(&started.session_id, "shell", &[])
        .expect("prompt уходит");
    let (command, args, env, limit) = terminals
        .recv_timeout(Duration::from_secs(5))
        .expect("агент обязан просить терминал у клиента");
    assert_eq!(
        (command, args),
        ("echo".to_owned(), vec!["ok".to_owned()]),
        "команда и аргументы доходят без искажений"
    );
    assert_eq!(
        env,
        vec![("MARK".to_owned(), "один".to_owned())],
        "окружение приходит парами name/value и обязано дожить до запуска"
    );
    assert_eq!(
        limit,
        Some(4096),
        "лимит вывода объявляет агент, и придумывать свой нельзя"
    );
    let with_terminal = drain_until(&events, |e| match e {
        AgentEvent::ToolCall {
            terminal_id: Some(id),
            ..
        } => Some(id.clone()),
        _ => None,
    });
    assert_eq!(
        with_terminal, "t1",
        "карточка инструмента знает свой терминал"
    );
    client.kill();
}

#[test]
fn the_terminal_answers_reach_the_agent_under_the_documented_names() {
    let (mut client, events, _terminals) = start_with_terminals();
    let started = client
        .new_session(&PathBuf::from("/tmp"))
        .expect("сессия создаётся");
    client
        .prompt(&started.session_id, "shell", &[])
        .expect("prompt уходит");
    let echoed = drain_until(&events, |e| match e {
        AgentEvent::MessageChunk { text } => Some(text.clone()),
        _ => None,
    });
    assert_eq!(
        echoed, "exit=0 out=ok truncated=false",
        "агент читает код из exitCode, вывод из output, обрезку из truncated — имена полей часть договора"
    );
    client.kill();
}

#[test]
fn a_finished_tool_call_still_points_at_its_terminal() {
    let (mut client, events, _terminals) = start_with_terminals();
    let started = client
        .new_session(&PathBuf::from("/tmp"))
        .expect("сессия создаётся");
    client
        .prompt(&started.session_id, "shell", &[])
        .expect("prompt уходит");
    let with_terminal = drain_until(&events, |e| match e {
        AgentEvent::ToolCallUpdate {
            terminal_id: Some(id),
            ..
        } => Some(id.clone()),
        _ => None,
    });
    assert_eq!(
        with_terminal, "t1",
        "живой агент называет терминал только в обновлении карточки, и потерять его там значит потерять панель"
    );
    client.kill();
}

#[test]
fn a_command_the_agent_ran_itself_still_reaches_our_panel() {
    let (mut client, events, _terminals) = start_with_terminals();
    let started = client
        .new_session(&PathBuf::from("/tmp"))
        .expect("сессия создаётся");
    client
        .prompt(&started.session_id, "metashell", &[])
        .expect("prompt уходит");
    let printed = drain_until(&events, |e| match e {
        AgentEvent::TerminalOutput { terminal_id, bytes } if terminal_id == "t2" => {
            Some(String::from_utf8_lossy(bytes).into_owned())
        }
        _ => None,
    });
    assert_eq!(
        printed, "раз\r\nдва",
        "агент, не просивший терминала у клиента, всё равно отдаёт вывод — и панель обязана его получить"
    );
    let code = drain_until(&events, |e| match e {
        AgentEvent::TerminalExit {
            terminal_id, code, ..
        } if terminal_id == "t2" => Some(*code),
        _ => None,
    });
    assert_eq!(code, Some(0), "конец команды доходит своим кодом");
    client.kill();
}

#[test]
fn a_delegating_call_and_the_calls_made_inside_it_are_told_apart() {
    let (mut client, events, _) = start();
    let started = client
        .new_session(&PathBuf::from("/tmp"))
        .expect("сессия создаётся");
    client
        .prompt(&started.session_id, "subagent", &[])
        .expect("prompt уходит");
    let delegating = drain_until(&events, |e| match e {
        AgentEvent::ToolCall {
            id, subagent: true, ..
        } => Some(id.clone()),
        _ => None,
    });
    assert_eq!(
        delegating, "sub1",
        "субагента объявляет адаптер полем, и угадывать его по заголовку значит ловить чужие карточки"
    );
    let inside = drain_until(&events, |e| match e {
        AgentEvent::ToolCall {
            id,
            parent_id: Some(parent),
            ..
        } => Some((id.clone(), parent.clone())),
        _ => None,
    });
    assert_eq!(
        inside,
        ("inner1".to_owned(), "sub1".to_owned()),
        "вложенный вызов называет своего родителя, иначе он ложится в корень ленты рядом с ответом агента"
    );
    client.kill();
}

#[test]
fn session_start_carries_config_options() {
    let (mut client, _events, _) = start();
    let started = client
        .new_session(&PathBuf::from("/tmp"))
        .expect("сессия создаётся");
    let ids: Vec<&str> = started.config.iter().map(|o| o.id.as_str()).collect();
    assert_eq!(
        ids,
        ["mode", "model"],
        "опции сессии приходят из session/new"
    );
    let model = started
        .config
        .iter()
        .find(|o| o.category == "model")
        .expect("категория model объявлена");
    assert_eq!(model.current_value, "fable", "текущее значение читается");
    assert_eq!(model.choices.len(), 2, "варианты выбора читаются");
    client.kill();
}

#[test]
fn rich_turn_streams_thought_plan_commands_and_usage() {
    let (mut client, events, _) = start();
    let started = client
        .new_session(&PathBuf::from("/tmp"))
        .expect("сессия создаётся");
    client
        .prompt(&started.session_id, "rich", &[])
        .expect("prompt уходит");
    let mut seen: Vec<&'static str> = Vec::new();
    loop {
        let ev = events
            .recv_timeout(Duration::from_secs(5))
            .expect("событие обязано прийти");
        match ev {
            AgentEvent::Thought { text } => {
                assert_eq!(text, "думаю", "мысль приходит текстом");
                seen.push("thought");
            }
            AgentEvent::Plan { entries } => {
                assert_eq!(entries[0].status, "pending", "статус пункта плана читается");
                seen.push("plan");
            }
            AgentEvent::Commands { commands } => {
                assert_eq!(
                    commands[0].hint.as_deref(),
                    Some("период"),
                    "подсказка команды лежит в input.hint, а не рядом с описанием"
                );
                seen.push("commands");
            }
            AgentEvent::Usage {
                used, size, limits, ..
            } => {
                assert_eq!(
                    (used, size),
                    (1200, 200_000),
                    "расход контекста читается как есть"
                );
                assert!(
                    limits.is_empty(),
                    "лимиты плана приходят вендорным расширением изредка, и обычный ход их не выдумывает"
                );
                seen.push("usage");
            }
            AgentEvent::TurnEnded { .. } => break,
            _ => {}
        }
    }
    assert_eq!(
        seen,
        ["thought", "plan", "commands", "usage"],
        "ход отдаёт все виды обновлений по порядку"
    );
    client.kill();
}

#[test]
fn account_plan_limits_arrive_with_usage_and_survive_the_parse() {
    let (mut client, events, _) = start();
    let started = client
        .new_session(&PathBuf::from("/tmp"))
        .expect("сессия создаётся");
    client
        .prompt(&started.session_id, "limits", &[])
        .expect("prompt уходит");
    let limits = loop {
        match events
            .recv_timeout(Duration::from_secs(5))
            .expect("событие обязано прийти")
        {
            AgentEvent::Usage { limits, .. } => break limits,
            AgentEvent::TurnEnded { .. } => panic!("ход кончился, а расхода так и не было"),
            _ => {}
        }
    };
    match limits.as_slice() {
        [limit] => {
            assert_eq!(
                (limit.kind.as_str(), limit.status.as_str()),
                ("five_hour", "allowed"),
                "вид и статус лимита плана уносятся строками как есть"
            );
            assert_eq!(
                limit.resets_at,
                Some(1_786_116_000),
                "по времени сброса интерфейс считает, сколько осталось до конца окна"
            );
        }
        other => panic!("ожидался один лимит плана, пришло: {other:?}"),
    }
    client.kill();
}

#[test]
fn setting_a_config_option_reports_new_value() {
    let (mut client, events, _) = start();
    let started = client
        .new_session(&PathBuf::from("/tmp"))
        .expect("сессия создаётся");
    client
        .set_config(&started.session_id, "model", "opus", false)
        .expect("смена уходит");
    let value = loop {
        match events
            .recv_timeout(Duration::from_secs(5))
            .expect("событие обязано прийти")
        {
            AgentEvent::Config { options } => {
                break options
                    .iter()
                    .find(|o| o.id == "model")
                    .expect("опция на месте")
                    .current_value
                    .clone()
            }
            _ => continue,
        }
    };
    assert_eq!(value, "opus", "агент подтверждает новое значение опции");
    client.kill();
}

#[test]
fn a_mode_option_switches_through_set_mode() {
    let (mut client, events, _) = start();
    let started = client
        .new_session(&PathBuf::from("/tmp"))
        .expect("сессия создаётся");
    client
        .set_config(&started.session_id, "mode", "auto", true)
        .expect("смена уходит");
    let value = drain_until(&events, |e| match e {
        AgentEvent::Config { options } => options
            .iter()
            .find(|o| o.id == "mode")
            .map(|o| o.current_value.clone()),
        _ => None,
    });
    assert_eq!(
        value, "auto",
        "опция из старой формы modes переключается методом session/set_mode"
    );
    client.kill();
}

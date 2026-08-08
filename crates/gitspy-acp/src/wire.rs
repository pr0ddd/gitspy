use crate::{
    AgentEvent, Attachment, CommandInfo, ConfigChoice, ConfigOption, PlanEntry, PromptAbilities,
    RateLimit, TerminalExit, TerminalOutput,
};
use serde::Deserialize;
use serde_json::{json, Value};

#[derive(Deserialize)]
pub struct Envelope {
    #[serde(default)]
    pub id: Option<u64>,
    #[serde(default)]
    pub method: Option<String>,
    #[serde(default)]
    pub params: Value,
    #[serde(default)]
    pub result: Value,
    #[serde(default)]
    pub error: Value,
}

pub fn request(id: u64, method: &str, params: Value) -> Value {
    json!({ "jsonrpc": "2.0", "id": id, "method": method, "params": params })
}

pub fn response(id: u64, result: Value) -> Value {
    json!({ "jsonrpc": "2.0", "id": id, "result": result })
}

pub fn failed_response(id: u64, detail: &str) -> Value {
    json!({ "jsonrpc": "2.0", "id": id, "error": { "code": -32000, "message": detail } })
}

pub fn method_not_found(id: u64, method: &str) -> Value {
    json!({
        "jsonrpc": "2.0",
        "id": id,
        "error": { "code": -32601, "message": format!("method not found: {method}") }
    })
}

pub fn initialize_params() -> Value {
    json!({
        "protocolVersion": 1,
        "clientCapabilities": {
            "fs": { "readTextFile": true, "writeTextFile": true },
            "terminal": true,
            "_meta": { "terminal_output": true }
        }
    })
}

pub fn new_session_params(cwd: &str) -> Value {
    json!({ "cwd": cwd, "mcpServers": [] })
}

fn where_the_agent_declared_prompt_capabilities(greeting: &Value) -> &Value {
    let nested = &greeting["agentCapabilities"]["promptCapabilities"];
    if nested.is_object() {
        nested
    } else {
        &greeting["promptCapabilities"]
    }
}

pub fn prompt_abilities_of(greeting: &Value) -> PromptAbilities {
    let declared = where_the_agent_declared_prompt_capabilities(greeting);
    PromptAbilities {
        image: declared["image"] == json!(true),
        embedded_context: declared["embeddedContext"] == json!(true),
    }
}

fn named_only_when_known<T: serde::Serialize>(block: &mut Value, key: &str, known: Option<&T>) {
    if let Some(value) = known {
        block[key] = json!(value);
    }
}

fn attachment_block(attachment: &Attachment) -> Value {
    match attachment {
        Attachment::Image { mime, base64 } => {
            json!({ "type": "image", "mimeType": mime, "data": base64 })
        }
        Attachment::Embedded { uri, text, mime } => {
            let mut resource = json!({ "uri": uri, "text": text });
            named_only_when_known(&mut resource, "mimeType", mime.as_ref());
            json!({ "type": "resource", "resource": resource })
        }
        Attachment::Link {
            uri,
            name,
            mime,
            size,
        } => {
            let mut block = json!({ "type": "resource_link", "uri": uri, "name": name });
            named_only_when_known(&mut block, "mimeType", mime.as_ref());
            named_only_when_known(&mut block, "size", size.as_ref());
            block
        }
    }
}

fn blocks_with_the_text_last(text: &str, attach: &[Attachment]) -> Vec<Value> {
    attach
        .iter()
        .map(attachment_block)
        .chain(std::iter::once(json!({ "type": "text", "text": text })))
        .collect()
}

pub fn prompt_params(session: &str, text: &str, attach: &[Attachment]) -> Value {
    json!({ "sessionId": session, "prompt": blocks_with_the_text_last(text, attach) })
}

pub fn cancel_notification(session: &str) -> Value {
    json!({ "jsonrpc": "2.0", "method": "session/cancel", "params": { "sessionId": session } })
}

pub fn permission_outcome(option_id: &str) -> Value {
    json!({ "outcome": { "outcome": "selected", "optionId": option_id } })
}

pub fn set_config_params(session: &str, config_id: &str, value: &str) -> Value {
    json!({ "sessionId": session, "configId": config_id, "value": value })
}

pub fn set_mode_params(session: &str, mode_id: &str) -> Value {
    json!({ "sessionId": session, "modeId": mode_id })
}

pub fn created_terminal(id: &str) -> Value {
    json!({ "terminalId": id })
}

pub fn exit_result(exit: &TerminalExit) -> Value {
    json!({ "exitCode": exit.code, "signal": exit.signal })
}

pub fn output_result(captured: &TerminalOutput) -> Value {
    json!({
        "output": captured.output,
        "truncated": captured.truncated,
        "exitStatus": captured.exit.as_ref().map(exit_result),
    })
}

fn adapter_meta(update: &Value) -> &Value {
    &update["_meta"]["claudeCode"]
}

pub fn runs_a_subagent(update: &Value) -> bool {
    adapter_meta(update)["subagent"] == json!(true)
}

pub fn parent_tool_call_of(update: &Value) -> Option<String> {
    optional_text_field(adapter_meta(update), "parentToolUseId")
}

pub fn terminal_of(update: &Value) -> Option<String> {
    update["content"]
        .as_array()?
        .iter()
        .find(|part| part["type"] == "terminal")
        .and_then(|part| optional_text_field(part, "terminalId"))
}

fn bytes_a_terminal_would_have_printed(text: &str) -> Vec<u8> {
    let mut printed = Vec::with_capacity(text.len());
    let mut after_return = false;
    for byte in text.bytes() {
        if byte == b'\n' && !after_return {
            printed.push(b'\r');
        }
        after_return = byte == b'\r';
        printed.push(byte);
    }
    printed
}

pub fn terminal_events_of(update: &Value) -> Vec<AgentEvent> {
    let meta = &update["_meta"];
    let printed = meta
        .get("terminal_output")
        .map(|frame| AgentEvent::TerminalOutput {
            terminal_id: text_field(frame, "terminal_id"),
            bytes: bytes_a_terminal_would_have_printed(&text_field(frame, "data")),
        });
    let ended = meta
        .get("terminal_exit")
        .map(|frame| AgentEvent::TerminalExit {
            terminal_id: text_field(frame, "terminal_id"),
            code: frame["exit_code"]
                .as_i64()
                .and_then(|code| i32::try_from(code).ok()),
            signal: optional_text_field(frame, "signal"),
        });
    printed.into_iter().chain(ended).collect()
}

pub fn env_pairs(params: &Value) -> Vec<(String, String)> {
    params["env"]
        .as_array()
        .map(|items| {
            items
                .iter()
                .map(|item| (text_field(item, "name"), text_field(item, "value")))
                .collect()
        })
        .unwrap_or_default()
}

pub fn args_of(params: &Value) -> Vec<String> {
    params["args"]
        .as_array()
        .map(|items| {
            items
                .iter()
                .map(|item| item.as_str().unwrap_or_default().to_owned())
                .collect()
        })
        .unwrap_or_default()
}

pub fn text_field(value: &Value, key: &str) -> String {
    value[key].as_str().unwrap_or_default().to_owned()
}

pub fn optional_text_field(value: &Value, key: &str) -> Option<String> {
    value[key].as_str().map(|text| text.to_owned())
}

fn number_field(value: &Value, key: &str) -> u64 {
    value[key].as_u64().unwrap_or_default()
}

fn choices_of(value: &Value) -> Vec<ConfigChoice> {
    value
        .as_array()
        .map(|items| {
            items
                .iter()
                .map(|item| ConfigChoice {
                    value: text_field(item, "value"),
                    name: text_field(item, "name"),
                })
                .collect()
        })
        .unwrap_or_default()
}

fn options_declared_by_the_agent(value: &Value) -> Option<Vec<ConfigOption>> {
    let declared = value["configOptions"].as_array()?;
    Some(
        declared
            .iter()
            .map(|item| ConfigOption {
                id: text_field(item, "id"),
                name: text_field(item, "name"),
                description: optional_text_field(item, "description"),
                category: text_field(item, "category"),
                current_value: text_field(item, "currentValue"),
                choices: choices_of(&item["options"]),
                via_set_mode: false,
            })
            .collect(),
    )
}

fn mode_option_of_the_older_shape(value: &Value) -> Option<Vec<ConfigOption>> {
    let modes = &value["modes"];
    let available = modes["availableModes"].as_array()?;
    Some(vec![ConfigOption {
        id: "mode".to_owned(),
        name: String::new(),
        description: None,
        category: "mode".to_owned(),
        current_value: text_field(modes, "currentModeId"),
        choices: available
            .iter()
            .map(|item| ConfigChoice {
                value: text_field(item, "id"),
                name: text_field(item, "name"),
            })
            .collect(),
        via_set_mode: true,
    }])
}

pub fn config_options_of(value: &Value) -> Vec<ConfigOption> {
    options_declared_by_the_agent(value)
        .or_else(|| mode_option_of_the_older_shape(value))
        .unwrap_or_default()
}

pub fn plan_entries_of(value: &Value) -> Vec<PlanEntry> {
    value
        .as_array()
        .map(|items| {
            items
                .iter()
                .map(|item| PlanEntry {
                    content: text_field(item, "content"),
                    status: text_field(item, "status"),
                })
                .collect()
        })
        .unwrap_or_default()
}

pub fn commands_of(value: &Value) -> Vec<CommandInfo> {
    value
        .as_array()
        .map(|items| {
            items
                .iter()
                .map(|item| CommandInfo {
                    name: text_field(item, "name"),
                    description: text_field(item, "description"),
                    hint: optional_text_field(&item["input"], "hint"),
                })
                .collect()
        })
        .unwrap_or_default()
}

pub fn usage_of(update: &Value) -> (u64, u64, Option<f64>, Option<String>) {
    (
        number_field(update, "used"),
        number_field(update, "size"),
        update["cost"]["amount"].as_f64(),
        optional_text_field(&update["cost"], "currency"),
    )
}

fn vendor_rate_limit(update: &Value) -> &Value {
    &update["_meta"]["_claude/rateLimit"]
}

pub fn rate_limits_of(update: &Value) -> Vec<RateLimit> {
    let announced = vendor_rate_limit(update);
    optional_text_field(announced, "rateLimitType")
        .map(|kind| RateLimit {
            kind,
            resets_at: announced["resetsAt"].as_i64(),
            used_share: None,
            status: text_field(announced, "status"),
        })
        .into_iter()
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_client_declares_it_runs_terminals_for_the_agent() {
        let declared = initialize_params();
        assert_eq!(
            declared["clientCapabilities"]["terminal"],
            json!(true),
            "с terminal:false агент запускает команды своим инструментом, и вывод идёт мимо нашей панели"
        );
    }

    #[test]
    fn the_client_asks_for_the_output_of_commands_the_agent_runs_itself() {
        let declared = initialize_params();
        assert_eq!(
            declared["clientCapabilities"]["_meta"]["terminal_output"],
            json!(true),
            "живой адаптер запускает Bash сам и отдаёт его вывод только тому, кто об этом попросил"
        );
    }

    #[test]
    fn prompt_abilities_are_read_from_the_nested_shape_the_live_adapter_sends() {
        let declared = prompt_abilities_of(&json!({
            "protocolVersion": 1,
            "agentCapabilities": {
                "promptCapabilities": { "image": true, "embeddedContext": true },
                "loadSession": true
            }
        }));
        assert!(
            declared.image && declared.embedded_context,
            "claude-agent-acp@0.66.0 объявляет возможности промпта внутри agentCapabilities, и читая только корень, мы решим, что он не умеет ничего"
        );
    }

    #[test]
    fn prompt_abilities_are_read_from_the_flat_shape_of_the_schema() {
        let declared = prompt_abilities_of(&json!({
            "protocolVersion": 1,
            "promptCapabilities": { "image": true, "embeddedContext": false }
        }));
        assert!(
            declared.image,
            "по схеме возможности промпта лежат в корне ответа, и агента такой формы мы обязаны понимать тоже"
        );
        assert!(
            !declared.embedded_context,
            "объявленный false остаётся false"
        );
    }

    #[test]
    fn an_ability_the_agent_never_named_is_not_assumed() {
        let silent = prompt_abilities_of(&json!({ "protocolVersion": 1 }));
        assert!(
            !silent.image && !silent.embedded_context,
            "предложив невозможное, мы получим отказ агента вместо вложения: чего не объявлено, того нет"
        );
    }

    #[test]
    fn a_link_without_mime_and_size_carries_no_empty_fields() {
        let params = prompt_params(
            "s1",
            "смотри",
            &[crate::Attachment::Link {
                uri: "file:///tmp/src".to_owned(),
                name: "src".to_owned(),
                mime: None,
                size: None,
            }],
        );
        let link = &params["prompt"][0];
        assert!(
            link.get("mimeType").is_none() && link.get("size").is_none(),
            "неизвестное не отправляется вовсе: null в этих полях агент разбирает как нарушение схемы"
        );
    }

    #[test]
    fn output_of_a_command_the_agent_ran_itself_arrives_through_the_meta_channel() {
        let events = terminal_events_of(&json!({
            "toolCallId": "t1",
            "sessionUpdate": "tool_call_update",
            "_meta": { "terminal_output": { "terminal_id": "t1", "data": "раз\nдва" } }
        }));
        match events.as_slice() {
            [crate::AgentEvent::TerminalOutput { terminal_id, bytes }] => {
                assert_eq!(terminal_id, "t1", "кадр вывода находит свою панель по id");
                assert_eq!(
                    String::from_utf8_lossy(bytes),
                    "раз\r\nдва",
                    "вывод собран из трубы, а не из PTY: без возврата каретки панель печатает лесенкой"
                );
            }
            other => panic!("ожидался один кадр вывода, пришло: {other:?}"),
        }
    }

    #[test]
    fn the_end_of_a_command_the_agent_ran_itself_carries_its_code() {
        let events = terminal_events_of(&json!({
            "toolCallId": "t1",
            "sessionUpdate": "tool_call_update",
            "status": "completed",
            "_meta": { "terminal_exit": { "terminal_id": "t1", "exit_code": 3, "signal": null } }
        }));
        match events.as_slice() {
            [crate::AgentEvent::TerminalExit {
                terminal_id,
                code,
                signal,
            }] => {
                assert_eq!(terminal_id, "t1", "конец команды находит свою карточку");
                assert_eq!(*code, Some(3), "код выхода приходит числом в exit_code");
                assert_eq!(*signal, None, "сигнала не было, и выдумывать его нельзя");
            }
            other => panic!("ожидался один конец команды, пришло: {other:?}"),
        }
    }

    #[test]
    fn an_update_without_terminal_meta_brings_no_terminal_events() {
        assert!(
            terminal_events_of(&json!({ "toolCallId": "t1", "status": "completed" })).is_empty(),
            "обычная карточка инструмента панели не заводит и байтов не шлёт"
        );
    }

    #[test]
    fn a_tool_call_names_its_terminal_through_the_content_block() {
        assert_eq!(
            terminal_of(&json!({
                "toolCallId": "t1",
                "content": [{ "type": "terminal", "terminalId": "term_7" }]
            }))
            .as_deref(),
            Some("term_7"),
            "панель находит свои байты по terminalId из содержимого карточки"
        );
        assert_eq!(
            terminal_of(&json!({
                "toolCallId": "t1",
                "content": [{ "type": "content", "content": { "type": "text", "text": "ok" } }]
            })),
            None,
            "обычная карточка инструмента панели не заводит"
        );
        assert_eq!(
            terminal_of(&json!({ "toolCallId": "t1", "content": null })),
            None,
            "живой агент шлёт content: null в обновлениях, и разбор не должен на этом падать"
        );
    }

    #[test]
    fn a_delegating_tool_call_is_marked_by_the_adapter_itself() {
        assert!(
            runs_a_subagent(&json!({
                "toolCallId": "sub1",
                "title": "Task",
                "kind": "think",
                "_meta": { "claudeCode": { "toolName": "Agent", "subagent": true } }
            })),
            "поручение подзадачи объявлено полем, и по нему собирается вложенная стенограмма"
        );
        assert!(
            !runs_a_subagent(&json!({ "toolCallId": "t1", "title": "Task", "kind": "think" })),
            "заголовок и вид карточки задаёт агент: приняв их за признак, мы свернули бы обычный инструмент в чужую стенограмму"
        );
    }

    #[test]
    fn a_call_made_inside_a_subagent_names_the_call_that_started_it() {
        assert_eq!(
            parent_tool_call_of(&json!({
                "toolCallId": "inner1",
                "_meta": { "claudeCode": { "toolName": "Bash", "parentToolUseId": "sub1" } }
            }))
            .as_deref(),
            Some("sub1"),
            "вложенный вызов находит свою стенограмму по id того вызова, который его породил"
        );
        assert_eq!(
            parent_tool_call_of(&json!({ "toolCallId": "t1", "title": "Edit" })),
            None,
            "инструмент самого агента родителя не называет и остаётся в корне ленты"
        );
    }

    #[test]
    fn the_environment_of_a_terminal_arrives_as_name_and_value_pairs() {
        assert_eq!(
            env_pairs(&json!({ "env": [{ "name": "MARK", "value": "один" }] })),
            vec![("MARK".to_owned(), "один".to_owned())],
            "склеив пары не туда, мы запустили бы команду в чужом окружении"
        );
        assert!(
            env_pairs(&json!({ "command": "echo" })).is_empty(),
            "окружение необязательно"
        );
    }

    #[test]
    fn cancelling_a_turn_is_a_notification_the_agent_never_answers() {
        let sent = cancel_notification("s1");
        assert_eq!(sent["method"], "session/cancel");
        assert_eq!(sent["params"]["sessionId"], "s1");
        assert!(
            sent.get("id").is_none(),
            "с id отмена заняла бы место в ожиданиях и съела ответ чужого хода"
        );
    }

    #[test]
    fn declared_config_options_win_over_the_older_modes_shape() {
        let both = json!({
            "sessionId": "s1",
            "modes": {
                "currentModeId": "auto",
                "availableModes": [{ "id": "auto", "name": "Auto" }]
            },
            "configOptions": [{
                "id": "model",
                "name": "Model",
                "description": null,
                "category": "model",
                "type": "select",
                "currentValue": "opus",
                "options": [{ "value": "opus", "name": "Opus" }, { "value": "haiku", "name": "Haiku" }]
            }]
        });
        let parsed = config_options_of(&both);
        assert_eq!(
            parsed.iter().map(|o| o.id.as_str()).collect::<Vec<_>>(),
            vec!["model"],
            "живой адаптер отдаёт обе формы разом, и старая не должна подменять новую"
        );
        assert!(
            !parsed[0].via_set_mode,
            "объявленная опция переключается методом session/set_config_option"
        );
        assert_eq!(
            parsed[0].description, None,
            "описание приходит null и остаётся пустым, а не строкой \"null\""
        );
    }

    #[test]
    fn the_older_modes_shape_becomes_a_mode_option_switched_by_set_mode() {
        let old = json!({
            "sessionId": "s1",
            "modes": {
                "currentModeId": "plan",
                "availableModes": [
                    { "id": "plan", "name": "Plan Mode" },
                    { "id": "auto", "name": "Auto" }
                ]
            }
        });
        let parsed = config_options_of(&old);
        assert_eq!(parsed.len(), 1, "старая форма даёт ровно одну опцию режима");
        assert_eq!(
            parsed[0].category, "mode",
            "категория задана нами, её в старой форме нет"
        );
        assert_eq!(
            parsed[0].current_value, "plan",
            "текущий режим переезжает в текущее значение"
        );
        assert_eq!(
            parsed[0]
                .choices
                .iter()
                .map(|c| c.value.as_str())
                .collect::<Vec<_>>(),
            vec!["plan", "auto"],
            "идентификатор режима становится значением выбора"
        );
        assert!(
            parsed[0].via_set_mode,
            "у агента старой формы метода session/set_config_option нет"
        );
        assert!(
            parsed[0].name.is_empty(),
            "имени у группы в старой форме нет, а придумывать видимый текст в Rust нельзя"
        );
    }

    #[test]
    fn an_option_without_a_category_survives_the_parse() {
        let uncategorised = json!({
            "configOptions": [{
                "id": "agent",
                "name": "Agent",
                "type": "select",
                "currentValue": "default",
                "options": [{ "value": "default", "name": "Default" }]
            }]
        });
        let parsed = config_options_of(&uncategorised);
        assert_eq!(
            parsed[0].category, "",
            "категория необязательна по схеме, и живой Claude Code шлёт опцию agent без неё"
        );
    }

    #[test]
    fn a_command_hint_is_read_from_the_input_block() {
        let commands = json!([
            { "name": "usage", "description": "Show usage", "input": { "hint": "период" } },
            { "name": "compact", "description": "Compact", "input": null }
        ]);
        let parsed = commands_of(&commands);
        assert_eq!(
            parsed[0].hint.as_deref(),
            Some("период"),
            "подсказка лежит внутри input, рядом с описанием её нет"
        );
        assert_eq!(
            parsed[1].hint, None,
            "команда без входа приходит с input: null и не должна ронять разбор"
        );
    }

    #[test]
    fn usage_reads_the_window_and_the_optional_cost() {
        let (used, size, cost, currency) = usage_of(
            &json!({ "used": 34762, "size": 1000000, "cost": { "amount": 0.21, "currency": "USD" } }),
        );
        assert_eq!(
            (used, size),
            (34762, 1_000_000),
            "окно контекста читается как есть"
        );
        assert_eq!(cost, Some(0.21), "стоимость приходит числом внутри cost");
        assert_eq!(
            currency.as_deref(),
            Some("USD"),
            "валюта идёт вместе со стоимостью"
        );
        let (_, _, without, _) = usage_of(&json!({ "used": 1, "size": 2 }));
        assert_eq!(
            without, None,
            "большинство usage_update приходит без стоимости"
        );
    }

    #[test]
    fn plan_limits_of_the_account_ride_along_with_usage_in_a_vendor_extension() {
        let announced = rate_limits_of(&json!({
            "used": 34580,
            "size": 1000000,
            "_meta": {
                "_claude/rateLimit": {
                    "status": "allowed",
                    "resetsAt": 1_786_116_000i64,
                    "rateLimitType": "five_hour",
                    "overageStatus": "rejected",
                    "isUsingOverage": false
                }
            }
        }));
        match announced.as_slice() {
            [limit] => {
                assert_eq!(
                    limit.kind, "five_hour",
                    "вид лимита уносится строкой как есть: свой список видов устареет на первом же новом"
                );
                assert_eq!(
                    limit.resets_at,
                    Some(1_786_116_000),
                    "время сброса приходит секундами эпохи, из них фронт считает, сколько осталось"
                );
                assert_eq!(
                    limit.status, "allowed",
                    "статус лимита показывается рядом со временем сброса"
                );
                assert_eq!(
                    limit.used_share, None,
                    "доли израсходованного в расширении нет, и выдумывать её нельзя"
                );
            }
            other => panic!("ожидался один лимит, пришло: {other:?}"),
        }
    }

    #[test]
    fn a_usage_update_without_the_vendor_extension_brings_no_limits() {
        assert!(
            rate_limits_of(&json!({ "used": 1200, "size": 200000 })).is_empty(),
            "расширение приходит изредка, и обычный usage_update не должен заводить лимит без полей"
        );
        assert!(
            rate_limits_of(&json!({ "used": 1, "size": 2, "_meta": { "claudeCode": {} } }))
                .is_empty(),
            "чужой ключ _meta не выдаёт себя за лимит"
        );
    }
}

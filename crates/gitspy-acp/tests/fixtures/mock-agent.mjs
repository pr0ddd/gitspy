import { createInterface } from 'node:readline';

const out = (msg) => process.stdout.write(JSON.stringify(msg) + '\n');
const pending = new Map();
let nextId = 100;
const ask = (method, params) =>
  new Promise((resolve) => {
    const id = nextId++;
    pending.set(id, resolve);
    out({ jsonrpc: '2.0', id, method, params });
  });
const update = (u) => out({ jsonrpc: '2.0', method: 'session/update', params: { sessionId: 's1', update: u } });

const configOptions = [
  {
    id: 'mode',
    name: 'Mode',
    category: 'mode',
    type: 'select',
    currentValue: 'ask',
    options: [
      { value: 'ask', name: 'Ask' },
      { value: 'auto', name: 'Auto' },
    ],
  },
  {
    id: 'model',
    name: 'Model',
    category: 'model',
    type: 'select',
    currentValue: 'fable',
    options: [
      { value: 'fable', name: 'Fable 5' },
      { value: 'opus', name: 'Opus 5' },
    ],
  },
];

const shapeOf = (block) => {
  if (block.type === 'image') return `image ${block.mimeType} ${block.data}`;
  if (block.type === 'resource') return `resource ${block.resource.uri} ${block.resource.text}`;
  if (block.type === 'resource_link') return `resource_link ${block.uri} ${block.name} ${block.size}`;
  return `text ${block.text}`;
};

const scenarios = {
  attach: async (id, prompt) => {
    update({
      sessionUpdate: 'agent_message_chunk',
      content: { type: 'text', text: prompt.map(shapeOf).join(' | ') },
    });
    out({ jsonrpc: '2.0', id, result: { stopReason: 'end_turn' } });
  },
  echo: async (id) => {
    update({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'привет ' } });
    update({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'мир' } });
    out({ jsonrpc: '2.0', id, result: { stopReason: 'end_turn' } });
  },
  rich: async (id) => {
    update({ sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text: 'думаю' } });
    update({ sessionUpdate: 'plan', entries: [{ content: 'шаг', priority: 'high', status: 'pending' }] });
    update({
      sessionUpdate: 'available_commands_update',
      availableCommands: [{ name: 'usage', description: 'Show usage', input: { hint: 'период' } }],
    });
    update({ sessionUpdate: 'usage_update', used: 1200, size: 200000, cost: { amount: 0.02, currency: 'USD' } });
    out({ jsonrpc: '2.0', id, result: { stopReason: 'end_turn' } });
  },
  limits: async (id) => {
    update({
      sessionUpdate: 'usage_update',
      used: 34580,
      size: 1000000,
      _meta: {
        '_claude/rateLimit': {
          status: 'allowed',
          resetsAt: 1786116000,
          rateLimitType: 'five_hour',
          overageStatus: 'rejected',
          overageDisabledReason: 'org_level_disabled',
          isUsingOverage: false,
        },
      },
    });
    out({ jsonrpc: '2.0', id, result: { stopReason: 'end_turn' } });
  },
  shell: async (id) => {
    update({
      sessionUpdate: 'tool_call',
      toolCallId: 't1',
      title: 'Terminal',
      kind: 'execute',
      status: 'in_progress',
      content: [{ type: 'terminal', terminalId: 't1' }],
    });
    const created = await ask('terminal/create', {
      sessionId: 's1',
      command: 'echo',
      args: ['ok'],
      env: [{ name: 'MARK', value: 'один' }],
      outputByteLimit: 4096,
    });
    const terminalId = created.result.terminalId;
    const exited = await ask('terminal/wait_for_exit', { sessionId: 's1', terminalId });
    const captured = await ask('terminal/output', { sessionId: 's1', terminalId });
    await ask('terminal/release', { sessionId: 's1', terminalId });
    update({
      sessionUpdate: 'agent_message_chunk',
      content: {
        type: 'text',
        text: `exit=${exited.result.exitCode} out=${captured.result.output} truncated=${captured.result.truncated}`,
      },
    });
    update({
      sessionUpdate: 'tool_call_update',
      toolCallId: 't1',
      status: 'completed',
      content: [{ type: 'terminal', terminalId: 't1' }],
    });
    out({ jsonrpc: '2.0', id, result: { stopReason: 'end_turn' } });
  },
  metashell: async (id) => {
    update({
      sessionUpdate: 'tool_call',
      toolCallId: 't2',
      title: 'Terminal',
      kind: 'execute',
      status: 'pending',
      content: [{ type: 'terminal', terminalId: 't2' }],
      _meta: { terminal_info: { terminal_id: 't2' } },
    });
    update({
      sessionUpdate: 'tool_call_update',
      toolCallId: 't2',
      _meta: { terminal_output: { terminal_id: 't2', data: 'раз\nдва' } },
    });
    update({
      sessionUpdate: 'tool_call_update',
      toolCallId: 't2',
      status: 'completed',
      content: [{ type: 'terminal', terminalId: 't2' }],
      _meta: { terminal_exit: { terminal_id: 't2', exit_code: 0, signal: null } },
    });
    out({ jsonrpc: '2.0', id, result: { stopReason: 'end_turn' } });
  },
  subagent: async (id) => {
    update({
      _meta: { claudeCode: { toolName: 'Agent', subagent: true } },
      sessionUpdate: 'tool_call',
      toolCallId: 'sub1',
      title: 'Task',
      kind: 'think',
      status: 'pending',
      content: [],
    });
    update({
      _meta: { claudeCode: { toolName: 'Bash', parentToolUseId: 'sub1' } },
      sessionUpdate: 'tool_call',
      toolCallId: 'inner1',
      title: 'ls -la',
      kind: 'execute',
      status: 'pending',
    });
    update({
      _meta: { claudeCode: { toolName: 'Agent' } },
      sessionUpdate: 'tool_call_update',
      toolCallId: 'sub1',
      status: 'completed',
    });
    out({ jsonrpc: '2.0', id, result: { stopReason: 'end_turn' } });
  },
  write: async (id) => {
    update({ sessionUpdate: 'tool_call', toolCallId: 't1', title: 'Edit demo.txt', status: 'in_progress' });
    const perm = await ask('session/request_permission', {
      sessionId: 's1',
      toolCall: { toolCallId: 't1', title: 'Edit demo.txt' },
      options: [
        { optionId: 'allow', name: 'Разрешить', kind: 'allow_once' },
        { optionId: 'deny', name: 'Отклонить', kind: 'reject_once' },
      ],
    });
    const picked = perm.result && perm.result.outcome && perm.result.outcome.optionId;
    if (picked !== 'allow') {
      update({ sessionUpdate: 'tool_call_update', toolCallId: 't1', status: 'failed' });
      return out({ jsonrpc: '2.0', id, result: { stopReason: 'refusal' } });
    }
    await ask('fs/write_text_file', { sessionId: 's1', path: process.env.MOCK_DIR + '/demo.txt', content: 'из мока' });
    update({ sessionUpdate: 'tool_call_update', toolCallId: 't1', status: 'completed' });
    out({ jsonrpc: '2.0', id, result: { stopReason: 'end_turn' } });
  },
};

const applyConfig = (params) => {
  const option = configOptions.find((o) => o.id === params.configId);
  if (option) option.currentValue = params.value;
  return { configOptions };
};

createInterface({ input: process.stdin }).on('line', (line) => {
  const msg = JSON.parse(line);
  if (msg.method === 'initialize')
    return out({
      jsonrpc: '2.0',
      id: msg.id,
      result: {
        protocolVersion: 1,
        agentCapabilities: { promptCapabilities: { image: true, embeddedContext: true } },
      },
    });
  if (msg.method === 'session/new') return out({ jsonrpc: '2.0', id: msg.id, result: { sessionId: 's1', configOptions } });
  if (msg.method === 'session/set_config_option') {
    const result = applyConfig(msg.params);
    update({ sessionUpdate: 'config_option_update', configOptions: result.configOptions });
    return out({ jsonrpc: '2.0', id: msg.id, result });
  }
  if (msg.method === 'session/set_mode') {
    applyConfig({ configId: 'mode', value: msg.params.modeId });
    update({ sessionUpdate: 'config_option_update', configOptions });
    return out({ jsonrpc: '2.0', id: msg.id, result: {} });
  }
  if (msg.method === 'session/prompt') {
    const spoken = msg.params.prompt.filter((block) => block.type === 'text');
    return void scenarios[spoken[spoken.length - 1].text](msg.id, msg.params.prompt);
  }
  if (msg.id !== undefined && pending.has(msg.id)) {
    const resolve = pending.get(msg.id);
    pending.delete(msg.id);
    resolve(msg);
  }
});

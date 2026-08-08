import { describe, expect, it } from 'vitest';
import { applyEvent, resolvePermission, statusAfter } from './feed';
import type { FeedItem, SubagentItem } from './feed';

const transcriptAt = (items: FeedItem[], at: number): SubagentItem => {
  const item = items[at];
  if (item?.kind !== 'subagent') throw new Error(`на месте ${at} не стенограмма, а ${item?.kind}`);
  return item;
};

describe('лента агентской сессии', () => {
  it('чанки склеиваются в последний ответ агента', () => {
    let items: FeedItem[] = [{ kind: 'user', text: 'привет' }];
    items = applyEvent(items, { kind: 'messageChunk', text: 'при' });
    items = applyEvent(items, { kind: 'messageChunk', text: 'вет' });
    expect(items, 'поток чанков — один ответ, а не строка на чанк').toHaveLength(2);
    expect(items[1], 'чанки идут в тот же элемент по порядку').toEqual({
      kind: 'agent',
      text: 'привет',
    });
  });

  it('после хода агента новый ответ не приклеивается к прошлому', () => {
    let items: FeedItem[] = [];
    items = applyEvent(items, { kind: 'messageChunk', text: 'первый' });
    items = applyEvent(items, { kind: 'turnEnded', stopReason: 'end_turn' });
    items = [...items, { kind: 'user', text: 'дальше' }];
    items = applyEvent(items, { kind: 'messageChunk', text: 'второй' });
    expect(
      items.filter((item) => item.kind === 'agent'),
      'ответ следующего хода — отдельный элемент ленты',
    ).toEqual([
      { kind: 'agent', text: 'первый' },
      { kind: 'agent', text: 'второй' },
    ]);
  });

  it('мысли агента копятся отдельно от ответа', () => {
    let items: FeedItem[] = [];
    items = applyEvent(items, { kind: 'thought', text: 'ду' });
    items = applyEvent(items, { kind: 'thought', text: 'маю' });
    items = applyEvent(items, { kind: 'messageChunk', text: 'ответ' });
    expect(items, 'размышление — не часть ответа, и склеивается своим потоком').toEqual([
      { kind: 'thought', text: 'думаю' },
      { kind: 'agent', text: 'ответ' },
    ]);
  });

  it('обновление плана переписывает план хода, а не копит его', () => {
    let items: FeedItem[] = [];
    items = applyEvent(items, { kind: 'plan', entries: [{ content: 'шаг', status: 'pending' }] });
    items = applyEvent(items, {
      kind: 'plan',
      entries: [{ content: 'шаг', status: 'completed' }],
    });
    expect(items, 'агент шлёт план целиком, и это всё тот же план того же хода').toEqual([
      { kind: 'plan', entries: [{ content: 'шаг', status: 'completed' }] },
    ]);
  });

  it('план следующего хода — отдельный список', () => {
    let items: FeedItem[] = [];
    items = applyEvent(items, {
      kind: 'plan',
      entries: [{ content: 'первый', status: 'pending' }],
    });
    items = applyEvent(items, { kind: 'turnEnded', stopReason: 'end_turn' });
    items = [...items, { kind: 'user', text: 'дальше' }];
    items = applyEvent(items, {
      kind: 'plan',
      entries: [{ content: 'второй', status: 'pending' }],
    });
    expect(
      items.filter((item) => item.kind === 'plan'),
      'план прошлого хода остаётся историей, а не переписывается новым',
    ).toEqual([
      { kind: 'plan', entries: [{ content: 'первый', status: 'pending' }] },
      { kind: 'plan', entries: [{ content: 'второй', status: 'pending' }] },
    ]);
  });

  it('обновление инструмента меняет статус по id, не добавляя строк', () => {
    let items: FeedItem[] = [];
    items = applyEvent(items, {
      kind: 'toolCall',
      id: 't1',
      title: 'Edit',
      status: 'in_progress',
      terminalId: null,
      parentId: null,
      subagent: false,
    });
    items = applyEvent(items, {
      kind: 'toolCallUpdate',
      id: 't1',
      status: 'completed',
      terminalId: null,
    });
    expect(items, 'обновление находит карточку, а не заводит вторую').toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: 'tool', id: 't1', status: 'completed' });
  });

  it('обновление неизвестного инструмента ничего не портит', () => {
    const items: FeedItem[] = [
      {
        kind: 'tool',
        id: 't1',
        title: 'Edit',
        status: 'in_progress',
        terminalId: null,
        exit: null,
      },
    ];
    const after = applyEvent(items, {
      kind: 'toolCallUpdate',
      id: 'unknown',
      status: 'failed',
      terminalId: null,
    });
    expect(after, 'чужой id не трогает карточки ленты').toEqual(items);
  });

  it('чекпоинты одного oid копят пути в одном элементе', () => {
    let items: FeedItem[] = [];
    items = applyEvent(items, { kind: 'checkpoint', oid: 'abc', path: 'a.txt' });
    items = applyEvent(items, { kind: 'checkpoint', oid: 'abc', path: 'b.txt' });
    expect(items, 'откат хода — одна строка, а не строка на файл').toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: 'checkpoint', oid: 'abc', paths: ['a.txt', 'b.txt'] });
  });

  it('повторная запись того же файла не двоит путь отката', () => {
    let items: FeedItem[] = [];
    items = applyEvent(items, { kind: 'checkpoint', oid: 'abc', path: 'a.txt' });
    items = applyEvent(items, {
      kind: 'toolCall',
      id: 't1',
      title: 'Edit',
      status: 'in_progress',
      terminalId: null,
      parentId: null,
      subagent: false,
    });
    items = applyEvent(items, { kind: 'checkpoint', oid: 'abc', path: 'a.txt' });
    expect(
      items[0],
      'файл в списке отката один раз, сколько бы раз агент его ни писал',
    ).toMatchObject({ kind: 'checkpoint', paths: ['a.txt'] });
  });

  it('чекпоинт следующего хода — отдельная строка отката', () => {
    let items: FeedItem[] = [];
    items = applyEvent(items, { kind: 'checkpoint', oid: 'abc', path: 'a.txt' });
    items = applyEvent(items, { kind: 'checkpoint', oid: 'def', path: 'b.txt' });
    expect(
      items.filter((item) => item.kind === 'checkpoint'),
      'откат зовётся своим oid, иначе вернёт чужой снимок',
    ).toEqual([
      { kind: 'checkpoint', oid: 'abc', paths: ['a.txt'] },
      { kind: 'checkpoint', oid: 'def', paths: ['b.txt'] },
    ]);
  });

  it('на чистом дереве чекпоинты разных ходов не сливаются', () => {
    let items: FeedItem[] = [];
    items = applyEvent(items, { kind: 'checkpoint', oid: null, path: 'a.txt' });
    items = applyEvent(items, { kind: 'turnEnded', stopReason: 'end_turn' });
    items = [...items, { kind: 'user', text: 'дальше' }];
    items = applyEvent(items, { kind: 'checkpoint', oid: null, path: 'b.txt' });
    expect(
      items.filter((item) => item.kind === 'checkpoint'),
      'откат хода удаляет только его файлы, а не всё, что агент создал за сессию',
    ).toEqual([
      { kind: 'checkpoint', oid: null, paths: ['a.txt'] },
      { kind: 'checkpoint', oid: null, paths: ['b.txt'] },
    ]);
  });

  it('ответ на разрешение резолвит карточку', () => {
    let items: FeedItem[] = [];
    items = applyEvent(items, {
      kind: 'permission',
      requestId: 5,
      title: 'Edit demo.txt',
      options: [{ id: 'allow', label: 'Разрешить' }],
    });
    items = resolvePermission(items, 5, 'allow');
    expect(items[0]).toMatchObject({ kind: 'permission', resolved: 'allow' });
  });

  it('разрешение приходит нерешённым и резолвится только своим requestId', () => {
    let items: FeedItem[] = [];
    items = applyEvent(items, {
      kind: 'permission',
      requestId: 5,
      title: 'Edit demo.txt',
      options: [{ id: 'allow', label: 'Разрешить' }],
    });
    expect(items[0], 'кнопки видны, пока ответа нет').toMatchObject({ resolved: null });
    const other = resolvePermission(items, 6, 'allow');
    expect(other[0], 'чужой requestId не гасит кнопки нашей карточки').toMatchObject({
      resolved: null,
    });
  });

  it('карточка инструмента помнит терминал, в котором идёт команда', () => {
    const items = applyEvent([], {
      kind: 'toolCall',
      id: 't1',
      title: 'Terminal',
      status: 'in_progress',
      terminalId: 'term_1',
      parentId: null,
      subagent: false,
    });
    expect(items[0], 'панель под карточкой находит свои байты по этому имени').toMatchObject({
      kind: 'tool',
      terminalId: 'term_1',
      exit: null,
    });
  });

  it('терминал, названный только в обновлении, достаётся своей карточке', () => {
    let items: FeedItem[] = [];
    items = applyEvent(items, {
      kind: 'toolCall',
      id: 't1',
      title: 'Terminal',
      status: 'pending',
      terminalId: null,
      parentId: null,
      subagent: false,
    });
    items = applyEvent(items, {
      kind: 'toolCallUpdate',
      id: 't1',
      status: 'in_progress',
      terminalId: 'term_1',
    });
    expect(
      items[0],
      'живой агент заводит терминал уже после карточки, и потерять его значит потерять панель',
    ).toMatchObject({ kind: 'tool', status: 'in_progress', terminalId: 'term_1' });
  });

  it('обновление без терминала не стирает уже известный', () => {
    let items: FeedItem[] = [];
    items = applyEvent(items, {
      kind: 'toolCall',
      id: 't1',
      title: 'Terminal',
      status: 'in_progress',
      terminalId: 'term_1',
      parentId: null,
      subagent: false,
    });
    items = applyEvent(items, {
      kind: 'toolCallUpdate',
      id: 't1',
      status: 'completed',
      terminalId: null,
    });
    expect(items[0], 'агент шлёт content: null в половине обновлений').toMatchObject({
      terminalId: 'term_1',
      status: 'completed',
    });
  });

  it('байты терминала в ленте не оседают', () => {
    const before: FeedItem[] = [
      {
        kind: 'tool',
        id: 't1',
        title: 'Terminal',
        status: 'in_progress',
        terminalId: 'term_1',
        exit: null,
      },
    ];
    const after = applyEvent(before, {
      kind: 'terminalOutput',
      terminalId: 'term_1',
      bytes: [1, 2],
    });
    expect(after, 'кадр вывода перерисовал бы всю ленту на каждые сорок байт').toBe(before);
  });

  it('конец команды виден в карточке её терминала', () => {
    let items: FeedItem[] = [];
    items = applyEvent(items, {
      kind: 'toolCall',
      id: 't1',
      title: 'Terminal',
      status: 'in_progress',
      terminalId: 'term_1',
      parentId: null,
      subagent: false,
    });
    items = applyEvent(items, {
      kind: 'terminalExit',
      terminalId: 'term_1',
      code: 3,
      signal: null,
    });
    expect(items[0], 'провалившаяся команда обязана сказать об этом кодом').toMatchObject({
      kind: 'tool',
      exit: { code: 3, signal: null },
    });
  });

  it('конец чужого терминала соседнюю карточку не трогает', () => {
    let items: FeedItem[] = [];
    items = applyEvent(items, {
      kind: 'toolCall',
      id: 't1',
      title: 'Terminal',
      status: 'in_progress',
      terminalId: 'term_1',
      parentId: null,
      subagent: false,
    });
    items = applyEvent(items, {
      kind: 'terminalExit',
      terminalId: 'term_2',
      code: 0,
      signal: null,
    });
    expect(
      items[0],
      'команды идут подряд, и статус чужой на нашу карточку не садится',
    ).toMatchObject({ exit: null });
  });

  it('вызовы субагента лежат внутри его стенограммы, а не в корне ленты', () => {
    let items: FeedItem[] = [];
    items = applyEvent(items, {
      kind: 'toolCall',
      id: 'sub1',
      title: 'Task',
      status: 'pending',
      terminalId: null,
      parentId: null,
      subagent: true,
    });
    items = applyEvent(items, {
      kind: 'toolCall',
      id: 'in1',
      title: 'ls -la',
      status: 'pending',
      terminalId: null,
      parentId: 'sub1',
      subagent: false,
    });
    items = applyEvent(items, {
      kind: 'toolCall',
      id: 'in2',
      title: 'cat a.txt',
      status: 'pending',
      terminalId: null,
      parentId: 'sub1',
      subagent: false,
    });
    expect(items, 'работа субагента — одна строка ленты, а не десяток чужих карточек').toHaveLength(
      1,
    );
    expect(
      transcriptAt(items, 0),
      'стенограмма помнит все вызовы подзадачи по порядку',
    ).toMatchObject({
      id: 'sub1',
      title: 'Task',
      done: false,
    });
    expect(
      transcriptAt(items, 0).items.map((item) => item.kind === 'tool' && item.title),
      'счётчик карточек стенограммы считает ровно вложенные вызовы',
    ).toEqual(['ls -la', 'cat a.txt']);
  });

  it('конец подзадачи виден в её стенограмме', () => {
    let items: FeedItem[] = [];
    items = applyEvent(items, {
      kind: 'toolCall',
      id: 'sub1',
      title: 'Task',
      status: 'pending',
      terminalId: null,
      parentId: null,
      subagent: true,
    });
    expect(transcriptAt(items, 0).done, 'пока субагент работает, стенограмма не закрыта').toBe(
      false,
    );
    items = applyEvent(items, {
      kind: 'toolCallUpdate',
      id: 'sub1',
      status: 'completed',
      terminalId: null,
    });
    expect(
      transcriptAt(items, 0).done,
      'вечно бегущая подзадача врала бы о том, что агент занят',
    ).toBe(true);
  });

  it('обновление вложенного вызова находит его внутри стенограммы', () => {
    let items: FeedItem[] = [];
    items = applyEvent(items, {
      kind: 'toolCall',
      id: 'sub1',
      title: 'Task',
      status: 'pending',
      terminalId: null,
      parentId: null,
      subagent: true,
    });
    items = applyEvent(items, {
      kind: 'toolCall',
      id: 'in1',
      title: 'ls -la',
      status: 'pending',
      terminalId: null,
      parentId: 'sub1',
      subagent: false,
    });
    items = applyEvent(items, {
      kind: 'toolCallUpdate',
      id: 'in1',
      status: 'completed',
      terminalId: 'term_4',
    });
    expect(
      transcriptAt(items, 0).items[0],
      'вложенная карточка живёт своей жизнью, и её обновление обязано её найти',
    ).toMatchObject({ kind: 'tool', status: 'completed', terminalId: 'term_4' });
  });

  it('конец команды субагента виден в его вложенной карточке', () => {
    let items: FeedItem[] = [];
    items = applyEvent(items, {
      kind: 'toolCall',
      id: 'sub1',
      title: 'Task',
      status: 'pending',
      terminalId: null,
      parentId: null,
      subagent: true,
    });
    items = applyEvent(items, {
      kind: 'toolCall',
      id: 'in1',
      title: 'ls -la',
      status: 'in_progress',
      terminalId: 'term_5',
      parentId: 'sub1',
      subagent: false,
    });
    items = applyEvent(items, {
      kind: 'terminalExit',
      terminalId: 'term_5',
      code: 2,
      signal: null,
    });
    expect(
      transcriptAt(items, 0).items[0],
      'провалившаяся команда подзадачи обязана назвать код так же, как своя',
    ).toMatchObject({ exit: { code: 2, signal: null } });
  });

  it('субагент внутри субагента вкладывается, а не всплывает в корень', () => {
    let items: FeedItem[] = [];
    items = applyEvent(items, {
      kind: 'toolCall',
      id: 'sub1',
      title: 'Task',
      status: 'pending',
      terminalId: null,
      parentId: null,
      subagent: true,
    });
    items = applyEvent(items, {
      kind: 'toolCall',
      id: 'sub2',
      title: 'Task',
      status: 'pending',
      terminalId: null,
      parentId: 'sub1',
      subagent: true,
    });
    items = applyEvent(items, {
      kind: 'toolCall',
      id: 'in1',
      title: 'ls -la',
      status: 'pending',
      terminalId: null,
      parentId: 'sub2',
      subagent: false,
    });
    expect(items, 'глубина подзадач не должна разворачивать ленту обратно в плоскую').toHaveLength(
      1,
    );
    const deeper = transcriptAt(items, 0).items;
    expect(deeper).toHaveLength(1);
    expect(deeper[0]).toMatchObject({ kind: 'subagent', id: 'sub2' });
  });

  it('вызов неизвестного родителя остаётся в корне, а не пропадает', () => {
    const items = applyEvent([], {
      kind: 'toolCall',
      id: 'in1',
      title: 'ls -la',
      status: 'pending',
      terminalId: null,
      parentId: 'sub_never_seen',
      subagent: false,
    });
    expect(
      items,
      'потерянная карточка — это молча пропавшая работа агента, а не аккуратная лента',
    ).toEqual([
      {
        kind: 'tool',
        id: 'in1',
        title: 'ls -la',
        status: 'pending',
        terminalId: null,
        exit: null,
      },
    ]);
  });

  it('редьюсер не трогает прежний массив', () => {
    const items: FeedItem[] = [{ kind: 'user', text: 'привет' }];
    const after = applyEvent(items, { kind: 'messageChunk', text: 'ответ' });
    expect(items, 'лента неизменяема, иначе React не увидит новую').toEqual([
      { kind: 'user', text: 'привет' },
    ]);
    expect(after).toHaveLength(2);
  });

  it('обычный конец хода не оставляет мусора в ленте', () => {
    const items = applyEvent([{ kind: 'agent', text: 'готово' }], {
      kind: 'turnEnded',
      stopReason: 'end_turn',
    });
    expect(items, 'end_turn — это не сообщение пользователю').toEqual([
      { kind: 'agent', text: 'готово' },
    ]);
  });

  it('отмена, отказ и обрыв остаются видимыми', () => {
    expect(
      applyEvent([], { kind: 'turnEnded', stopReason: 'cancelled' }).at(-1),
      'оборванный ход объясняет себя, иначе ответ просто пропал',
    ).toEqual({ kind: 'ended', reason: 'cancelled' });
    expect(applyEvent([], { kind: 'turnEnded', stopReason: 'refusal' }).at(-1)).toEqual({
      kind: 'ended',
      reason: 'refusal',
    });
    expect(applyEvent([], { kind: 'turnEnded', stopReason: 'max_tokens' }).at(-1)).toEqual({
      kind: 'ended',
      reason: 'max_tokens',
    });
    expect(applyEvent([], { kind: 'fatal', detail: 'адаптер умер' }).at(-1)).toEqual({
      kind: 'ended',
      reason: 'адаптер умер',
    });
  });

  it('статусы сессии выводятся из событий', () => {
    expect(statusAfter({ kind: 'permission', requestId: 1, title: '', options: [] })).toBe(
      'waiting',
    );
    expect(statusAfter({ kind: 'turnEnded', stopReason: 'end_turn' })).toBe('ready');
    expect(statusAfter({ kind: 'fatal', detail: 'x' })).toBe('dead');
    expect(statusAfter({ kind: 'messageChunk', text: 'x' })).toBe('working');
    expect(
      statusAfter({
        kind: 'toolCall',
        id: 't1',
        title: 'Edit',
        status: 'in_progress',
        terminalId: null,
        parentId: null,
        subagent: false,
      }),
    ).toBe('working');
    expect(statusAfter({ kind: 'checkpoint', oid: null, path: 'a' })).toBeNull();
    expect(
      statusAfter({ kind: 'toolCallUpdate', id: 't1', status: 'completed', terminalId: null }),
    ).toBeNull();
    expect(
      statusAfter({ kind: 'terminalOutput', terminalId: 'term_1', bytes: [1] }),
      'кадр вывода терминала — не смена состояния сессии',
    ).toBeNull();
    expect(
      statusAfter({ kind: 'terminalExit', terminalId: 'term_1', code: 0, signal: null }),
      'ход не кончается на первой же команде агента',
    ).toBeNull();
  });
});

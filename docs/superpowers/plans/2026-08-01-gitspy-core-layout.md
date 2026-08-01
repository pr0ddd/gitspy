# gitspy-core: раскладка графа — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Собрать `gitspy-core` — чистую Rust-библиотеку, которая превращает топологию коммитов в раскладку графа (дорожки, цвета, сегменты рёбер), считает её полосами со снапшотами и полностью покрыта тестами.

**Architecture:** Однопроходный алгоритм над массивом «активных дорожек». Вся мутируемая память алгоритма вынесена в `LayoutState`; из него снимается `Snapshot`, из снапшота состояние восстанавливается — это делает досчёт от середины истории проверяемым равенством «целиком == по полосам». Библиотека не знает ни про диск, ни про gix, ни про пиксели: на вход индексы родителей, на выход номера дорожек, индексы цветов и логические сегменты.

**Tech Stack:** Rust 2021, `proptest` для property-based тестов. Никаких других зависимостей.

## Global Constraints

- Крейт `gitspy-core` **не имеет зависимостей от ввода-вывода, Tauri, gix и любых пиксельных величин.** Единственная зависимость в `[dependencies]` — отсутствует; `proptest` только в `[dev-dependencies]`.
- Rust edition **2021**, **MSRV 1.85**, зафиксирован через `rust-version` в манифесте. Ограничение задаёт не наш код (ему хватило бы 1.73 ради `usize::div_ceil`), а `proptest` версии 1.x, который требует 1.85.
- Цвет — **индекс** (`ColourIdx`), а не строка. Конкретные значения цветов принадлежат renderer'у. `PALETTE_LEN = 12`.
- Геометрия (шаг дорожек, радиус скругления, высота строки) в этом крейте отсутствует. Core отвечает на вопрос «какая дорожка с какой соединяется в этой строке», renderer — «в каких пикселях».
- Порядок коммитов — **новые сверху**. Инвариант входных данных: индекс родителя строго больше индекса потомка. Git это гарантирует во всех своих порядках обхода.
- Каждая задача заканчивается коммитом. Сообщения коммитов на английском, префиксы `feat:` / `test:` / `chore:`.
- **Эталон раскладки — GitKraken, а не `git log --graph`.** ASCII-граф git ужимает ширину под терминал и агрессивно переиспользует колонки — это ровно та манера, от которой мы уходим. Расхождение с выводом `git log --graph` **не является дефектом** и не должно приводить к правке алгоритма. Сверяться с ним нельзя даже как с ориентиром.

## Чем проверяется правильность раскладки

Машинного эталона для правил раскладки не существует, и это надо понимать при работе с планом.

- **Property-тесты** ловят структурные дефекты: две линии в одной дорожке, потерянное или лишнее ребро, повтор цвета среди живых линий. Это единственное, что проверяется автоматически и полностью.
- **Golden-файлы** ловят регрессии: они фиксируют текущее поведение, а не доказывают его правильность. Golden-файл, сгенерированный через `UPDATE_GOLDEN=1`, ничего не подтверждает, пока человек не прочитал его глазами.
- **Форма раскладки** проверяется только сверкой с GitKraken на одном и том же репозитории, и сделать это можно лишь на этапе 6, когда появится отрисовка. До тех пор корректность формы держится на трёх правилах из спеки: жадная раздача колонок слева, цвет за линией без переиспользования среди живых, первый родитель продолжается в дорожке коммита.

Отсюда практическое следствие для исполнителя: **если property-тест противоречит ожиданию — прав тест. Если golden-файл противоречит ожиданию — прав человек, и golden надо перегенерировать, разобравшись почему.**

---

## Структура файлов

```
Cargo.toml                       — workspace root
crates/gitspy-core/
  Cargo.toml
  src/
    lib.rs                       — re-exports, #![forbid(unsafe_code)]
    topology.rs                  — Topology, CommitIdx, валидация входа
    colour.rs                    — ColourAllocator, PALETTE_LEN
    layout.rs                    — Row, Segment, NodeKind, LaneIdx, Layout
    state.rs                     — LaneState, LayoutState, Snapshot, шаг алгоритма
    chunk.rs                     — layout(), layout_chunked()
    dump.rs                      — текстовый дамп раскладки для golden-тестов
    fixture.rs                   — разбор топологий из текста
  tests/
    golden.rs                    — golden-тесты на проверенных вручную историях
    properties.rs                — property-based тесты и инвариант «целиком == по полосам»
    fixtures/                    — .txt топологии и .golden ожидаемые дампы
```

Разделение по ответственности, а не по слоям: `state.rs` держит весь изменяемый ход алгоритма (и потому же определяет `Snapshot` — снапшот обязан быть ровно этим состоянием), `chunk.rs` только гоняет `state.rs` по диапазонам.

---

### Task 1: Каркас workspace и тип `Topology`

**Files:**
- Create: `Cargo.toml`
- Create: `crates/gitspy-core/Cargo.toml`
- Create: `crates/gitspy-core/src/lib.rs`
- Create: `crates/gitspy-core/src/topology.rs`

**Interfaces:**
- Consumes: ничего
- Produces:
  - `pub type CommitIdx = u32`
  - `pub struct Topology`
  - `Topology::new(parents: Vec<Vec<CommitIdx>>, outside_parents: Vec<u32>) -> Result<Topology, TopologyError>`
  - `Topology::len(&self) -> usize`
  - `Topology::is_empty(&self) -> bool`
  - `Topology::parents(&self, i: CommitIdx) -> &[CommitIdx]`
  - `Topology::outside_parents(&self, i: CommitIdx) -> u32`
  - `pub enum TopologyError { LengthMismatch { parents: usize, outside: usize }, ParentOutOfRange { commit: CommitIdx, parent: CommitIdx, len: usize }, ParentNotAfterChild { commit: CommitIdx, parent: CommitIdx }, DuplicateParent { commit: CommitIdx, parent: CommitIdx } }`

Дубликат родителя отбивается на входе: без этого коммит с родителями `[p, p]` даёт вырожденный сегмент `Branch { from: L, to: L }` — ответвление в собственную дорожку, которое renderer не сможет нарисовать.

`outside_parents[i]` — количество родителей коммита `i`, которых нет в загруженном наборе. Нужен, чтобы линия уходила вниз за границу окна, а не обрывалась.

- [ ] **Step 1: Создать workspace и пустой крейт**

`Cargo.toml` в корне:

```toml
[workspace]
members = ["crates/gitspy-core"]
resolver = "2"
```

`crates/gitspy-core/Cargo.toml`:

```toml
[package]
name = "gitspy-core"
version = "0.1.0"
edition = "2021"
rust-version = "1.85"

[dependencies]

[dev-dependencies]
proptest = "1"
```

`crates/gitspy-core/src/lib.rs`:

```rust
#![forbid(unsafe_code)]

pub mod topology;

pub use topology::{CommitIdx, Topology, TopologyError};
```

- [ ] **Step 2: Написать падающие тесты**

В конец `crates/gitspy-core/src/topology.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_linear_history() {
        let topo = Topology::new(vec![vec![1], vec![2], vec![]], vec![0, 0, 0]).unwrap();
        assert_eq!(topo.len(), 3);
        assert_eq!(topo.parents(0), &[1]);
        assert_eq!(topo.parents(2), &[] as &[CommitIdx]);
    }

    #[test]
    fn accepts_empty() {
        let topo = Topology::new(vec![], vec![]).unwrap();
        assert!(topo.is_empty());
    }

    #[test]
    fn records_outside_parents() {
        let topo = Topology::new(vec![vec![]], vec![1]).unwrap();
        assert_eq!(topo.outside_parents(0), 1);
    }

    #[test]
    fn rejects_parent_out_of_range() {
        let err = Topology::new(vec![vec![5]], vec![0]).unwrap_err();
        assert_eq!(
            err,
            TopologyError::ParentOutOfRange { commit: 0, parent: 5, len: 1 }
        );
    }

    #[test]
    fn rejects_parent_before_child() {
        // родитель обязан идти ПОСЛЕ потомка: parents[1] = [0] нарушает порядок
        let err = Topology::new(vec![vec![1], vec![0]], vec![0, 0]).unwrap_err();
        assert_eq!(
            err,
            TopologyError::ParentNotAfterChild { commit: 1, parent: 0 }
        );
    }

    #[test]
    fn rejects_self_parent() {
        let err = Topology::new(vec![vec![0]], vec![0]).unwrap_err();
        assert_eq!(
            err,
            TopologyError::ParentNotAfterChild { commit: 0, parent: 0 }
        );
    }

    #[test]
    fn rejects_length_mismatch() {
        let err = Topology::new(vec![vec![]], vec![]).unwrap_err();
        assert_eq!(err, TopologyError::LengthMismatch { parents: 1, outside: 0 });
    }

    #[test]
    fn rejects_duplicate_parent() {
        // [1, 1] дало бы вырожденное ответвление дорожки в саму себя
        let err = Topology::new(vec![vec![1, 1], vec![]], vec![0, 0]).unwrap_err();
        assert_eq!(err, TopologyError::DuplicateParent { commit: 0, parent: 1 });
    }
}
```

- [ ] **Step 3: Убедиться, что тесты падают**

Run: `cargo test -p gitspy-core`
Expected: FAIL — `cannot find type Topology in this scope` (файл `topology.rs` пока содержит только тесты).

- [ ] **Step 4: Написать реализацию**

В начало `crates/gitspy-core/src/topology.rs`, перед блоком тестов:

```rust
/// Индекс коммита в загруженном наборе. Ноль — самый новый.
pub type CommitIdx = u32;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TopologyError {
    LengthMismatch { parents: usize, outside: usize },
    ParentOutOfRange { commit: CommitIdx, parent: CommitIdx, len: usize },
    ParentNotAfterChild { commit: CommitIdx, parent: CommitIdx },
    DuplicateParent { commit: CommitIdx, parent: CommitIdx },
}

/// Топология загруженного участка истории. Хранит только связи, без метаданных.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Topology {
    parents: Vec<Vec<CommitIdx>>,
    outside_parents: Vec<u32>,
}

impl Topology {
    pub fn new(
        parents: Vec<Vec<CommitIdx>>,
        outside_parents: Vec<u32>,
    ) -> Result<Self, TopologyError> {
        if parents.len() != outside_parents.len() {
            return Err(TopologyError::LengthMismatch {
                parents: parents.len(),
                outside: outside_parents.len(),
            });
        }
        let len = parents.len();
        for (i, ps) in parents.iter().enumerate() {
            let commit = i as CommitIdx;
            for (j, &parent) in ps.iter().enumerate() {
                if parent as usize >= len {
                    return Err(TopologyError::ParentOutOfRange { commit, parent, len });
                }
                if parent <= commit {
                    return Err(TopologyError::ParentNotAfterChild { commit, parent });
                }
                if ps[..j].contains(&parent) {
                    return Err(TopologyError::DuplicateParent { commit, parent });
                }
            }
        }
        Ok(Self { parents, outside_parents })
    }

    pub fn len(&self) -> usize {
        self.parents.len()
    }

    pub fn is_empty(&self) -> bool {
        self.parents.is_empty()
    }

    pub fn parents(&self, i: CommitIdx) -> &[CommitIdx] {
        &self.parents[i as usize]
    }

    pub fn outside_parents(&self, i: CommitIdx) -> u32 {
        self.outside_parents[i as usize]
    }
}
```

- [ ] **Step 5: Убедиться, что тесты проходят, и закоммитить**

Run: `cargo test -p gitspy-core`
Expected: PASS, 8 тестов.

```bash
git add Cargo.toml crates/gitspy-core
git commit -m "feat(core): topology type with input validation"
```

---

### Task 2: Разбор топологий из текста

**Files:**
- Create: `crates/gitspy-core/src/fixture.rs`
- Modify: `crates/gitspy-core/src/lib.rs`

**Interfaces:**
- Consumes: `Topology`, `CommitIdx`, `TopologyError` из Task 1
- Produces:
  - `fixture::parse(src: &str) -> Result<Parsed, FixtureError>`
  - `pub struct Parsed { pub topology: Topology, pub names: Vec<String> }`
  - `pub enum FixtureError { DuplicateName { name: String }, UnknownParent { commit: String, parent: String }, ParentNotAfterChild { commit: String, parent: String }, Invalid(TopologyError) }`

Формат: одна строка на коммит, новые сверху. `имя` или `имя: родитель1, родитель2`. Родитель `?` означает родителя за границей загруженного набора. Пустые строки и строки, начинающиеся с `#`, игнорируются.

- [ ] **Step 1: Написать падающие тесты**

В конец `crates/gitspy-core/src/fixture.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_linear() {
        let p = parse("a: b\nb: c\nc\n").unwrap();
        assert_eq!(p.names, vec!["a", "b", "c"]);
        assert_eq!(p.topology.parents(0), &[1]);
        assert_eq!(p.topology.parents(1), &[2]);
        assert_eq!(p.topology.parents(2), &[] as &[CommitIdx]);
    }

    #[test]
    fn parses_merge_with_two_parents() {
        let p = parse("m: a, b\na: r\nb: r\nr\n").unwrap();
        assert_eq!(p.topology.parents(0), &[1, 2]);
    }

    #[test]
    fn ignores_comments_and_blank_lines() {
        let p = parse("# заголовок\n\na: b\n\nb\n").unwrap();
        assert_eq!(p.names, vec!["a", "b"]);
    }

    #[test]
    fn question_mark_counts_as_outside_parent() {
        let p = parse("a: ?\n").unwrap();
        assert_eq!(p.topology.parents(0), &[] as &[CommitIdx]);
        assert_eq!(p.topology.outside_parents(0), 1);
    }

    #[test]
    fn mixed_known_and_outside_parents() {
        let p = parse("m: a, ?\na\n").unwrap();
        assert_eq!(p.topology.parents(0), &[1]);
        assert_eq!(p.topology.outside_parents(0), 1);
    }

    #[test]
    fn rejects_duplicate_name() {
        let err = parse("a\na\n").unwrap_err();
        assert_eq!(err, FixtureError::DuplicateName { name: "a".into() });
    }

    #[test]
    fn rejects_unknown_parent() {
        let err = parse("a: zzz\n").unwrap_err();
        assert_eq!(
            err,
            FixtureError::UnknownParent { commit: "a".into(), parent: "zzz".into() }
        );
    }

    #[test]
    fn rejects_parent_listed_above_child() {
        let err = parse("a\nb: a\n").unwrap_err();
        assert_eq!(
            err,
            FixtureError::ParentNotAfterChild { commit: "b".into(), parent: "a".into() }
        );
    }
}
```

- [ ] **Step 2: Убедиться, что тесты падают**

Добавить `pub mod fixture;` в `lib.rs`, затем:

Run: `cargo test -p gitspy-core fixture`
Expected: FAIL — `cannot find function parse in this scope`.

- [ ] **Step 3: Написать реализацию**

В начало `crates/gitspy-core/src/fixture.rs`:

```rust
use crate::topology::{CommitIdx, Topology, TopologyError};
use std::collections::HashMap;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Parsed {
    pub topology: Topology,
    pub names: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FixtureError {
    DuplicateName { name: String },
    UnknownParent { commit: String, parent: String },
    ParentNotAfterChild { commit: String, parent: String },
    Invalid(TopologyError),
}

/// Разбирает компактное описание топологии.
///
/// ```text
/// m: a, b     # коммит m с двумя родителями
/// a: r
/// b: ?        # родитель за границей загруженного набора
/// r           # корень
/// ```
pub fn parse(src: &str) -> Result<Parsed, FixtureError> {
    let mut names: Vec<String> = Vec::new();
    let mut raw_parents: Vec<Vec<String>> = Vec::new();
    let mut outside: Vec<u32> = Vec::new();

    for line in src.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let (name, rest) = match line.split_once(':') {
            Some((n, r)) => (n.trim(), r.trim()),
            None => (line, ""),
        };
        if names.iter().any(|existing| existing == name) {
            return Err(FixtureError::DuplicateName { name: name.to_string() });
        }
        names.push(name.to_string());

        let mut known = Vec::new();
        let mut outside_count = 0u32;
        for token in rest.split(',') {
            let token = token.trim();
            if token.is_empty() {
                continue;
            }
            if token == "?" {
                outside_count += 1;
            } else {
                known.push(token.to_string());
            }
        }
        raw_parents.push(known);
        outside.push(outside_count);
    }

    let index: HashMap<&str, CommitIdx> = names
        .iter()
        .enumerate()
        .map(|(i, n)| (n.as_str(), i as CommitIdx))
        .collect();

    let mut parents: Vec<Vec<CommitIdx>> = Vec::with_capacity(raw_parents.len());
    for (i, ps) in raw_parents.iter().enumerate() {
        let mut resolved = Vec::with_capacity(ps.len());
        for p in ps {
            let Some(&idx) = index.get(p.as_str()) else {
                return Err(FixtureError::UnknownParent {
                    commit: names[i].clone(),
                    parent: p.clone(),
                });
            };
            if idx <= i as CommitIdx {
                return Err(FixtureError::ParentNotAfterChild {
                    commit: names[i].clone(),
                    parent: p.clone(),
                });
            }
            resolved.push(idx);
        }
        parents.push(resolved);
    }

    let topology = Topology::new(parents, outside).map_err(FixtureError::Invalid)?;
    Ok(Parsed { topology, names })
}
```

- [ ] **Step 4: Убедиться, что тесты проходят**

Run: `cargo test -p gitspy-core fixture`
Expected: PASS, 8 тестов.

- [ ] **Step 5: Закоммитить**

```bash
git add crates/gitspy-core/src/fixture.rs crates/gitspy-core/src/lib.rs
git commit -m "feat(core): text fixture format for topologies"
```

---

### Task 3: Распределитель цветов

**Files:**
- Create: `crates/gitspy-core/src/colour.rs`
- Modify: `crates/gitspy-core/src/lib.rs`

**Interfaces:**
- Consumes: ничего
- Produces:
  - `pub type ColourIdx = u8`
  - `pub const PALETTE_LEN: u8 = 12`
  - `pub struct ColourAllocator` (derives `Debug, Clone, PartialEq, Eq, Default`)
  - `ColourAllocator::new() -> Self`
  - `ColourAllocator::next(&mut self, live: &[ColourIdx]) -> ColourIdx`
  - `ColourAllocator::cursor(&self) -> u32`
  - `ColourAllocator::from_cursor(cursor: u32) -> Self`

`cursor()` и `from_cursor()` нужны для снапшота в Task 6 — без них состояние распределителя не восстанавливается и досчёт от середины даёт другие цвета.

Правило: курсор двигается монотонно и не откатывается на освободившийся цвет. Именно это чинит главный дефект старого движка, где `getAvailableColour` отдавал освободившийся индекс следующей же линии и две соседние по времени ветки получали один цвет.

- [ ] **Step 1: Написать падающие тесты**

В конец `crates/gitspy-core/src/colour.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn starts_at_zero() {
        let mut a = ColourAllocator::new();
        assert_eq!(a.next(&[]), 0);
    }

    #[test]
    fn advances_monotonically() {
        let mut a = ColourAllocator::new();
        assert_eq!(a.next(&[]), 0);
        assert_eq!(a.next(&[0]), 1);
        assert_eq!(a.next(&[0, 1]), 2);
    }

    #[test]
    fn does_not_reuse_a_freed_colour_immediately() {
        // Это регрессия на дефект старого движка: линия умерла, цвет освободился,
        // следующая линия получала тот же цвет и две ветки сливались визуально.
        let mut a = ColourAllocator::new();
        let first = a.next(&[]);
        assert_eq!(first, 0);
        // линия с цветом 0 умерла — живых линий нет
        let second = a.next(&[]);
        assert_ne!(second, first);
        assert_eq!(second, 1);
    }

    #[test]
    fn skips_colours_currently_in_use() {
        let mut a = ColourAllocator::from_cursor(3);
        // цвета 3 и 4 заняты живыми линиями
        assert_eq!(a.next(&[3, 4]), 5);
    }

    #[test]
    fn wraps_after_the_full_palette() {
        let mut a = ColourAllocator::from_cursor(PALETTE_LEN as u32 - 1);
        assert_eq!(a.next(&[]), PALETTE_LEN - 1);
        assert_eq!(a.next(&[]), 0);
    }

    #[test]
    fn falls_back_when_every_colour_is_live() {
        let live: Vec<ColourIdx> = (0..PALETTE_LEN).collect();
        let mut a = ColourAllocator::from_cursor(5);
        // все цвета заняты — берём позицию курсора, коллизия неизбежна
        assert_eq!(a.next(&live), 5);
        assert_eq!(a.cursor(), 6);
    }

    #[test]
    fn cursor_round_trips_through_from_cursor() {
        let mut a = ColourAllocator::new();
        a.next(&[]);
        a.next(&[0]);
        let restored = ColourAllocator::from_cursor(a.cursor());
        assert_eq!(restored, a);
    }
}
```

- [ ] **Step 2: Убедиться, что тесты падают**

Добавить `pub mod colour;` в `lib.rs`, затем:

Run: `cargo test -p gitspy-core colour`
Expected: FAIL — `cannot find type ColourAllocator in this scope`.

- [ ] **Step 3: Написать реализацию**

В начало `crates/gitspy-core/src/colour.rs`:

```rust
/// Индекс цвета в палитре. Конкретные значения цветов принадлежат renderer'у.
pub type ColourIdx = u8;

/// Размер палитры. Больше — реже совпадения соседних линий, но труднее различать оттенки.
pub const PALETTE_LEN: u8 = 12;

/// Выдаёт цвета линиям графа.
///
/// Курсор двигается только вперёд, поэтому освободившийся цвет не достаётся
/// следующей же линии — иначе две соседние по времени ветки выглядели бы одинаково.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct ColourAllocator {
    cursor: u32,
}

impl ColourAllocator {
    pub fn new() -> Self {
        Self { cursor: 0 }
    }

    pub fn from_cursor(cursor: u32) -> Self {
        Self { cursor }
    }

    pub fn cursor(&self) -> u32 {
        self.cursor
    }

    /// Выдаёт цвет, не занятый ни одной живой линией.
    ///
    /// Если занята вся палитра, возвращает позицию курсора: коллизия неизбежна,
    /// но выбор остаётся детерминированным.
    pub fn next(&mut self, live: &[ColourIdx]) -> ColourIdx {
        let palette = PALETTE_LEN as u32;
        for offset in 0..palette {
            let candidate = ((self.cursor + offset) % palette) as ColourIdx;
            if !live.contains(&candidate) {
                self.cursor = self.cursor.wrapping_add(offset + 1);
                return candidate;
            }
        }
        let candidate = (self.cursor % palette) as ColourIdx;
        self.cursor = self.cursor.wrapping_add(1);
        candidate
    }
}
```

- [ ] **Step 4: Убедиться, что тесты проходят**

Run: `cargo test -p gitspy-core colour`
Expected: PASS, 7 тестов.

- [ ] **Step 5: Закоммитить**

```bash
git add crates/gitspy-core/src/colour.rs crates/gitspy-core/src/lib.rs
git commit -m "feat(core): monotonic colour allocator"
```

---

### Task 4: Типы раскладки

**Files:**
- Create: `crates/gitspy-core/src/layout.rs`
- Modify: `crates/gitspy-core/src/lib.rs`

**Interfaces:**
- Consumes: `CommitIdx` из Task 1, `ColourIdx` из Task 3
- Produces:
  - `pub type LaneIdx = u16`
  - `pub enum NodeKind { Normal, Merge, Root, Open }`
  - `pub struct Row { pub commit: CommitIdx, pub lane: LaneIdx, pub colour: ColourIdx, pub kind: NodeKind }`
  - `pub enum Segment { Through { lane: LaneIdx, colour: ColourIdx }, Branch { from: LaneIdx, to: LaneIdx, colour: ColourIdx }, Merge { from: LaneIdx, to: LaneIdx, colour: ColourIdx } }`
  - `pub struct Layout { pub rows: Vec<Row>, pub segments: Vec<Vec<Segment>>, pub max_lane: LaneIdx }`
  - `Layout::is_empty(&self) -> bool`
  - `Layout::len(&self) -> usize`

Смысл вариантов `Segment` в пределах горизонтальной полосы одной строки:
- `Through` — вертикальная линия, проходящая строку насквозь, узла в ней нет;
- `Branch` — из узла этой строки линия уходит вбок и дальше вниз (появилась новая линия для второго родителя);
- `Merge` — линия, шедшая сверху в другой дорожке, входит вбок в узел этой строки.

`NodeKind::Open` — у коммита есть родители за границей загруженного набора и нет ни одного известного; его линия уходит вниз за край окна.

- [ ] **Step 1: Написать падающие тесты**

В конец `crates/gitspy-core/src/layout.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_layout_reports_empty() {
        let layout = Layout::default();
        assert!(layout.is_empty());
        assert_eq!(layout.len(), 0);
        assert_eq!(layout.max_lane, 0);
    }

    #[test]
    fn len_counts_rows() {
        let layout = Layout {
            rows: vec![Row { commit: 0, lane: 0, colour: 0, kind: NodeKind::Root }],
            segments: vec![vec![]],
            max_lane: 0,
        };
        assert_eq!(layout.len(), 1);
        assert!(!layout.is_empty());
    }

    #[test]
    fn segments_compare_by_value() {
        let a = Segment::Branch { from: 0, to: 1, colour: 2 };
        let b = Segment::Branch { from: 0, to: 1, colour: 2 };
        let c = Segment::Merge { from: 0, to: 1, colour: 2 };
        assert_eq!(a, b);
        assert_ne!(a, c);
    }
}
```

- [ ] **Step 2: Убедиться, что тесты падают**

Добавить `pub mod layout;` в `lib.rs`, затем:

Run: `cargo test -p gitspy-core layout`
Expected: FAIL — `cannot find type Layout in this scope`.

- [ ] **Step 3: Написать реализацию**

В начало `crates/gitspy-core/src/layout.rs`:

```rust
use crate::colour::ColourIdx;
use crate::topology::CommitIdx;

/// Номер дорожки. Ноль — крайняя левая.
pub type LaneIdx = u16;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NodeKind {
    /// Один известный родитель.
    Normal,
    /// Больше одного родителя.
    Merge,
    /// Родителей нет вовсе.
    Root,
    /// Все родители за границей загруженного набора; линия уходит вниз за край окна.
    Open,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Row {
    pub commit: CommitIdx,
    pub lane: LaneIdx,
    pub colour: ColourIdx,
    pub kind: NodeKind,
}

/// Что нарисовано в горизонтальной полосе одной строки, помимо самого узла.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Segment {
    /// Вертикаль, проходящая строку насквозь.
    Through { lane: LaneIdx, colour: ColourIdx },
    /// Из узла этой строки линия уходит вбок и дальше вниз.
    Branch { from: LaneIdx, to: LaneIdx, colour: ColourIdx },
    /// Линия из другой дорожки входит вбок в узел этой строки.
    Merge { from: LaneIdx, to: LaneIdx, colour: ColourIdx },
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Layout {
    pub rows: Vec<Row>,
    /// `segments[i]` — сегменты, пересекающие строку `i`.
    pub segments: Vec<Vec<Segment>>,
    pub max_lane: LaneIdx,
}

impl Layout {
    pub fn len(&self) -> usize {
        self.rows.len()
    }

    pub fn is_empty(&self) -> bool {
        self.rows.is_empty()
    }
}
```

- [ ] **Step 4: Убедиться, что тесты проходят**

Run: `cargo test -p gitspy-core layout`
Expected: PASS, 3 теста.

- [ ] **Step 5: Закоммитить**

```bash
git add crates/gitspy-core/src/layout.rs crates/gitspy-core/src/lib.rs
git commit -m "feat(core): layout value types"
```

---

### Task 5: Шаг алгоритма — `LayoutState`

**Files:**
- Create: `crates/gitspy-core/src/state.rs`
- Modify: `crates/gitspy-core/src/lib.rs`

**Interfaces:**
- Consumes: `Topology`, `CommitIdx` (Task 1); `ColourAllocator`, `ColourIdx` (Task 3); `Row`, `Segment`, `NodeKind`, `LaneIdx` (Task 4)
- Produces:
  - `pub struct LayoutState`
  - `LayoutState::new() -> Self`
  - `LayoutState::step(&mut self, topo: &Topology, commit: CommitIdx) -> (Row, Vec<Segment>)`
  - `LayoutState::max_lane(&self) -> LaneIdx`

Алгоритм для коммита `i`:

1. Найти крайнюю левую дорожку, ожидающую `i`. Если таких нет — занять крайнюю левую свободную и выдать ей новый цвет (это вершина линии).
2. Все остальные дорожки, ожидающие `i`, сходятся сюда: на каждую выдать `Merge` и освободить.
3. Разложить родителей: первый известный продолжается в своей дорожке; каждый следующий известный либо подхватывается дорожкой, которая его уже ожидает, либо получает новую слева; каждый родитель за границей набора открывает дорожку в состоянии `Open`.
4. Если родителей нет вовсе — дорожка освобождается, узел `Root`.

- [ ] **Step 1: Написать падающие тесты**

В конец `crates/gitspy-core/src/state.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::fixture;

    /// Прогоняет всю топологию через LayoutState, возвращая строки и сегменты.
    fn run(src: &str) -> (Vec<Row>, Vec<Vec<Segment>>) {
        let parsed = fixture::parse(src).unwrap();
        let mut state = LayoutState::new();
        let mut rows = Vec::new();
        let mut segments = Vec::new();
        for i in 0..parsed.topology.len() as CommitIdx {
            let (row, segs) = state.step(&parsed.topology, i);
            rows.push(row);
            segments.push(segs);
        }
        (rows, segments)
    }

    #[test]
    fn linear_history_stays_in_lane_zero() {
        let (rows, segs) = run("a: b\nb: c\nc\n");
        assert_eq!(rows.iter().map(|r| r.lane).collect::<Vec<_>>(), vec![0, 0, 0]);
        assert_eq!(rows.iter().map(|r| r.colour).collect::<Vec<_>>(), vec![0, 0, 0]);
        assert_eq!(rows[2].kind, NodeKind::Root);
        assert!(segs.iter().all(|s| s.is_empty()));
    }

    #[test]
    fn root_frees_its_lane() {
        let (rows, _) = run("a\n");
        assert_eq!(rows[0].kind, NodeKind::Root);
    }

    #[test]
    fn commit_with_only_outside_parents_is_open() {
        let (rows, _) = run("a: ?\n");
        assert_eq!(rows[0].kind, NodeKind::Open);
    }

    #[test]
    fn branch_takes_the_next_lane_and_a_new_colour() {
        // m ветвится на a (первый родитель, остаётся в дорожке 0) и b (уходит в дорожку 1)
        let (rows, segs) = run("m: a, b\na: r\nb: r\nr\n");
        assert_eq!(rows[0].lane, 0);
        assert_eq!(rows[0].kind, NodeKind::Merge);
        assert_eq!(segs[0], vec![Segment::Branch { from: 0, to: 1, colour: 1 }]);
        assert_eq!(rows[1].lane, 0);
        assert_eq!(rows[2].lane, 1);
        assert_eq!(rows[2].colour, 1);
    }

    #[test]
    fn converging_lane_emits_merge_and_frees_the_lane() {
        let (rows, segs) = run("m: a, b\na: r\nb: r\nr\n");
        // строка 3 — r, в неё сходятся дорожки 0 и 1
        assert_eq!(rows[3].lane, 0);
        assert_eq!(segs[3], vec![Segment::Merge { from: 1, to: 0, colour: 1 }]);
    }

    #[test]
    fn passing_lane_emits_through() {
        let (_, segs) = run("m: a, b\na: r\nb: r\nr\n");
        // строка 2 — b в дорожке 1; дорожка 0 ждёт r и проходит строку насквозь
        assert_eq!(segs[2], vec![Segment::Through { lane: 0, colour: 0 }]);
    }

    #[test]
    fn two_sequential_branches_get_different_colours() {
        // Главная регрессия: в старом движке обе ветки получали дорожку 1 и один цвет.
        // Дорожка переиспользуется — это правильно; цвет переиспользоваться не должен.
        let src = "m4: m3\nm3: m2, b1\nb1: m2\nm2: m1, a1\na1: m1\nm1\n";
        let (rows, _) = run(src);
        let b1 = rows[2];
        let a1 = rows[4];
        assert_eq!(b1.lane, 1, "первая ветка занимает дорожку 1");
        assert_eq!(a1.lane, 1, "вторая ветка переиспользует дорожку 1");
        assert_ne!(a1.colour, b1.colour, "но цвет обязан отличаться");
        assert_eq!(b1.colour, 1);
        assert_eq!(a1.colour, 2);
    }

    #[test]
    fn octopus_merge_opens_a_lane_per_extra_parent() {
        let (rows, segs) = run("m: a, b, c\na: r\nb: r\nc: r\nr\n");
        assert_eq!(rows[0].kind, NodeKind::Merge);
        assert_eq!(
            segs[0],
            vec![
                Segment::Branch { from: 0, to: 1, colour: 1 },
                Segment::Branch { from: 0, to: 2, colour: 2 },
            ]
        );
    }

    #[test]
    fn extra_parent_joins_a_lane_already_waiting_for_it() {
        // Ветка `Some(lane)`: у b второй родитель d, а дорожка 0 уже ждёт d ради a.
        // Новая дорожка не создаётся — ответвление втыкается в существующую линию,
        // поэтому и цвет у него не новый, а цвет той линии.
        let (rows, segs) = run("a: d\nb: c, d\nc\nd\n");
        assert_eq!(rows[1].lane, 1);
        assert_eq!(rows[1].colour, 1);
        assert_eq!(
            segs[1],
            vec![
                Segment::Through { lane: 0, colour: 0 },
                Segment::Branch { from: 1, to: 0, colour: 0 },
            ]
        );
    }

    #[test]
    fn outside_parent_opens_a_lane_that_runs_off_the_bottom() {
        // У m один известный родитель a и один за границей набора.
        let (rows, segs) = run("m: a, ?\na\n");
        assert_eq!(rows[0].kind, NodeKind::Merge);
        assert_eq!(segs[0], vec![Segment::Branch { from: 0, to: 1, colour: 1 }]);
        // дорожка 1 продолжает идти вниз и после того, как a стал корнем
        assert_eq!(rows[1].kind, NodeKind::Root);
        assert_eq!(segs[1], vec![Segment::Through { lane: 1, colour: 1 }]);
    }

    #[test]
    fn max_lane_tracks_the_widest_point() {
        let parsed = fixture::parse("m: a, b, c\na: r\nb: r\nc: r\nr\n").unwrap();
        let mut state = LayoutState::new();
        for i in 0..parsed.topology.len() as CommitIdx {
            state.step(&parsed.topology, i);
        }
        assert_eq!(state.max_lane(), 2);
    }
}
```

- [ ] **Step 2: Убедиться, что тесты падают**

Добавить `pub mod state;` в `lib.rs`, затем:

Run: `cargo test -p gitspy-core state`
Expected: FAIL — `cannot find type LayoutState in this scope`.

- [ ] **Step 3: Написать реализацию**

В начало `crates/gitspy-core/src/state.rs`:

```rust
use crate::colour::{ColourAllocator, ColourIdx};
use crate::layout::{LaneIdx, NodeKind, Row, Segment};
use crate::topology::{CommitIdx, Topology};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum LaneState {
    Free,
    /// Дорожка занята линией, которая спускается к этому коммиту.
    WaitingFor(CommitIdx),
    /// Дорожка занята линией, уходящей за нижнюю границу загруженного набора.
    Open,
}

/// Вся изменяемая память алгоритма раскладки.
///
/// Снапшот полосы — это ровно содержимое `LayoutState`; ничего сверх него
/// алгоритм между шагами не помнит.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LayoutState {
    pub(crate) lanes: Vec<LaneState>,
    pub(crate) colours: Vec<Option<ColourIdx>>,
    pub(crate) colour_alloc: ColourAllocator,
    pub(crate) max_lane: LaneIdx,
}

impl LayoutState {
    pub fn new() -> Self {
        Self {
            lanes: Vec::new(),
            colours: Vec::new(),
            colour_alloc: ColourAllocator::new(),
            max_lane: 0,
        }
    }

    pub fn max_lane(&self) -> LaneIdx {
        self.max_lane
    }

    fn live_colours(&self) -> Vec<ColourIdx> {
        self.lanes
            .iter()
            .zip(self.colours.iter())
            .filter(|(state, _)| !matches!(state, LaneState::Free))
            .filter_map(|(_, colour)| *colour)
            .collect()
    }

    fn first_free_lane(&mut self) -> LaneIdx {
        if let Some(idx) = self.lanes.iter().position(|l| *l == LaneState::Free) {
            return idx as LaneIdx;
        }
        self.lanes.push(LaneState::Free);
        self.colours.push(None);
        (self.lanes.len() - 1) as LaneIdx
    }

    /// Занимает свободную дорожку под новую линию и выдаёт ей цвет.
    fn open_line(&mut self, waiting_for: LaneState) -> (LaneIdx, ColourIdx) {
        let live = self.live_colours();
        let colour = self.colour_alloc.next(&live);
        let lane = self.first_free_lane();
        self.lanes[lane as usize] = waiting_for;
        self.colours[lane as usize] = Some(colour);
        self.max_lane = self.max_lane.max(lane);
        (lane, colour)
    }

    pub fn step(&mut self, topo: &Topology, commit: CommitIdx) -> (Row, Vec<Segment>) {
        let mut segments = Vec::new();

        // 1. Своя дорожка: крайняя левая из ожидающих этот коммит, иначе новая линия.
        let own_lane = match self
            .lanes
            .iter()
            .position(|l| *l == LaneState::WaitingFor(commit))
        {
            Some(idx) => idx as LaneIdx,
            None => self.open_line(LaneState::WaitingFor(commit)).0,
        };
        let colour = self.colours[own_lane as usize].expect("занятая дорожка имеет цвет");
        self.max_lane = self.max_lane.max(own_lane);

        // 2. Сегменты сквозного прохода — до того, как сходящиеся дорожки освободятся.
        for (idx, state) in self.lanes.iter().enumerate() {
            let lane = idx as LaneIdx;
            if lane == own_lane || *state == LaneState::Free {
                continue;
            }
            if *state != LaneState::WaitingFor(commit) {
                if let Some(c) = self.colours[idx] {
                    segments.push(Segment::Through { lane, colour: c });
                }
            }
        }

        // 3. Сходящиеся дорожки освобождаются, каждая даёт Merge.
        for idx in 0..self.lanes.len() {
            let lane = idx as LaneIdx;
            if lane == own_lane {
                continue;
            }
            if self.lanes[idx] == LaneState::WaitingFor(commit) {
                if let Some(c) = self.colours[idx] {
                    segments.push(Segment::Merge { from: lane, to: own_lane, colour: c });
                }
                self.lanes[idx] = LaneState::Free;
                self.colours[idx] = None;
            }
        }

        // 4. Родители.
        let known = topo.parents(commit);
        let outside = topo.outside_parents(commit);
        let total = known.len() as u32 + outside;

        let kind = if total == 0 {
            NodeKind::Root
        } else if total > 1 {
            NodeKind::Merge
        } else if known.is_empty() {
            NodeKind::Open
        } else {
            NodeKind::Normal
        };

        if total == 0 {
            self.lanes[own_lane as usize] = LaneState::Free;
            self.colours[own_lane as usize] = None;
        } else if known.is_empty() {
            // все родители за границей набора
            self.lanes[own_lane as usize] = LaneState::Open;
            for _ in 1..outside {
                let (lane, c) = self.open_line(LaneState::Open);
                segments.push(Segment::Branch { from: own_lane, to: lane, colour: c });
            }
        } else {
            self.lanes[own_lane as usize] = LaneState::WaitingFor(known[0]);
            for &parent in &known[1..] {
                let existing = self
                    .lanes
                    .iter()
                    .position(|l| *l == LaneState::WaitingFor(parent))
                    .map(|i| i as LaneIdx);
                match existing {
                    Some(lane) => {
                        let c = self.colours[lane as usize].expect("занятая дорожка имеет цвет");
                        segments.push(Segment::Branch { from: own_lane, to: lane, colour: c });
                    }
                    None => {
                        let (lane, c) = self.open_line(LaneState::WaitingFor(parent));
                        segments.push(Segment::Branch { from: own_lane, to: lane, colour: c });
                    }
                }
            }
            for _ in 0..outside {
                let (lane, c) = self.open_line(LaneState::Open);
                segments.push(Segment::Branch { from: own_lane, to: lane, colour: c });
            }
        }

        let row = Row { commit, lane: own_lane, colour, kind };
        (row, segments)
    }
}

impl Default for LayoutState {
    fn default() -> Self {
        Self::new()
    }
}
```

- [ ] **Step 4: Убедиться, что тесты проходят**

Run: `cargo test -p gitspy-core state`
Expected: PASS, 11 тестов.

Если `two_sequential_branches_get_different_colours` падает с `a1.colour == 1` — значит `live_colours()` считает освободившуюся дорожку живой либо `ColourAllocator` откатывает курсор. Проверить именно эти два места.

- [ ] **Step 5: Закоммитить**

```bash
git add crates/gitspy-core/src/state.rs crates/gitspy-core/src/lib.rs
git commit -m "feat(core): lane assignment state machine"
```

---

### Task 6: Снапшот и раскладка полосами

**Files:**
- Create: `crates/gitspy-core/src/chunk.rs`
- Modify: `crates/gitspy-core/src/state.rs`
- Modify: `crates/gitspy-core/src/lib.rs`

**Interfaces:**
- Consumes: `LayoutState` (Task 5), `Layout` (Task 4), `Topology` (Task 1)
- Produces:
  - `pub struct Snapshot` (derives `Debug, Clone, PartialEq, Eq`)
  - `LayoutState::snapshot(&self) -> Snapshot`
  - `LayoutState::resume(snapshot: Snapshot) -> Self`
  - `chunk::layout(topo: &Topology) -> Layout`
  - `chunk::layout_chunked(topo: &Topology, chunk_size: usize) -> (Layout, Vec<Snapshot>)`

`Snapshot` — отдельный тип, а не псевдоним `LayoutState`. Это сознательно: если снапшот забудет курсор цветов, тест в Task 7 упадёт. Псевдоним сделал бы проверку тавтологией.

`layout_chunked` возвращает снапшот на границе каждой полосы. Снапшот с индексом `k` — состояние после обработки строки `(k + 1) * chunk_size - 1`.

- [ ] **Step 1: Написать падающие тесты**

Создать `crates/gitspy-core/src/chunk.rs` с блоком тестов:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::fixture;

    const SRC: &str = "m4: m3\nm3: m2, b1\nb1: m2\nm2: m1, a1\na1: m1\nm1\n";

    #[test]
    fn layout_produces_a_row_per_commit() {
        let parsed = fixture::parse(SRC).unwrap();
        let l = layout(&parsed.topology);
        assert_eq!(l.len(), 6);
        assert_eq!(l.segments.len(), 6);
        assert_eq!(l.rows.iter().map(|r| r.commit).collect::<Vec<_>>(), vec![0, 1, 2, 3, 4, 5]);
    }

    #[test]
    fn layout_of_empty_topology_is_empty() {
        let topo = crate::Topology::new(vec![], vec![]).unwrap();
        assert!(layout(&topo).is_empty());
    }

    #[test]
    fn layout_records_max_lane() {
        let parsed = fixture::parse(SRC).unwrap();
        assert_eq!(layout(&parsed.topology).max_lane, 1);
    }

    #[test]
    fn chunked_returns_a_snapshot_per_boundary() {
        let parsed = fixture::parse(SRC).unwrap();
        let (_, snaps) = layout_chunked(&parsed.topology, 2);
        assert_eq!(snaps.len(), 3);
    }

    #[test]
    fn resuming_from_a_snapshot_matches_the_whole_run() {
        let parsed = fixture::parse(SRC).unwrap();
        let whole = layout(&parsed.topology);
        for chunk_size in [1usize, 2, 3, 5, 6, 100] {
            let (chunked, _) = layout_chunked(&parsed.topology, chunk_size);
            assert_eq!(chunked, whole, "разошлось при chunk_size = {chunk_size}");
        }
    }

    #[test]
    fn snapshot_round_trips() {
        let parsed = fixture::parse(SRC).unwrap();
        let mut state = crate::state::LayoutState::new();
        state.step(&parsed.topology, 0);
        state.step(&parsed.topology, 1);
        let restored = crate::state::LayoutState::resume(state.snapshot());
        assert_eq!(restored, state);
    }
}
```

- [ ] **Step 2: Убедиться, что тесты падают**

Добавить `pub mod chunk;` в `lib.rs`, затем:

Run: `cargo test -p gitspy-core chunk`
Expected: FAIL — `cannot find function layout in this scope`.

- [ ] **Step 3: Написать реализацию**

Добавить в `crates/gitspy-core/src/state.rs`, после блока `impl LayoutState`:

```rust
/// Состояние раскладки на границе полосы.
///
/// Отдельный тип, а не псевдоним `LayoutState`: тест «целиком == по полосам»
/// проверяет именно то, что снапшот ничего не забыл.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Snapshot {
    lanes: Vec<LaneState>,
    colours: Vec<Option<ColourIdx>>,
    colour_cursor: u32,
    max_lane: LaneIdx,
}

impl LayoutState {
    pub fn snapshot(&self) -> Snapshot {
        Snapshot {
            lanes: self.lanes.clone(),
            colours: self.colours.clone(),
            colour_cursor: self.colour_alloc.cursor(),
            max_lane: self.max_lane,
        }
    }

    pub fn resume(snapshot: Snapshot) -> Self {
        Self {
            lanes: snapshot.lanes,
            colours: snapshot.colours,
            colour_alloc: ColourAllocator::from_cursor(snapshot.colour_cursor),
            max_lane: snapshot.max_lane,
        }
    }
}
```

Создать `crates/gitspy-core/src/chunk.rs` (перед блоком тестов):

```rust
use crate::layout::Layout;
use crate::state::{LayoutState, Snapshot};
use crate::topology::{CommitIdx, Topology};

/// Раскладывает всю топологию за один проход.
pub fn layout(topo: &Topology) -> Layout {
    let mut state = LayoutState::new();
    let mut out = Layout::default();
    for i in 0..topo.len() as CommitIdx {
        let (row, segments) = state.step(topo, i);
        out.rows.push(row);
        out.segments.push(segments);
    }
    out.max_lane = state.max_lane();
    out
}

/// Раскладывает топологию полосами, сохраняя снапшот на границе каждой.
///
/// Результат обязан совпадать с `layout` при любом `chunk_size`.
pub fn layout_chunked(topo: &Topology, chunk_size: usize) -> (Layout, Vec<Snapshot>) {
    assert!(chunk_size > 0, "размер полосы должен быть положительным");

    let mut out = Layout::default();
    let mut snapshots = Vec::new();
    let mut state = LayoutState::new();
    let total = topo.len();

    let mut start = 0usize;
    while start < total {
        let end = (start + chunk_size).min(total);
        // Явно проходим через снапшот, чтобы полоса считалась ровно так,
        // как она считалась бы при досчёте с диска.
        state = LayoutState::resume(state.snapshot());
        for i in start..end {
            let (row, segments) = state.step(topo, i as CommitIdx);
            out.rows.push(row);
            out.segments.push(segments);
        }
        snapshots.push(state.snapshot());
        start = end;
    }

    out.max_lane = state.max_lane();
    (out, snapshots)
}
```

- [ ] **Step 4: Убедиться, что тесты проходят**

Run: `cargo test -p gitspy-core chunk`
Expected: PASS, 6 тестов.

- [ ] **Step 5: Закоммитить**

```bash
git add crates/gitspy-core/src/chunk.rs crates/gitspy-core/src/state.rs crates/gitspy-core/src/lib.rs
git commit -m "feat(core): chunked layout with resumable snapshots"
```

---

### Task 7: Текстовый дамп и golden-тесты

**Files:**
- Create: `crates/gitspy-core/src/dump.rs`
- Create: `crates/gitspy-core/tests/golden.rs`
- Create: `crates/gitspy-core/tests/fixtures/linear.txt`
- Create: `crates/gitspy-core/tests/fixtures/linear.golden`
- Create: `crates/gitspy-core/tests/fixtures/two_branches.txt`
- Create: `crates/gitspy-core/tests/fixtures/two_branches.golden`
- Create: `crates/gitspy-core/tests/fixtures/octopus.txt`
- Create: `crates/gitspy-core/tests/fixtures/octopus.golden`
- Modify: `crates/gitspy-core/src/lib.rs`

**Interfaces:**
- Consumes: `Layout`, `Row`, `Segment`, `NodeKind` (Task 4), `fixture::Parsed` (Task 2)
- Produces: `dump::render(layout: &Layout, names: &[String]) -> String`

**Про формат.** Спека упоминала ASCII-картинку. При проработке выяснилось, что строка, в которую одновременно входит `Merge` слева и выходит `Branch` вправо, в псевдографике однозначно не изображается без введения полустрок. Поэтому golden — табличный дамп: он точен, не имеет неоднозначностей и так же читаемо диффится. Картинка вернётся в renderer, где для неё есть пиксели.

Есть и вторая причина отказаться от псевдографики: она провоцирует сверять вывод с `git log --graph`, а тот раскладывает иначе и нам не эталон (см. «Чем проверяется правильность раскладки»). Табличный дамп такого соблазна не создаёт.

Формат строки: `<idx>  <name>  lane <n>  colour <n>  <Kind>  <сегменты через " | ">`, сегменты в порядке `Through`, `Merge`, `Branch`.

- [ ] **Step 1: Написать падающий тест на `dump::render`**

В конец `crates/gitspy-core/src/dump.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::{chunk, fixture};

    #[test]
    fn renders_linear_history() {
        let parsed = fixture::parse("a: b\nb: c\nc\n").unwrap();
        let l = chunk::layout(&parsed.topology);
        let text = render(&l, &parsed.names);
        assert_eq!(
            text,
            "0  a  lane 0  colour 0  Normal\n\
             1  b  lane 0  colour 0  Normal\n\
             2  c  lane 0  colour 0  Root\n"
        );
    }

    #[test]
    fn renders_segments_after_the_node() {
        let parsed = fixture::parse("m: a, b\na: r\nb: r\nr\n").unwrap();
        let l = chunk::layout(&parsed.topology);
        let text = render(&l, &parsed.names);
        let line0 = text.lines().next().unwrap();
        assert_eq!(line0, "0  m  lane 0  colour 0  Merge  branch 0>1 c1");
    }
}
```

- [ ] **Step 2: Убедиться, что тест падает**

Добавить `pub mod dump;` в `lib.rs`, затем:

Run: `cargo test -p gitspy-core dump`
Expected: FAIL — `cannot find function render in this scope`.

- [ ] **Step 3: Написать реализацию**

В начало `crates/gitspy-core/src/dump.rs`:

```rust
use crate::layout::{Layout, NodeKind, Segment};
use std::fmt::Write as _;

fn kind_name(kind: NodeKind) -> &'static str {
    match kind {
        NodeKind::Normal => "Normal",
        NodeKind::Merge => "Merge",
        NodeKind::Root => "Root",
        NodeKind::Open => "Open",
    }
}

fn segment_text(segment: &Segment) -> String {
    match segment {
        Segment::Through { lane, colour } => format!("through {lane} c{colour}"),
        Segment::Merge { from, to, colour } => format!("merge {from}>{to} c{colour}"),
        Segment::Branch { from, to, colour } => format!("branch {from}>{to} c{colour}"),
    }
}

/// Текстовый дамп раскладки для golden-тестов.
///
/// Точный и однозначный формат; псевдографика намеренно не используется,
/// потому что строка с одновременным входом merge и выходом branch в ней
/// не изображается без полустрок.
pub fn render(layout: &Layout, names: &[String]) -> String {
    let mut out = String::new();
    for (i, row) in layout.rows.iter().enumerate() {
        let name = names.get(i).map(String::as_str).unwrap_or("?");
        write!(
            out,
            "{i}  {name}  lane {}  colour {}  {}",
            row.lane,
            row.colour,
            kind_name(row.kind)
        )
        .expect("запись в String не отказывает");

        let segments = &layout.segments[i];
        if !segments.is_empty() {
            let mut ordered: Vec<&Segment> = Vec::with_capacity(segments.len());
            ordered.extend(segments.iter().filter(|s| matches!(s, Segment::Through { .. })));
            ordered.extend(segments.iter().filter(|s| matches!(s, Segment::Merge { .. })));
            ordered.extend(segments.iter().filter(|s| matches!(s, Segment::Branch { .. })));
            let rendered: Vec<String> = ordered.iter().map(|s| segment_text(s)).collect();
            write!(out, "  {}", rendered.join(" | ")).expect("запись в String не отказывает");
        }
        out.push('\n');
    }
    out
}
```

- [ ] **Step 4: Создать фикстуры и golden-тест, прогнать**

`crates/gitspy-core/tests/fixtures/linear.txt`:

```text
a: b
b: c
c
```

`crates/gitspy-core/tests/fixtures/two_branches.txt`:

```text
# две ветки подряд: дорожка переиспользуется, цвет — нет
m4: m3
m3: m2, b1
b1: m2
m2: m1, a1
a1: m1
m1
```

`crates/gitspy-core/tests/fixtures/octopus.txt`:

```text
m: a, b, c
a: r
b: r
c: r
r
```

`crates/gitspy-core/tests/golden.rs`:

```rust
use gitspy_core::{chunk, dump, fixture};
use std::path::Path;

fn check(name: &str) {
    let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures");
    let src = std::fs::read_to_string(dir.join(format!("{name}.txt")))
        .unwrap_or_else(|e| panic!("не читается {name}.txt: {e}"));
    let parsed = fixture::parse(&src).expect("фикстура разбирается");
    let layout = chunk::layout(&parsed.topology);
    let actual = dump::render(&layout, &parsed.names);

    let golden_path = dir.join(format!("{name}.golden"));
    if std::env::var("UPDATE_GOLDEN").is_ok() {
        std::fs::write(&golden_path, &actual).expect("golden записывается");
        return;
    }
    let expected = std::fs::read_to_string(&golden_path)
        .unwrap_or_else(|e| panic!("не читается {name}.golden: {e}. Первый раз — запусти с UPDATE_GOLDEN=1"));
    assert_eq!(actual, expected, "раскладка {name} разошлась с golden");
}

#[test]
fn linear() {
    check("linear");
}

#[test]
fn two_branches() {
    check("two_branches");
}

#[test]
fn octopus() {
    check("octopus");
}
```

Сгенерировать golden-файлы и **прочитать их глазами**, сверив с ожиданием, прежде чем принимать:

Run: `UPDATE_GOLDEN=1 cargo test -p gitspy-core --test golden`
Затем: `cat crates/gitspy-core/tests/fixtures/two_branches.golden`

Ожидаемое содержимое `two_branches.golden` — сверить построчно:

```text
0  m4  lane 0  colour 0  Normal
1  m3  lane 0  colour 0  Merge  branch 0>1 c1
2  b1  lane 1  colour 1  Normal  through 0 c0
3  m2  lane 0  colour 0  Merge  merge 1>0 c1 | branch 0>1 c2
4  a1  lane 1  colour 2  Normal  through 0 c0
5  m1  lane 0  colour 0  Root  merge 1>0 c2
```

Ключевое, что здесь проверяется глазами: в строке 2 цвет `c1`, в строке 4 — `c2` при той же дорожке 1.

Затем прогнать без переменной:

Run: `cargo test -p gitspy-core`
Expected: PASS, все тесты.

- [ ] **Step 5: Закоммитить**

```bash
git add crates/gitspy-core/src/dump.rs crates/gitspy-core/src/lib.rs crates/gitspy-core/tests
git commit -m "test(core): golden tests over textual layout dumps"
```

---

### Task 8: Property-based тесты

**Files:**
- Create: `crates/gitspy-core/tests/properties.rs`

**Interfaces:**
- Consumes: всё публичное API из Task 1–6
- Produces: ничего (только тесты)

Проверяемые инварианты:

1. каждому коммиту соответствует ровно одна строка, в исходном порядке;
2. в пределах одной половины строки никакие две линии не занимают одну дорожку;
3. живые линии на одной строке имеют попарно разные цвета, пока палитры хватает;
4. каждый `Merge`/`Branch` соединяет дорожку узла с другой дорожкой;
5. число ответвлений равно числу родителей минус один;
6. **линии непрерывны между строками:** ни одна не обрывается и не возникает из ниоткуда, кроме вершины линии;
7. **раскладка целиком совпадает с раскладкой по полосам при любом размере полосы.**

**Про инвариант 2 — почему «половина строки», а не просто «строка».** Дорожку нельзя делить *одновременно*, но передать её на узле можно, и таких случаев два, оба законные:

- линия приходит сверху по дорожке L и втыкается в узел (`Merge { from: L }`), а из узла отходит новая линия и уходит вниз по той же L (`Branch { to: L }`). Верх и низ строки, наложения нет;
- дорожка L проходит строку насквозь (`Through { lane: L }`), и в неё сбоку от узла втыкается ответвление (`Branch { to: L }`). Это не вторая линия, а присоединение к той же самой — потому у такого `Branch` и цвет совпадает с цветом линии L.

Наивная формулировка «дорожка упомянута в строке дважды — ошибка» отвергает оба случая и требует ломать алгоритм. Ломать нельзя: если во втором случае перестать выдавать `Through`, у вертикали появится разрыв ровно в этой строке.

- [ ] **Step 1: Написать генератор и тесты**

`crates/gitspy-core/tests/properties.rs`:

```rust
use gitspy_core::chunk;
use gitspy_core::colour::PALETTE_LEN;
use gitspy_core::layout::{Layout, NodeKind, Segment};
use gitspy_core::topology::{CommitIdx, Topology};
use proptest::prelude::*;
use proptest::strategy::BoxedStrategy;
use std::collections::HashSet;

/// Генерирует корректную топологию: у коммита i родители строго из (i+1..n).
///
/// Порядок родителей НЕ сортируется: в настоящем git первый родитель мержа
/// обычно новее второго, то есть имеет больший индекс. Отсортированный
/// генератор эту форму не порождает, а именно она в фикстуре two_branches.
///
/// Родители за границей набора генерируются тоже — иначе ветка Open
/// не проверяется вовсе.
fn arb_topology() -> impl Strategy<Value = Topology> {
    (1usize..30).prop_flat_map(|n| {
        let rows: Vec<BoxedStrategy<(Vec<CommitIdx>, u32)>> = (0..n)
            .map(|i| {
                let remaining = n - i - 1;
                let known: BoxedStrategy<Vec<CommitIdx>> = if remaining == 0 {
                    Just(Vec::<CommitIdx>::new()).boxed()
                } else {
                    proptest::collection::hash_set((i + 1)..n, 0..=3usize.min(remaining))
                        .prop_map(|set| {
                            set.into_iter().map(|x| x as CommitIdx).collect::<Vec<_>>()
                        })
                        .prop_shuffle()
                        .boxed()
                };
                (known, 0u32..2u32).boxed()
            })
            .collect();
        rows.prop_map(|rows| {
            let mut parents = Vec::with_capacity(rows.len());
            let mut outside = Vec::with_capacity(rows.len());
            for (known, outside_count) in rows {
                parents.push(known);
                outside.push(outside_count);
            }
            Topology::new(parents, outside).expect("генератор строит корректную топологию")
        })
    })
}

/// Дорожки, занятые в ВЕРХНЕЙ половине строки: дорожка узла, сквозные проходы
/// и дорожки, по которым линии приходят сверху и втыкаются в узел.
fn lanes_entering(layout: &Layout, row: usize) -> Vec<u16> {
    let mut lanes = vec![layout.rows[row].lane];
    for segment in &layout.segments[row] {
        match segment {
            Segment::Through { lane, .. } => lanes.push(*lane),
            Segment::Merge { from, .. } => lanes.push(*from),
            Segment::Branch { .. } => {}
        }
    }
    lanes
}

/// Дорожки, занятые в НИЖНЕЙ половине строки: сквозные проходы, дорожки
/// ответвлений и дорожка узла — если линия узла продолжается вниз.
///
/// Ответвление в дорожку, которая уже проходит строку насквозь, не добавляется:
/// это присоединение к той же линии, а не вторая линия на той же дорожке.
fn lanes_leaving(layout: &Layout, row: usize) -> Vec<u16> {
    let through: Vec<u16> = layout.segments[row]
        .iter()
        .filter_map(|s| match s {
            Segment::Through { lane, .. } => Some(*lane),
            _ => None,
        })
        .collect();

    let mut lanes = Vec::new();
    if layout.rows[row].kind != NodeKind::Root {
        lanes.push(layout.rows[row].lane);
    }
    lanes.extend(through.iter().copied());
    for segment in &layout.segments[row] {
        if let Segment::Branch { to, .. } = segment {
            if !through.contains(to) {
                lanes.push(*to);
            }
        }
    }
    lanes
}

fn as_set(lanes: &[u16]) -> HashSet<u16> {
    lanes.iter().copied().collect()
}

/// Коммиты, у которых есть хотя бы один потомок в загруженном наборе.
/// У остальных строка — вершина линии, и появление новой дорожки там законно.
fn commits_with_children(topo: &Topology) -> HashSet<CommitIdx> {
    let mut set = HashSet::new();
    for i in 0..topo.len() as CommitIdx {
        for &p in topo.parents(i) {
            set.insert(p);
        }
    }
    set
}

proptest! {
    #[test]
    fn every_commit_gets_exactly_one_row_in_order(topo in arb_topology()) {
        let l = chunk::layout(&topo);
        prop_assert_eq!(l.rows.len(), topo.len());
        prop_assert_eq!(l.segments.len(), topo.len());
        for (i, row) in l.rows.iter().enumerate() {
            prop_assert_eq!(row.commit, i as CommitIdx);
        }
    }

    #[test]
    fn no_two_lines_share_a_lane_in_the_same_half_row(topo in arb_topology()) {
        let l = chunk::layout(&topo);
        for row in 0..l.len() {
            for (half, lanes) in [
                ("верх", lanes_entering(&l, row)),
                ("низ", lanes_leaving(&l, row)),
            ] {
                let unique = as_set(&lanes);
                prop_assert_eq!(
                    unique.len(),
                    lanes.len(),
                    "строка {} ({}) занимает дорожку дважды: {:?}",
                    row,
                    half,
                    lanes
                );
            }
        }
    }

    #[test]
    fn live_colours_are_distinct_while_the_palette_suffices(topo in arb_topology()) {
        let l = chunk::layout(&topo);
        // Одновременно живых линий не больше, чем дорожек. Пока их меньше размера
        // палитры, запасная ветка ColourAllocator не срабатывает и коллизий быть
        // не может. Проверять при исчерпанной палитре бессмысленно: там коллизия
        // заложена и остаётся с линией навсегда.
        prop_assume!((l.max_lane as usize) + 1 < PALETTE_LEN as usize);
        for row in 0..l.len() {
            let mut colours = vec![l.rows[row].colour];
            for segment in &l.segments[row] {
                match segment {
                    Segment::Through { colour, .. } => colours.push(*colour),
                    Segment::Merge { colour, .. } => colours.push(*colour),
                    Segment::Branch { .. } => {}
                }
            }
            let unique: HashSet<u8> = colours.iter().copied().collect();
            prop_assert_eq!(
                unique.len(),
                colours.len(),
                "строка {} повторяет цвет: {:?}",
                row,
                colours
            );
        }
    }

    /// Линии непрерывны: набор дорожек, занятых внизу строки, обязан совпасть
    /// с набором занятых наверху следующей — с единственным исключением для
    /// вершины линии, где дорожка законно появляется впервые.
    ///
    /// Это машинная форма инварианта спеки «ребро доходит до настоящего родителя
    /// без разрывов»: оборванное или возникшее из ниоткуда ребро ломает равенство.
    #[test]
    fn lines_are_continuous_between_rows(topo in arb_topology()) {
        let l = chunk::layout(&topo);
        let has_children = commits_with_children(&topo);
        for row in 0..l.len().saturating_sub(1) {
            let leaving = as_set(&lanes_leaving(&l, row));
            let entering = as_set(&lanes_entering(&l, row + 1));

            for lane in leaving.difference(&entering) {
                prop_assert!(
                    false,
                    "линия на дорожке {} обрывается между строками {} и {}",
                    lane,
                    row,
                    row + 1
                );
            }

            let next = l.rows[row + 1];
            for lane in entering.difference(&leaving) {
                prop_assert_eq!(
                    *lane,
                    next.lane,
                    "в строке {} дорожка {} возникла не под узлом",
                    row + 1,
                    lane
                );
                prop_assert!(
                    !has_children.contains(&next.commit),
                    "в строке {} новая линия открыта под коммитом, у которого есть потомки",
                    row + 1
                );
            }
        }
    }

    #[test]
    fn every_edge_touches_the_node_lane(topo in arb_topology()) {
        let l = chunk::layout(&topo);
        for row in 0..l.len() {
            let node_lane = l.rows[row].lane;
            for segment in &l.segments[row] {
                match segment {
                    Segment::Merge { to, from, .. } => {
                        prop_assert_eq!(*to, node_lane);
                        prop_assert_ne!(*from, node_lane);
                    }
                    Segment::Branch { from, to, .. } => {
                        prop_assert_eq!(*from, node_lane);
                        prop_assert_ne!(*to, node_lane);
                    }
                    Segment::Through { lane, .. } => {
                        prop_assert_ne!(*lane, node_lane);
                    }
                }
            }
        }
    }

    /// Рёбра обязаны соответствовать настоящим связям, а не просто быть согласованными
    /// между собой: у коммита с N родителями ровно N-1 ответвлений, потому что первый
    /// родитель продолжается в дорожке самого коммита. Ловит и лишнее, и потерянное ребро.
    #[test]
    fn branch_count_matches_parent_count(topo in arb_topology()) {
        let l = chunk::layout(&topo);
        for row in 0..l.len() {
            let commit = l.rows[row].commit;
            let total_parents =
                topo.parents(commit).len() as u32 + topo.outside_parents(commit);
            let branches = l.segments[row]
                .iter()
                .filter(|s| matches!(s, Segment::Branch { .. }))
                .count() as u32;
            let expected = total_parents.saturating_sub(1);
            prop_assert_eq!(
                branches,
                expected,
                "коммит {} имеет {} родителей, но {} ответвлений",
                commit,
                total_parents,
                branches
            );
        }
    }

    /// Главный инвариант всей схемы с полосами и снапшотами.
    #[test]
    fn chunked_layout_equals_whole_layout(topo in arb_topology(), chunk_size in 1usize..17) {
        let whole = chunk::layout(&topo);
        let (chunked, snapshots) = chunk::layout_chunked(&topo, chunk_size);
        prop_assert_eq!(&chunked, &whole);
        let expected_snapshots = topo.len().div_ceil(chunk_size);
        prop_assert_eq!(snapshots.len(), expected_snapshots);
    }
}
```

- [ ] **Step 2: Прогнать и убедиться, что тесты проходят**

Run: `cargo test -p gitspy-core --test properties`
Expected: PASS, 7 property-тестов.

Если падает `chunked_layout_equals_whole_layout` — значит `Snapshot` не захватывает часть состояния. Сравнить поля `Snapshot` с полями `LayoutState`: расхождение и есть дефект.

Если падает любой другой — proptest выдаст минимальную топологию и запишет её в `properties.proptest-regressions`. Прогнать её через `dump::render` и разобрать вручную. **Прежде чем править алгоритм, проверь, не в формулировке ли инварианта дело:** первая редакция этого плана содержала слишком строгий инвариант 2, который отвергал два законных случая передачи дорожки, и «починка» алгоритма под него дала бы разрыв вертикали при отрисовке.

- [ ] **Step 3: Проверить, что нет предупреждений компилятора**

Run: `cargo clippy -p gitspy-core --all-targets -- -D warnings`
Expected: PASS без замечаний.

- [ ] **Step 4: Прогнать весь набор целиком**

Run: `cargo test -p gitspy-core`
Expected: PASS, все тесты Task 1–8.

- [ ] **Step 5: Закоммитить**

```bash
git add crates/gitspy-core/tests/properties.rs
git commit -m "test(core): property-based invariants including chunked equality"
```

---

## Что этот план не делает

Осознанно вне этапа 1, попадёт в следующие планы:

- чтение настоящего репозитория через `gix` (этап 2);
- бинарный кэш, `mmap`, инвалидация по refs (этап 3) — сериализация `Snapshot` появится там;
- пиксельная геометрия, скругления, аватарки (этап 6);
- сворачивание цепочек, подсветка родословной, мини-карта (этап 8) — они опираются на `Layout`, но не меняют алгоритм раскладки;
- бенчмарки с порогом в CI — ставятся на этапе 3, когда появятся настоящие истории нужного размера.

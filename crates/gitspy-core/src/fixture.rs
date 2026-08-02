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
            return Err(FixtureError::DuplicateName {
                name: name.to_string(),
            });
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
            FixtureError::UnknownParent {
                commit: "a".into(),
                parent: "zzz".into()
            }
        );
    }

    #[test]
    fn rejects_parent_listed_above_child() {
        let err = parse("a\nb: a\n").unwrap_err();
        assert_eq!(
            err,
            FixtureError::ParentNotAfterChild {
                commit: "b".into(),
                parent: "a".into()
            }
        );
    }
}

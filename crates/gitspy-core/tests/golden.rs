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
    let expected = std::fs::read_to_string(&golden_path).unwrap_or_else(|e| {
        panic!("не читается {name}.golden: {e}. Первый раз — запусти с UPDATE_GOLDEN=1")
    });
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

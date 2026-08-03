#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Stage {
    Counting,
    Compressing,
    Writing,
    Receiving,
    Resolving,
    Updating,
}

impl Stage {
    pub fn code(&self) -> &'static str {
        match self {
            Stage::Counting => "progress.counting",
            Stage::Compressing => "progress.compressing",
            Stage::Writing => "progress.writing",
            Stage::Receiving => "progress.receiving",
            Stage::Resolving => "progress.resolving",
            Stage::Updating => "progress.updating",
        }
    }

    fn share(&self) -> (u32, u32) {
        match self {
            Stage::Counting => (0, 5),
            Stage::Compressing => (5, 5),
            Stage::Writing => (10, 5),
            Stage::Receiving => (15, 65),
            Stage::Resolving => (80, 10),
            Stage::Updating => (90, 10),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Step {
    pub stage: Stage,
    pub percent: u8,
}

impl Step {
    pub fn overall(&self) -> u8 {
        let (from, width) = self.stage.share();
        (from + width * u32::from(self.percent) / 100) as u8
    }
}

fn stage_of(label: &str) -> Option<Stage> {
    match label {
        "Counting objects" => Some(Stage::Counting),
        "Compressing objects" => Some(Stage::Compressing),
        "Writing objects" => Some(Stage::Writing),
        "Receiving objects" => Some(Stage::Receiving),
        "Resolving deltas" => Some(Stage::Resolving),
        "Updating files" | "Checking out files" => Some(Stage::Updating),
        _ => None,
    }
}

pub fn parse(line: &str) -> Option<Step> {
    let line = line.trim().trim_start_matches("remote: ").trim();
    let (label, rest) = line.split_once(':')?;
    let stage = stage_of(label.trim())?;
    let percent = rest.split_once('%')?.0.trim().parse::<u8>().ok()?;

    Some(Step {
        stage,
        percent: percent.min(100),
    })
}

pub fn split_progress(chunk: &str) -> Vec<&str> {
    chunk
        .split(['\r', '\n'])
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_percent_of_a_receiving_line_is_read() {
        assert_eq!(
            parse("Receiving objects:  37% (100/270), 1.20 MiB | 500.00 KiB/s"),
            Some(Step {
                stage: Stage::Receiving,
                percent: 37
            })
        );
    }

    #[test]
    fn writing_objects_is_progress_too_because_push_reports_it() {
        assert_eq!(
            parse("Writing objects:  50% (1/2), 220 bytes | 220.00 KiB/s"),
            Some(Step {
                stage: Stage::Writing,
                percent: 50
            })
        );
    }

    #[test]
    fn a_line_prefixed_by_the_server_is_still_read() {
        assert_eq!(
            parse("remote: Compressing objects:  50% (1/2)"),
            Some(Step {
                stage: Stage::Compressing,
                percent: 50
            })
        );
    }

    #[test]
    fn a_line_without_a_percent_is_not_progress() {
        assert_eq!(parse("Cloning into 'gitspy'..."), None);
        assert_eq!(parse("remote: Enumerating objects: 270, done."), None);
    }

    #[test]
    fn stages_do_not_overlap_and_the_last_one_ends_at_a_hundred() {
        let full = Step {
            stage: Stage::Updating,
            percent: 100,
        };
        assert_eq!(full.overall(), 100, "готовый клон показывает сто процентов");

        let mut previous = 0;
        for stage in [
            Stage::Counting,
            Stage::Compressing,
            Stage::Writing,
            Stage::Receiving,
            Stage::Resolving,
            Stage::Updating,
        ] {
            let start = Step { stage, percent: 0 }.overall();
            assert!(
                start >= previous,
                "шкала не едет назад при переходе к {stage:?}"
            );
            previous = Step {
                stage,
                percent: 100,
            }
            .overall();
        }
    }

    #[test]
    fn half_a_line_arriving_from_the_pipe_is_not_taken_for_progress() {
        assert_eq!(
            parse("Receiving objects:  3"),
            None,
            "обрывок без процента дал бы скачок шкалы на три процента и назад"
        );
    }

    #[test]
    fn git_writes_progress_through_carriage_returns_not_newlines() {
        let chunk = "Receiving objects:  10% (27/270)\rReceiving objects:  20% (54/270)\r";
        assert_eq!(
            split_progress(chunk),
            vec![
                "Receiving objects:  10% (27/270)",
                "Receiving objects:  20% (54/270)"
            ],
            "без разреза по возврату каретки прогресс приходит одной строкой в конце"
        );
    }
}

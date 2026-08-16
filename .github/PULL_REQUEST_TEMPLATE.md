## What changed and why

<!-- One paragraph. If it fixes an issue, link it. -->

## How it was verified

<!-- Which tests cover it; if you measured performance or graph shape, the numbers. -->

## Checklist

- [ ] Tests first: a test that fails for the same reason as the bug, then the fix.
- [ ] No comments in code — the "why" lives in function and test names.
- [ ] Interface text goes through i18n keys; no colours or sizes outside the theme tokens.
- [ ] `npm run build`, `cargo test`, `cargo clippy --all-targets -- -D warnings` and `cargo fmt --check` pass locally.
- [ ] Commit messages are in English and say what was broken and how it was confirmed.

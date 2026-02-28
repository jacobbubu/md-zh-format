---
name: md-zh-format
description: Format Markdown files with the md-zh-format project CLI in a deterministic way. Use when users ask to normalize Chinese-English mixed typography, preserve YAML frontmatter while formatting markdown, run check-only formatting in CI, or batch-apply formatting changes to one or more .md files.
---

# Md Zh Format

## Overview

Run markdown formatting through the project CLI with stable command resolution and predictable reporting. Use the wrapper script in `scripts/format_markdown.sh` instead of composing ad-hoc commands.

## Workflow

1. Confirm target markdown files before formatting:

- Use explicit file paths from the user when provided.
- For broad requests, discover candidates with `rg --files -g '*.md'`.

2. Select operation mode:

- Preview result to stdout: no write flags.
- Apply changes in place: `--write`.
- CI/non-mutating validation: `--check` (expect exit code `1` when reformatting is needed).

3. Run formatter through wrapper script:

- `skills/md-zh-format/scripts/format_markdown.sh [cli args]`
- Pass original CLI args directly (`--write`, `--check`, `--print-width`, `--prose-wrap`, `--tab-width`, `--use-tabs`, `--no-use-tabs`, `--normalize-only`).
- Use `--workspace /abs/path` only when current directory is not the target workspace.

4. Report outcome clearly:

- In preview mode, summarize what changed in output text.
- In write mode, list files that were targeted and confirm completion.
- In check mode, treat exit code `1` as "formatting required", not as runtime failure.

## Quick Commands

```bash
# Preview one file
skills/md-zh-format/scripts/format_markdown.sh README.md

# Apply in-place
skills/md-zh-format/scripts/format_markdown.sh docs/a.md docs/b.md --write

# CI check
skills/md-zh-format/scripts/format_markdown.sh docs/a.md docs/b.md --check

# Tune Prettier before mixed-layout normalization
skills/md-zh-format/scripts/format_markdown.sh README.md --print-width 100 --prose-wrap always --tab-width 4
```

## Guardrails

- Do not edit markdown files manually first when the request is pure formatting; run the formatter directly and then report diffs.
- Do not treat `--check` exit code `1` as execution error; only non-`0/1` statuses are failures for check mode.
- Keep frontmatter intact by default; do not strip frontmatter unless user explicitly asks for it and an explicit option exists.

## References

- Read `references/cli-reference.md` for option matrix, exit-code semantics, and troubleshooting.

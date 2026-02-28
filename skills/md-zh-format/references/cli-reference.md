# md-zh-format CLI Reference

## Options

- `-w, --write`: overwrite input files in-place.
- `-o, --output <path>`: write formatted result to target file (single input only).
- `--check`: print changed file paths and exit `1` if formatting is needed.
- `--normalize-only`: run Prettier + mixed-layout rules, skip heading promotion.
- `--print-width <num>`: Prettier `printWidth` (default `80`).
- `--prose-wrap <mode>`: Prettier `proseWrap` (`always | never | preserve`, default `preserve`).
- `--tab-width <num>`: Prettier `tabWidth` (default `2`).
- `--use-tabs` / `--no-use-tabs`: Prettier `useTabs` (default `false`).
- `-h, --help`: show help.
- `-v, --version`: show version.

## Exit Codes

- `0`: successful run; in `--check` mode means no changes needed.
- `1`: `--check` mode only; formatting is required for at least one file.
- `2`: invalid arguments or runtime failure (I/O errors, parse failures, invalid paths).

## Command Patterns

```bash
# Preview formatting result
skills/md-zh-format/scripts/format_markdown.sh README.md

# Rewrite files in place
skills/md-zh-format/scripts/format_markdown.sh docs/a.md docs/b.md --write

# CI validation
skills/md-zh-format/scripts/format_markdown.sh docs/a.md docs/b.md --check

# Override Prettier behavior
skills/md-zh-format/scripts/format_markdown.sh README.md --print-width 100 --prose-wrap always
```

## Troubleshooting

- If wrapper exits `127`, install dependencies in workspace (`npm install`) or build CLI (`npm run build`).
- If check mode returns `1`, treat it as expected "needs formatting" state.
- If command fails with `2`, inspect stderr and rerun on a single file to isolate the error.

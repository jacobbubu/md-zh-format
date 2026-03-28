# @jacobbubu/md-zh-format

[中文文档（简体）](./README_zh.md)

Format Markdown for Chinese-English mixed typography with a deterministic pipeline:

1. Run Prettier on markdown body.
2. Optionally promote headings to start from H1.
3. Apply CJK mixed-layout normalization.
4. Preserve frontmatter by default.

## Quick Start

### 1) Try without installing (npx)

```bash
cat > demo.md <<'MD'
---
title: 在Azure中部署3台VM
---

## 标题

在Azure中部署3台VM。
MD

npx @jacobbubu/md-zh-format demo.md
```

Expected output (excerpt):

```md
---
title: 在Azure中部署3台VM
---

# 标题

在 Azure 中部署 3 台 VM。
```

### 2) Safe workflow for real files

```bash
# check-only mode (does not modify files)
md-zh-format docs/a.md docs/b.md --check

# apply changes in-place
md-zh-format docs/a.md docs/b.md --write
```

## Installation

```bash
# as project dependency
npm i @jacobbubu/md-zh-format
```

Optional global install:

```bash
npm i -g @jacobbubu/md-zh-format
```

## CLI

```bash
md-zh-format <input.md> [options]
```

### Options

- `-w, --write`: overwrite input files in-place.
- `-o, --output <path>`: write output to a target file (single input only).
- `--check`: check-only mode, exits `1` when files would change.
- `--normalize-only`: run Prettier + mixed-layout rules, skip heading promotion.
- `--print-width <num>`: Prettier `printWidth` (default: `80`).
- `--prose-wrap <mode>`: Prettier `proseWrap` (`always | never | preserve`, default: `preserve`).
- `--tab-width <num>`: Prettier `tabWidth` (default: `2`).
- `--use-tabs` / `--no-use-tabs`: Prettier `useTabs` (default: `false`).
- `-h, --help`: show help.
- `-v, --version`: show version.

### Common Commands

```bash
# print formatted result to stdout
md-zh-format article.md

# overwrite one file
md-zh-format article.md --write

# write to a different file
md-zh-format article.md --output article.formatted.md

# check in CI
md-zh-format docs/a.md docs/b.md --check

# tune Prettier behavior before CJK normalization
md-zh-format article.md --print-width 100 --prose-wrap always --tab-width 4
```

### Exit Codes

- `0`: success. In `--check` mode, means no changes needed.
- `1`: `--check` mode only, formatting is required.
- `2`: invalid arguments or runtime error.

## What Gets Changed

- Spaces between Han and Latin/number boundaries.
- Spaces between numbers and common units (`10Gbps -> 10 Gbps`).
- `%` and `°` remain attached to numbers (`15 % -> 15%`).
- Paired em dashes are normalized to spaced ASCII double hyphen (`甲——乙 -> 甲 -- 乙`).
- Chinese-context quotes normalized to `“…”` / `‘…’`.
- Chinese-context parentheses normalized with the `English term (中文释义)` exception.
- Extra spaces around punctuation cleaned up.
- Escaped inline emphasis-like markup is repaired when CommonMark/GFM would reject it before Chinese text:
  - `_term_处理 -> <em>term</em>处理`
  - `__term__处理 -> <strong>term</strong>处理`
  - `**原子签出（atomic checkout）**处理 -> <strong>原子签出（atomic checkout）</strong>处理`
  - `~~删除线（strike）~~处理 -> <del>删除线（strike）</del>处理`

## What Is Preserved

- YAML frontmatter block is preserved by default.
- GFM syntax is supported, including strikethrough, tables, task lists, footnotes, and autolink literals.
- Markdown-sensitive segments are protected:
  - fenced/indented code blocks
  - inline code
  - links/images
  - URLs and GFM autolink literals
  - HTML tags / CommonMark HTML blocks
  - math expressions
- Markdown hard-break trailing spaces (`  `) are preserved.

## API

### Exports

- `formatMarkdownWithPrettier`
- `resolveMarkdownPrettierOptions`
- `DEFAULT_MARKDOWN_PRETTIER_OPTIONS`
- `normalizeChsEngLayout`
- `prettifyMarkdownContent`
- `prettifyMarkdownFile`
- `findEarliestHeadingTitle`

Types:

- `MarkdownPrettierOptions`
- `MarkdownPrettierProseWrap`
- `PrettifyOptions`
- `PrettifyResult`
- `FrontmatterData`

### API Example

```ts
import {
  prettifyMarkdownContent,
  type MarkdownPrettierOptions,
} from "@jacobbubu/md-zh-format";

const prettierOptions: MarkdownPrettierOptions = {
  printWidth: 80,
  proseWrap: "preserve",
  tabWidth: 2,
  useTabs: false,
};

const result = await prettifyMarkdownContent(
  "---\n" + "title: Demo\n" + "---\n\n" + "## 在Azure中部署3台VM。\n",
  "/tmp/demo.md",
  {
    prettier: prettierOptions,
    preserveFrontmatter: true,
    promoteHeadings: true,
  },
);

console.log(result.prettifiedContent);
```

## Local Example Scripts

This repository includes runnable examples in `examples/basic`.

```bash
# API example: read examples/basic/input.md and write examples/basic/output.md
npm run example:api

# CLI example against the same input file
npm run example:cli
```

Files:

- [examples/basic/input.md](examples/basic/input.md)
- [examples/basic/api.ts](examples/basic/api.ts)

## Agent Skill Support

This repository includes an LLM-callable skill package at `skills/md-zh-format`.

Key files:

- [skills/md-zh-format/SKILL.md](skills/md-zh-format/SKILL.md)
- [skills/md-zh-format/agents/openai.yaml](skills/md-zh-format/agents/openai.yaml)
- [skills/md-zh-format/scripts/format_markdown.sh](skills/md-zh-format/scripts/format_markdown.sh)

Install into Codex skill directory:

```bash
mkdir -p "$CODEX_HOME/skills"
cp -R skills/md-zh-format "$CODEX_HOME/skills/md-zh-format"
```

Then invoke it in agent prompts with `$md-zh-format`.

Validate skill behavior in this repository:

```bash
# verify skill files + wrapper behavior (--check/--write/--check)
npm run verify:skill

# verify real claude trigger path
# prerequisite: local Claude CLI is installed and logged in
npm run verify:skill:claude

# run tests + wrapper verification
npm run verify:all

# run tests + wrapper verification + real Claude trigger verification
npm run verify:all:claude
```

## Development

```bash
npm install
npm run build
npm test
```

## Code & Docs Formatting

Prettier is configured for code and documentation files.

```bash
# format all supported files
npm run format

# check formatting
npm run format:check
```

On commit, Husky `pre-commit` runs `lint-staged` to apply Prettier on staged files.

## Release Automation (semantic-release)

This repository uses `semantic-release` for automated versioning and publishing.

### Commit Convention

Use Conventional Commits:

- `feat:` triggers a minor release.
- `fix:` triggers a patch release.
- `perf:` triggers a patch release.
- `feat!:` / `fix!:` or `BREAKING CHANGE:` footer triggers a major release.
- `docs:`, `test:`, `chore:` usually do not publish a new version.

Examples:

```text
feat(cli): add --normalize-only option
fix(prettify): preserve frontmatter raw block
feat!: drop Node 18 support
```

### Local Release Checks

```bash
npm run commitlint
npm run format:staged
npm run release:dry-run
```

### GitHub Actions

- Release workflow: [.github/workflows/release.yml](.github/workflows/release.yml)
- Commit message lint workflow: [.github/workflows/commitlint.yml](.github/workflows/commitlint.yml)

### Required Repository Setup

- npm package exists under `@jacobbubu/md-zh-format`.
- GitHub repository URL is `https://github.com/jacobbubu/md-zh-format.git`.
- Configure npm Trusted Publisher (OIDC) in npm package settings:
  - provider: GitHub Actions
  - repository: `jacobbubu/md-zh-format`
  - workflow name: `release.yml` (filename only, not path)
  - branch/tag filter: `main`
  - runner: GitHub-hosted runner
- Keep `id-token: write` permission in [release.yml](.github/workflows/release.yml).
- `GITHUB_TOKEN` is provided by GitHub Actions.
- `NPM_TOKEN` is not required for this workflow. If it exists from old setup, remove it to avoid confusion.

Configuration files:

- [commitlint.config.cjs](commitlint.config.cjs)
- [.releaserc.cjs](.releaserc.cjs)
- [CHANGELOG.md](CHANGELOG.md)
- [.husky/commit-msg](.husky/commit-msg)

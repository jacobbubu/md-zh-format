# @jacobbubu/md-zh-format

[English README](./README.md)

用于中文与英文混排 Markdown 的格式化工具，处理流程稳定可预测：

1. 先对 Markdown 正文执行 Prettier。
2. 可选地把标题层级提升到从 H1 开始。
3. 执行中英混排（CJK）规范化。
4. 默认保留 frontmatter。

## 快速开始

### 1）无需安装直接试用（npx）

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

预期输出（节选）：

```md
---
title: 在Azure中部署3台VM
---

# 标题

在 Azure 中部署 3 台 VM。
```

### 2）真实文件推荐流程（安全）

```bash
# 仅检查，不改文件
md-zh-format docs/a.md docs/b.md --check

# 原地写回
md-zh-format docs/a.md docs/b.md --write
```

## 安装

```bash
# 作为项目依赖
npm i @jacobbubu/md-zh-format
```

可选全局安装：

```bash
npm i -g @jacobbubu/md-zh-format
```

## CLI

```bash
md-zh-format <input.md> [options]
```

### 参数说明

- `-w, --write`：直接覆盖输入文件。
- `-o, --output <path>`：输出到目标文件（仅支持单输入文件）。
- `--check`：仅检查模式，有变更需求时返回 `1`。
- `--normalize-only`：执行 Prettier + 混排规则，但跳过标题提级。
- `--print-width <num>`：Prettier `printWidth`（默认 `80`）。
- `--prose-wrap <mode>`：Prettier `proseWrap`（`always | never | preserve`，默认 `preserve`）。
- `--tab-width <num>`：Prettier `tabWidth`（默认 `2`）。
- `--use-tabs` / `--no-use-tabs`：Prettier `useTabs`（默认 `false`）。
- `-h, --help`：显示帮助。
- `-v, --version`：显示版本。

### 常用命令

```bash
# 输出到 stdout
md-zh-format article.md

# 原地写回
md-zh-format article.md --write

# 输出到新文件
md-zh-format article.md --output article.formatted.md

# CI 检查
md-zh-format docs/a.md docs/b.md --check

# 在 CJK 规范化之前调整 Prettier 行为
md-zh-format article.md --print-width 100 --prose-wrap always --tab-width 4
```

### 退出码

- `0`：成功；在 `--check` 下表示无需变更。
- `1`：仅 `--check` 模式使用，表示需要格式化。
- `2`：参数错误或运行时错误。

## 会改哪些内容

- 中文与英文/数字边界自动补空格。
- 数字与常见单位补空格（`10Gbps -> 10 Gbps`）。
- `%` 和 `°` 保持与数字贴合（`15 % -> 15%`）。
- 成对的全角破折号会规范为带空格的 ASCII 双连字符（`甲——乙 -> 甲 -- 乙`）。
- 中文语境引号规范为 `“…”` / `‘…’`（含台式 `「…」` / `『…』`）。
- 中文语境括号规范化，并保留 `English term (中文释义)` 例外。
- 清理标点周围多余空格。
- 当 CommonMark / GFM 会把强调语法拒绝成普通文本，且后面紧跟中文时，会修复为等价 HTML：
  - `_term_处理 -> <em>term</em>处理`
  - `__term__处理 -> <strong>term</strong>处理`
  - `**原子签出（atomic checkout）**处理 -> <strong>原子签出（atomic checkout）</strong>处理`
  - `~~删除线（strike）~~处理 -> <del>删除线（strike）</del>处理`

## 会保留哪些内容

- 默认保留 YAML frontmatter。
- 正式支持 GFM 语法，包括删除线、表格、任务列表、脚注、自动链接字面量。
- 受保护的 Markdown 片段不会被混排规则破坏：
  - 围栏/缩进代码块
  - 行内代码
  - 链接/图片
  - URL 和 GFM 自动链接字面量
  - HTML 标签 / CommonMark HTML 块
  - 数学公式
- 保留 Markdown 硬换行尾部空格（`  `）。

## API

### 导出内容

- `formatMarkdownWithPrettier`
- `resolveMarkdownPrettierOptions`
- `DEFAULT_MARKDOWN_PRETTIER_OPTIONS`
- `normalizeChsEngLayout`
- `prettifyMarkdownContent`
- `prettifyMarkdownFile`
- `findEarliestHeadingTitle`

类型：

- `MarkdownPrettierOptions`
- `MarkdownPrettierProseWrap`
- `PrettifyOptions`
- `PrettifyResult`
- `FrontmatterData`

### API 示例

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

## 本地示例脚本

仓库内提供可运行示例，位置在 `examples/basic`。

```bash
# API 示例：读取 examples/basic/input.md 并写入 examples/basic/output.md
npm run example:api

# CLI 示例：对同一输入文件执行格式化
npm run example:cli
```

文件：

- [examples/basic/input.md](examples/basic/input.md)
- [examples/basic/api.ts](examples/basic/api.ts)

## Agent Skill 支持

仓库内包含可被 LLM 调用的 skill 包：`skills/md-zh-format`。

关键文件：

- [skills/md-zh-format/SKILL.md](skills/md-zh-format/SKILL.md)
- [skills/md-zh-format/agents/openai.yaml](skills/md-zh-format/agents/openai.yaml)
- [skills/md-zh-format/scripts/format_markdown.sh](skills/md-zh-format/scripts/format_markdown.sh)

安装到 Codex skill 目录：

```bash
mkdir -p "$CODEX_HOME/skills"
cp -R skills/md-zh-format "$CODEX_HOME/skills/md-zh-format"
```

之后在 Agent 提示中通过 `$md-zh-format` 调用。

在本仓库中验证 skill：

```bash
# 校验 skill 文件 + wrapper 行为（--check/--write/--check）
npm run verify:skill

# 校验真实 Claude 触发路径
# 前提：本机已安装并登录 Claude CLI
npm run verify:skill:claude

# 测试 + wrapper 校验
npm run verify:all

# 测试 + wrapper 校验 + 真实 Claude 触发校验
npm run verify:all:claude
```

## 开发

```bash
npm install
npm run build
npm test
```

## 代码与文档格式化

代码与文档统一使用 Prettier。

```bash
# 批量格式化
npm run format

# 仅检查格式
npm run format:check
```

提交时，Husky 的 `pre-commit` 会执行 `lint-staged`，自动格式化暂存区文件。

## 发布自动化（semantic-release）

本仓库通过 `semantic-release` 自动计算版本并发布。

### Commit 规范

使用 Conventional Commits：

- `feat:` 触发 minor 版本。
- `fix:` 触发 patch 版本。
- `perf:` 触发 patch 版本。
- `feat!:` / `fix!:` 或 `BREAKING CHANGE:` footer 触发 major 版本。
- `docs:`、`test:`、`chore:` 通常不触发发布。

示例：

```text
feat(cli): add --normalize-only option
fix(prettify): preserve frontmatter raw block
feat!: drop Node 18 support
```

### 本地发布检查

```bash
npm run commitlint
npm run format:staged
npm run release:dry-run
```

### GitHub Actions

- 发布工作流：[.github/workflows/release.yml](.github/workflows/release.yml)
- Commit lint 工作流：[.github/workflows/commitlint.yml](.github/workflows/commitlint.yml)

### 仓库必要配置

- npm 包已在 `@jacobbubu/md-zh-format` 下创建。
- GitHub 仓库地址为 `https://github.com/jacobbubu/md-zh-format.git`。
- 在 npm 包设置中配置 Trusted Publisher（OIDC）：
  - provider：GitHub Actions
  - repository：`jacobbubu/md-zh-format`
  - workflow name：`release.yml`（只填文件名，不要填路径）
  - branch/tag filter：`main`
  - runner：GitHub-hosted runner
- 保持 [release.yml](.github/workflows/release.yml) 中 `id-token: write` 权限开启。
- `GITHUB_TOKEN` 由 GitHub Actions 自动提供。
- 此工作流不再依赖 `NPM_TOKEN`。如果历史上已配置该 secret，建议删除以避免混淆。

配置文件：

- [commitlint.config.cjs](commitlint.config.cjs)
- [.releaserc.cjs](.releaserc.cjs)
- [CHANGELOG.md](CHANGELOG.md)
- [.husky/commit-msg](.husky/commit-msg)

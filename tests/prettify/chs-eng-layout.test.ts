import test from "node:test";
import assert from "node:assert/strict";
import {
  formatMarkdownWithPrettier,
  normalizeChsEngLayout,
  prettifyMarkdownContent,
} from "../../src/prettify/index.js";

test("adds spaces for Chinese-English/number boundaries and common units", () => {
  const input =
    "在Azure Portal中创建VM。需要3台机器，带宽10Gbps，延迟30ms，成功率15 %，角度233 °。";
  const output = normalizeChsEngLayout(input);
  assert.equal(
    output,
    "在 Azure Portal 中创建 VM。需要 3 台机器，带宽 10 Gbps，延迟 30 ms，成功率 15%，角度 233°。",
  );
});

test("normalizes Chinese-context quotes and punctuation spacing", () => {
  const input = "请点击 \"Analyze Data\" 按钮 ，然后查看 '示例' 。";
  const output = normalizeChsEngLayout(input);
  assert.equal(output, "请点击“Analyze Data”按钮，然后查看‘示例’。");
});

test("normalizes parentheses and keeps English-term + Chinese-gloss exception", () => {
  const input =
    "详细见第2章(尤其是2.3节)。字段为store region（州）,store city(城市)。";
  const output = normalizeChsEngLayout(input);
  assert.equal(
    output,
    "详细见第 2 章（尤其是 2.3 节）。字段为 store region (州), store city (城市)。",
  );
});

test("keeps markdown-sensitive segments untouched", () => {
  const input = [
    "请运行 `kubectl get pods`，然后检查输出。",
    "参考 [RFC9110](https://www.rfc-editor.org/rfc/rfc9110) 了解细节。",
    "链接 https://example.com/a?b=1&c=2 保持原样。",
    '<video src="https://cdn.example.com/a.mp4"></video>',
    "",
    "```js",
    'const x = "中文English42";',
    "```",
  ].join("\n");

  const output = normalizeChsEngLayout(input);
  assert.equal(output.includes("`kubectl get pods`"), true);
  assert.equal(
    output.includes("[RFC9110](https://www.rfc-editor.org/rfc/rfc9110)"),
    true,
  );
  assert.equal(output.includes("https://example.com/a?b=1&c=2"), true);
  assert.equal(
    output.includes('<video src="https://cdn.example.com/a.mp4"></video>'),
    true,
  );
  assert.equal(output.includes('const x = "中文English42";'), true);
});

test("keeps inline and block math expressions untouched", () => {
  const input = [
    "由质能方程$E=mc^2$可知，质量和能量可以相互转化。",
    "",
    "$$",
    "\\hat{H}\\psi = i\\hbar\\frac{\\partial \\psi}{\\partial t}",
    "$$",
    "",
    "公式标签$(1)$和$(2)$应保持原样。",
  ].join("\n");

  const output = normalizeChsEngLayout(input);
  assert.equal(output.includes("$E=mc^2$"), true);
  assert.equal(output.includes("$(1)$"), true);
  assert.equal(output.includes("$(2)$"), true);
  assert.equal(
    output.includes(
      "\\hat{H}\\psi = i\\hbar\\frac{\\partial \\psi}{\\partial t}",
    ),
    true,
  );
});

test("keeps CommonMark HTML block content untouched while still normalizing outside text", () => {
  const input = [
    "<table><tr><td>",
    "<pre>",
    "中文English42",
    "",
    "_world_.",
    "</pre>",
    "</td></tr></table>",
    "",
    "后续在Azure中运行。",
  ].join("\n");

  const output = normalizeChsEngLayout(input);
  assert.equal(output.includes("中文English42"), true);
  assert.equal(output.includes("_world_."), true);
  assert.equal(output.includes("后续在 Azure 中运行。"), true);
});

test("does not leak placeholder tokens when currency-like dollars appear before code blocks", () => {
  const input = [
    "| 模块 | 月成本 | 增长率 |",
    "| ---- | ------ | ------ |",
    "| API Gateway | CNY 12,340.50 | 30% |",
    "| Worker Pool | $8,920 | 12.5 % |",
    "| 成本(USD) | $2,000 | -9.09% |",
    "",
    "- [x] 已验证 `N/A`、`na`、`inf` 不破坏数字列判断",
    "",
    "```mermaid",
    "flowchart TD",
    "  A[开始] --> B[完成]",
    "```",
  ].join("\n");

  const output = normalizeChsEngLayout(input);
  assert.equal(/\uE000P\d+P\uE001/.test(output), false);
  assert.equal(output.includes("```mermaid"), true);
  assert.equal(output.includes("flowchart TD"), true);
  assert.equal(output.includes("`N/A`"), true);
});

test("keeps indented code block content untouched", () => {
  const input = [
    "代码块示例：",
    "",
    "    const price=100; // 中文English",
    "    console.log(price);",
    "",
    "后续文本在Azure中运行。",
  ].join("\n");

  const output = normalizeChsEngLayout(input);
  assert.equal(output.includes("    const price=100; // 中文English"), true);
  assert.equal(output.includes("    console.log(price);"), true);
  assert.equal(output.includes("后续文本在 Azure 中运行。"), true);
});

test("supports GFM strikethrough while still normalizing mixed-layout text inside", () => {
  const input = "~~在Azure中部署3台VM~~，然后继续执行。";
  const output = normalizeChsEngLayout(input);
  assert.equal(output, "~~在 Azure 中部署 3 台 VM~~，然后继续执行。");
});

test("supports GFM task list, tables, footnotes, and autolink literals", () => {
  const input = [
    "- [x] 在Azure中部署3台VM",
    "",
    "| 项目 | 描述 |",
    "| --- | --- |",
    "| VM | 在Azure中部署3台VM |",
    "",
    "访问 www.example.com 获取信息。",
    "",
    "[^1]: 在Azure中部署3台VM",
  ].join("\n");

  const output = normalizeChsEngLayout(input);
  assert.equal(output.includes("- [x] 在 Azure 中部署 3 台 VM"), true);
  assert.equal(output.includes("| VM | 在 Azure 中部署 3 台 VM |"), true);
  assert.equal(output.includes("www.example.com"), true);
  assert.equal(output.includes("[^1]: 在 Azure 中部署 3 台 VM"), true);
});

test("repairs escaped emphasis-like markup before Chinese text for underscore and punctuation-ending spans", () => {
  const input = [
    "_术语_处理任务",
    "__术语__处理任务",
    "*原子签出（atomic checkout）*处理任务分配",
    "**原子签出（atomic checkout）**处理任务分配",
    "~~删除线（strike）~~处理任务",
  ].join("\n");

  const output = normalizeChsEngLayout(input);
  assert.equal(output.includes("<em>术语</em>处理任务"), true);
  assert.equal(output.includes("<strong>术语</strong>处理任务"), true);
  assert.equal(
    output.includes("<em>原子签出（atomic checkout）</em>处理任务分配"),
    true,
  );
  assert.equal(
    output.includes("<strong>原子签出（atomic checkout）</strong>处理任务分配"),
    true,
  );
  assert.equal(output.includes("<del>删除线（strike）</del>处理任务"), true);
});

test("keeps valid star-delimited emphasis and strong spans when they already parse before Chinese text", () => {
  const input = ["*术语*处理任务", "**术语**处理任务", "~~术语~~处理任务"].join(
    "\n",
  );

  const output = normalizeChsEngLayout(input);
  assert.equal(output.includes("*术语*处理任务"), true);
  assert.equal(output.includes("**术语**处理任务"), true);
  assert.equal(output.includes("~~术语~~处理任务"), true);
  assert.equal(output.includes("<em>术语</em>处理任务"), false);
  assert.equal(output.includes("<strong>术语</strong>处理任务"), false);
  assert.equal(output.includes("<del>术语</del>处理任务"), false);
});

test("keeps escaped literal emphasis delimiters untouched", () => {
  const input = String.raw`\**原子签出（atomic checkout）**处理任务`;
  const output = normalizeChsEngLayout(input);
  assert.equal(output, String.raw`\**原子签出（atomic checkout）**处理任务`);
});

test("does not repair across nested emphasis nodes that are already partially parsed", () => {
  const input = "**原子 *checkout*（atomic checkout）**处理任务";
  const output = normalizeChsEngLayout(input);
  assert.equal(output, "**原子 *checkout*（atomic checkout）**处理任务");
});

test("keeps parser-defined intraword emphasis behavior unchanged", () => {
  const input = ["*foo*bar", "**foo**bar", "_foo_bar", "__foo__bar"].join("\n");
  const output = normalizeChsEngLayout(input);
  assert.equal(output.includes("*foo*bar"), true);
  assert.equal(output.includes("**foo**bar"), true);
  assert.equal(output.includes("_foo_bar"), true);
  assert.equal(output.includes("__foo__bar"), true);
  assert.equal(output.includes("<em>foo</em>bar"), false);
  assert.equal(output.includes("<strong>foo</strong>bar"), false);
});

test("prettify applies layout normalization while preserving frontmatter by default", async () => {
  const input = [
    "---",
    "title: 在Azure中部署3台VM",
    'note: "中文English42"',
    "---",
    "",
    "在Azure中部署3台VM。",
  ].join("\n");

  const expectedFrontmatter = [
    "---",
    "title: 在Azure中部署3台VM",
    'note: "中文English42"',
    "---",
  ].join("\n");

  const result = await prettifyMarkdownContent(input, "/tmp/demo.md");
  assert.equal(
    result.prettifiedContent.startsWith(`${expectedFrontmatter}\n`),
    true,
  );
  assert.equal(
    result.prettifiedContent.trimEnd().endsWith("在 Azure 中部署 3 台 VM。"),
    true,
  );
});

test("prettify can strip frontmatter when explicitly disabled", async () => {
  const input = ["---", "title: Demo", "---", "", "在Azure中部署3台VM。"].join(
    "\n",
  );

  const result = await prettifyMarkdownContent(input, "/tmp/demo.md", {
    preserveFrontmatter: false,
  });
  assert.equal(result.prettifiedContent.includes("---"), false);
  assert.equal(result.prettifiedContent.trim(), "在 Azure 中部署 3 台 VM。");
});

test("prettify keeps extra blank lines for downstream upload spacing logic", async () => {
  const input = ["# 标题", "", "", "", "段落 A", "", "", "段落 B"].join("\n");

  const result = await prettifyMarkdownContent(input, "/tmp/blank-lines.md");
  assert.equal(result.prettifiedContent.includes("\n\n\n\n段落 A"), false);
  assert.equal(result.prettifiedContent.includes("段落 A\n\n\n段落 B"), false);
  assert.equal(result.prettifiedContent.includes("段落 A\n\n段落 B"), true);
});

test("prettify preserves two trailing spaces used by markdown hard break", async () => {
  const input = ["## 硬换行", "这是第一行  ", "这是第二行"].join("\n");

  const result = await prettifyMarkdownContent(input, "/tmp/hard-break.md");
  const lines = result.prettifiedContent.split("\n");
  const hardBreakLine = lines.find((line) => line.startsWith("这是第一行"));
  assert.equal(Boolean(hardBreakLine), true);
  assert.equal(hardBreakLine?.endsWith("  "), true);
  assert.equal(lines.includes("这是第二行"), true);
});

test("prettier options are configurable before mixed-layout normalization", async () => {
  const input =
    "This is a long paragraph that should wrap when proseWrap is always and printWidth is short.";

  const direct = await formatMarkdownWithPrettier(input, {
    printWidth: 30,
    proseWrap: "always",
  });
  assert.equal(direct.includes("\nshould wrap when"), true);

  const result = await prettifyMarkdownContent(
    input,
    "/tmp/prettier-options.md",
    {
      prettier: {
        printWidth: 30,
        proseWrap: "always",
        tabWidth: 2,
        useTabs: false,
      },
    },
  );
  assert.equal(result.prettifiedContent.includes("\nshould wrap when"), true);
});

#!/usr/bin/env node
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

function fail(message) {
  console.error(`[verify:skill] ERROR: ${message}`);
  process.exit(1);
}

function ok(message) {
  console.log(`[verify:skill] ${message}`);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    ...options,
  });
  if (result.error) {
    fail(`${command} failed to start: ${result.error.message}`);
  }
  return result;
}

function assertStatus(result, expected, context) {
  if (result.status !== expected) {
    fail(
      `${context} returned ${result.status}, expected ${expected}.\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    );
  }
}

function assertIncludes(haystack, needle, context) {
  if (!haystack.includes(needle)) {
    fail(`${context} missing expected text: ${needle}`);
  }
}

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..");
const skillDir = path.join(repoRoot, "skills", "md-zh-format");
const skillMdPath = path.join(skillDir, "SKILL.md");
const openaiYamlPath = path.join(skillDir, "agents", "openai.yaml");
const wrapperPath = path.join(skillDir, "scripts", "format_markdown.sh");

ok("checking skill file layout");
for (const target of [skillMdPath, openaiYamlPath, wrapperPath]) {
  try {
    await fs.access(target);
  } catch {
    fail(`missing required skill file: ${target}`);
  }
}

const skillMd = await fs.readFile(skillMdPath, "utf8");
const frontmatterMatch = skillMd.match(/^---\n([\s\S]*?)\n---/);
if (!frontmatterMatch) {
  fail("SKILL.md frontmatter block is missing");
}
const frontmatter = frontmatterMatch[1];
assertIncludes(frontmatter, "name: md-zh-format", "SKILL.md frontmatter");
assertIncludes(frontmatter, "description:", "SKILL.md frontmatter");
if (frontmatter.includes("[TODO")) {
  fail("SKILL.md frontmatter still contains TODO markers");
}

const openaiYaml = await fs.readFile(openaiYamlPath, "utf8");
assertIncludes(openaiYaml, "interface:", "agents/openai.yaml");
assertIncludes(
  openaiYaml,
  'display_name: "MD Zh Format"',
  "agents/openai.yaml",
);
assertIncludes(
  openaiYaml,
  'default_prompt: "Use $md-zh-format',
  "agents/openai.yaml",
);

ok("checking wrapper help output");
const helpResult = run("bash", [wrapperPath, "--help-wrapper"], {
  cwd: repoRoot,
});
assertStatus(helpResult, 0, "format_markdown.sh --help-wrapper");
assertIncludes(helpResult.stdout, "Usage:", "wrapper help");

const tempDir = await fs.mkdtemp(
  path.join(os.tmpdir(), "md-zh-format-skill-verify-"),
);
try {
  const sampleFile = path.join(tempDir, "sample.md");
  const sampleContent = [
    "---",
    "title: 在Azure中部署3台VM",
    "---",
    "",
    "## 标题",
    "",
    "在Azure中部署3台VM。",
    "",
  ].join("\n");
  await fs.writeFile(sampleFile, sampleContent, "utf8");

  ok("checking --check reports needed formatting");
  const checkNeedsChange = run(
    "bash",
    [wrapperPath, "--workspace", repoRoot, sampleFile, "--check"],
    { cwd: repoRoot },
  );
  assertStatus(
    checkNeedsChange,
    1,
    "format_markdown.sh --check (before write)",
  );
  assertIncludes(
    checkNeedsChange.stdout,
    path.resolve(sampleFile),
    "--check stdout",
  );

  ok("checking --write applies formatting");
  const writeResult = run(
    "bash",
    [wrapperPath, "--workspace", repoRoot, sampleFile, "--write"],
    { cwd: repoRoot },
  );
  assertStatus(writeResult, 0, "format_markdown.sh --write");
  const formatted = await fs.readFile(sampleFile, "utf8");
  assertIncludes(
    formatted,
    "---\ntitle: 在Azure中部署3台VM\n---\n",
    "formatted file",
  );
  assertIncludes(formatted, "\n# 标题\n", "formatted heading");
  assertIncludes(formatted, "在 Azure 中部署 3 台 VM。", "formatted body");

  ok("checking --check passes after formatting");
  const checkClean = run(
    "bash",
    [wrapperPath, "--workspace", repoRoot, sampleFile, "--check"],
    { cwd: repoRoot },
  );
  assertStatus(checkClean, 0, "format_markdown.sh --check (after write)");
} finally {
  await fs.rm(tempDir, { recursive: true, force: true });
}

ok("skill verification passed");

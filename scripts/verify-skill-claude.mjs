#!/usr/bin/env node
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

function fail(message) {
  console.error(`[verify:skill:claude] ERROR: ${message}`);
  process.exit(1);
}

function ok(message) {
  console.log(`[verify:skill:claude] ${message}`);
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
const wrapperPath = path.join(
  repoRoot,
  "skills",
  "md-zh-format",
  "scripts",
  "format_markdown.sh",
);

ok("checking claude cli availability");
const versionResult = run("claude", ["--version"]);
assertStatus(versionResult, 0, "claude --version");

ok("checking claude print mode availability");
const pingResult = run("claude", [
  "-p",
  "--output-format",
  "text",
  "--",
  "Reply with exactly: OK",
]);
assertStatus(pingResult, 0, "claude ping");
if (pingResult.stdout.trim() !== "OK") {
  fail(`unexpected claude ping output: ${pingResult.stdout.trim()}`);
}

const tempDir = await fs.mkdtemp(
  path.join(os.tmpdir(), "md-zh-format-skill-claude-verify-"),
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

  ok("triggering claude to run the skill wrapper");
  const prompt = [
    "In the current repository, execute exactly this command:",
    `bash "${wrapperPath}" --workspace "${repoRoot}" "${sampleFile}" --write`,
    "After running it, reply with exactly DONE and nothing else.",
  ].join("\n");

  const invokeResult = run(
    "claude",
    [
      "-p",
      "--output-format",
      "text",
      "--permission-mode",
      "bypassPermissions",
      "--allowed-tools",
      "Bash",
      "--",
      prompt,
    ],
    { cwd: repoRoot },
  );
  assertStatus(invokeResult, 0, "claude wrapper invocation");
  if (invokeResult.stdout.trim() !== "DONE") {
    fail(
      `unexpected claude invocation output: ${invokeResult.stdout.trim() || "<empty>"}`,
    );
  }

  ok("checking file changed by claude-triggered run");
  const formatted = await fs.readFile(sampleFile, "utf8");
  assertIncludes(
    formatted,
    "---\ntitle: 在Azure中部署3台VM\n---\n",
    "formatted file",
  );
  assertIncludes(formatted, "\n# 标题\n", "formatted heading");
  assertIncludes(formatted, "在 Azure 中部署 3 台 VM。", "formatted body");
} finally {
  await fs.rm(tempDir, { recursive: true, force: true });
}

ok("claude skill trigger verification passed");

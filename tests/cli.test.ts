import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import { createRequire } from "node:module";
import * as os from "node:os";
import * as path from "node:path";
import { parseCliArgs, runCli, type CliIo } from "../src/cli.js";

const require = createRequire(import.meta.url);
const packageJson = require("../package.json") as { version?: string };
const PACKAGE_VERSION = packageJson.version ?? "0.0.0";

async function withTempDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "md-zh-format-"));
  try {
    await fn(tempDir);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

function createBufferIo(): { io: CliIo; stdout: string[]; stderr: string[] } {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    io: {
      stdout: (text: string) => {
        stdout.push(text);
      },
      stderr: (text: string) => {
        stderr.push(text);
      },
    },
    stdout,
    stderr,
  };
}

function expectThrowMessage(fn: () => unknown, messagePart: string): void {
  assert.throws(fn, (error) => {
    if (!(error instanceof Error)) {
      return false;
    }
    return error.message.includes(messagePart);
  });
}

test("parse: defaults and basic input", () => {
  const parsed = parseCliArgs(["a.md"]);
  assert.deepEqual(parsed.inputPaths, ["a.md"]);
  assert.equal(parsed.write, false);
  assert.equal(parsed.check, false);
  assert.equal(parsed.normalizeOnly, false);
  assert.equal(parsed.help, false);
  assert.equal(parsed.version, false);
  assert.deepEqual(parsed.prettier, {});
});

test("parse: help/version flags", () => {
  const helpShort = parseCliArgs(["-h"]);
  const helpLong = parseCliArgs(["--help"]);
  const versionShort = parseCliArgs(["-v"]);
  const versionLong = parseCliArgs(["--version"]);
  assert.equal(helpShort.help, true);
  assert.equal(helpLong.help, true);
  assert.equal(versionShort.version, true);
  assert.equal(versionLong.version, true);
});

test("parse: parses output/write/check/normalize flags", () => {
  const writeParsed = parseCliArgs(["a.md", "--write", "--normalize-only"]);
  assert.equal(writeParsed.write, true);
  assert.equal(writeParsed.normalizeOnly, true);

  const outputParsed = parseCliArgs(["a.md", "--output", "b.md"]);
  assert.equal(outputParsed.outputPath, "b.md");

  const checkParsed = parseCliArgs(["a.md", "--check"]);
  assert.equal(checkParsed.check, true);
});

test("parse: parses prettier numeric/text options", () => {
  const parsed = parseCliArgs([
    "a.md",
    "--print-width",
    "100",
    "--prose-wrap",
    "always",
    "--tab-width",
    "4",
  ]);
  assert.equal(parsed.prettier.printWidth, 100);
  assert.equal(parsed.prettier.proseWrap, "always");
  assert.equal(parsed.prettier.tabWidth, 4);
});

test("parse: --use-tabs and --no-use-tabs precedence", () => {
  const useThenNo = parseCliArgs(["a.md", "--use-tabs", "--no-use-tabs"]);
  const noThenUse = parseCliArgs(["a.md", "--no-use-tabs", "--use-tabs"]);
  assert.equal(useThenNo.prettier.useTabs, false);
  assert.equal(noThenUse.prettier.useTabs, true);
});

test("parse: rejects incompatible option combinations", () => {
  expectThrowMessage(
    () => parseCliArgs(["a.md", "--write", "--output", "b.md"]),
    "--write and --output",
  );
  expectThrowMessage(
    () => parseCliArgs(["a.md", "--check", "--write"]),
    "--check cannot be combined",
  );
  expectThrowMessage(
    () => parseCliArgs(["a.md", "--check", "--output", "b.md"]),
    "--check cannot be combined",
  );
  expectThrowMessage(
    () => parseCliArgs(["a.md", "b.md"]),
    "Multiple input files require --write or --check mode.",
  );
});

test("parse: rejects missing option values", () => {
  expectThrowMessage(
    () => parseCliArgs(["a.md", "--output"]),
    "--output requires a value.",
  );
  expectThrowMessage(
    () => parseCliArgs(["a.md", "--print-width"]),
    "--print-width requires a value.",
  );
  expectThrowMessage(
    () => parseCliArgs(["a.md", "--prose-wrap"]),
    "--prose-wrap requires a value.",
  );
  expectThrowMessage(
    () => parseCliArgs(["a.md", "--tab-width"]),
    "--tab-width requires a value.",
  );
});

test("parse: rejects invalid option values", () => {
  expectThrowMessage(
    () => parseCliArgs(["a.md", "--prose-wrap", "foo"]),
    "must be one of: always, never, preserve.",
  );
  expectThrowMessage(
    () => parseCliArgs(["a.md", "--print-width", "0"]),
    "--print-width requires a positive integer.",
  );
  expectThrowMessage(
    () => parseCliArgs(["a.md", "--tab-width", "0"]),
    "--tab-width requires a positive integer.",
  );
});

test("parse: rejects unknown option", () => {
  expectThrowMessage(
    () => parseCliArgs(["a.md", "--unknown"]),
    "Unknown option: --unknown",
  );
});

test("run:flow: help prints usage and exits 0", async () => {
  const output = createBufferIo();
  const code = await runCli(["--help"], output.io);
  assert.equal(code, 0);
  assert.equal(output.stdout.join("").includes("Usage:"), true);
  assert.equal(output.stderr.join(""), "");
});

test("run:flow: version prints value and exits 0", async () => {
  const output = createBufferIo();
  const code = await runCli(["--version"], output.io);
  assert.equal(code, 0);
  assert.equal(output.stdout.join(""), `${PACKAGE_VERSION}\n`);
  assert.equal(output.stderr.join(""), "");
});

test("run:flow: missing input returns 2 with error", async () => {
  const output = createBufferIo();
  const code = await runCli([], output.io);
  assert.equal(code, 2);
  assert.equal(
    output.stderr.join("").includes("missing input file path"),
    true,
  );
});

test("run:flow: parse error returns 2 with help text", async () => {
  const output = createBufferIo();
  const code = await runCli(["--unknown"], output.io);
  assert.equal(code, 2);
  assert.equal(
    output.stderr.join("").includes("Unknown option: --unknown"),
    true,
  );
  assert.equal(output.stderr.join("").includes("Usage:"), true);
});

test("run:mode: default outputs formatted markdown to stdout", async () => {
  await withTempDir(async (dir) => {
    const inputPath = path.join(dir, "input.md");
    await fs.writeFile(inputPath, "在Azure中部署3台VM。\n", "utf-8");

    const output = createBufferIo();
    const code = await runCli([inputPath], output.io);
    assert.equal(code, 0);
    assert.equal(output.stderr.join(""), "");
    assert.equal(output.stdout.join(""), "在 Azure 中部署 3 台 VM。\n");
  });
});

test("run:mode: write overwrites source file", async () => {
  await withTempDir(async (dir) => {
    const inputPath = path.join(dir, "input.md");
    await fs.writeFile(inputPath, "在Azure中部署3台VM。\n", "utf-8");

    const output = createBufferIo();
    const code = await runCli([inputPath, "--write"], output.io);
    assert.equal(code, 0);
    const updated = await fs.readFile(inputPath, "utf-8");
    assert.equal(updated, "在 Azure 中部署 3 台 VM。\n");
  });
});

test("run:mode: output writes to target file", async () => {
  await withTempDir(async (dir) => {
    const inputPath = path.join(dir, "input.md");
    const outputPath = path.join(dir, "out.md");
    await fs.writeFile(inputPath, "在Azure中部署3台VM。\n", "utf-8");

    const output = createBufferIo();
    const code = await runCli([inputPath, "--output", outputPath], output.io);
    assert.equal(code, 0);
    assert.equal(output.stdout.join(""), "");
    const result = await fs.readFile(outputPath, "utf-8");
    assert.equal(result, "在 Azure 中部署 3 台 VM。\n");
  });
});

test("run:mode: check returns 1 when file would change", async () => {
  await withTempDir(async (dir) => {
    const inputPath = path.join(dir, "input.md");
    await fs.writeFile(inputPath, "在Azure中部署3台VM。\n", "utf-8");

    const output = createBufferIo();
    const code = await runCli([inputPath, "--check"], output.io);
    assert.equal(code, 1);
    assert.equal(output.stdout.join(""), `${path.resolve(inputPath)}\n`);
  });
});

test("run:mode: check returns 0 when no change is needed", async () => {
  await withTempDir(async (dir) => {
    const inputPath = path.join(dir, "input.md");
    await fs.writeFile(inputPath, "在 Azure 中部署 3 台 VM。\n", "utf-8");

    const output = createBufferIo();
    const code = await runCli([inputPath, "--check"], output.io);
    assert.equal(code, 0);
    assert.equal(output.stdout.join(""), "");
  });
});

test("run:mode: check with multi-file keeps input order", async () => {
  await withTempDir(async (dir) => {
    const aPath = path.join(dir, "a.md");
    const bPath = path.join(dir, "b.md");
    await fs.writeFile(aPath, "在Azure中部署3台VM。\n", "utf-8");
    await fs.writeFile(bPath, "在Azure中部署3台VM。\n", "utf-8");

    const output = createBufferIo();
    const code = await runCli([aPath, bPath, "--check"], output.io);
    assert.equal(code, 1);
    assert.equal(
      output.stdout.join(""),
      `${path.resolve(aPath)}\n${path.resolve(bPath)}\n`,
    );
  });
});

test("run:format: normalize-only skips heading promotion", async () => {
  await withTempDir(async (dir) => {
    const inputPath = path.join(dir, "input.md");
    await fs.writeFile(inputPath, "## 标题\n\n在Azure中部署3台VM。\n", "utf-8");

    const defaultOutput = createBufferIo();
    const defaultCode = await runCli([inputPath], defaultOutput.io);
    assert.equal(defaultCode, 0);
    assert.equal(defaultOutput.stdout.join("").startsWith("# 标题\n"), true);

    const normalizeOnlyOutput = createBufferIo();
    const normalizeOnlyCode = await runCli(
      [inputPath, "--normalize-only"],
      normalizeOnlyOutput.io,
    );
    assert.equal(normalizeOnlyCode, 0);
    assert.equal(
      normalizeOnlyOutput.stdout.join("").startsWith("## 标题\n"),
      true,
    );
  });
});

test("run:format: printWidth + proseWrap affects line wrapping", async () => {
  await withTempDir(async (dir) => {
    const inputPath = path.join(dir, "input.md");
    await fs.writeFile(
      inputPath,
      "This is a long paragraph that should wrap when proseWrap is always and printWidth is short.\n",
      "utf-8",
    );

    const output = createBufferIo();
    const code = await runCli(
      [inputPath, "--print-width", "30", "--prose-wrap", "always"],
      output.io,
    );
    assert.equal(code, 0);
    assert.equal(output.stdout.join("").includes("\nshould wrap when"), true);
  });
});

test("run:format: tabWidth affects markdown list indentation", async () => {
  await withTempDir(async (dir) => {
    const inputPath = path.join(dir, "input.md");
    await fs.writeFile(
      inputPath,
      "- parent\n  - child\n    - grandchild\n",
      "utf-8",
    );

    const output = createBufferIo();
    const code = await runCli([inputPath, "--tab-width", "4"], output.io);
    assert.equal(code, 0);
    const text = output.stdout.join("");
    assert.equal(text.includes("\n    - child\n"), true);
    assert.equal(text.includes("\n        - grandchild\n"), true);
  });
});

test("run:format: no-use-tabs branch is accepted", async () => {
  await withTempDir(async (dir) => {
    const inputPath = path.join(dir, "input.md");
    await fs.writeFile(inputPath, "- parent\n  - child\n", "utf-8");

    const output = createBufferIo();
    const code = await runCli(
      [inputPath, "--use-tabs", "--no-use-tabs"],
      output.io,
    );
    assert.equal(code, 0);
    assert.equal(output.stderr.join(""), "");
  });
});

test("run:format: keeps frontmatter unchanged while formatting body", async () => {
  await withTempDir(async (dir) => {
    const inputPath = path.join(dir, "input.md");
    const input = [
      "---",
      "title: 在Azure中部署3台VM",
      'note: "中文English42"',
      "---",
      "",
      "在Azure中部署3台VM。",
      "",
    ].join("\n");
    await fs.writeFile(inputPath, input, "utf-8");

    const output = createBufferIo();
    const code = await runCli([inputPath], output.io);
    assert.equal(code, 0);
    const text = output.stdout.join("");
    assert.equal(
      text.startsWith(
        '---\ntitle: 在Azure中部署3台VM\nnote: "中文English42"\n---\n',
      ),
      true,
    );
    assert.equal(text.includes("在 Azure 中部署 3 台 VM。"), true);
  });
});

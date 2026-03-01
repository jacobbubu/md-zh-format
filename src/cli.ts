#!/usr/bin/env node
import * as fs from "node:fs/promises";
import { realpathSync } from "node:fs";
import * as path from "node:path";
import { createRequire } from "node:module";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  prettifyMarkdownContent,
  type MarkdownPrettierOptions,
  type MarkdownPrettierProseWrap,
} from "./index.js";

const require = createRequire(import.meta.url);
const packageJson = require("../package.json") as { version?: string };
const CLI_VERSION = packageJson.version ?? "0.0.0";
const ALLOWED_PROSE_WRAP = new Set<MarkdownPrettierProseWrap>([
  "always",
  "never",
  "preserve",
]);

export interface CliOptions {
  inputPaths: string[];
  write: boolean;
  outputPath?: string;
  check: boolean;
  normalizeOnly: boolean;
  prettier: MarkdownPrettierOptions;
  help: boolean;
  version: boolean;
}

export interface CliIo {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
}

const DEFAULT_IO: CliIo = {
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
};

function parsePositiveInteger(rawValue: string, optionName: string): number {
  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${optionName} requires a positive integer.`);
  }
  return parsed;
}

function getOptionValue(
  argv: string[],
  index: number,
  optionName: string,
): string {
  const value = argv[index + 1];
  if (!value || value.startsWith("-")) {
    throw new Error(`${optionName} requires a value.`);
  }
  return value;
}

function getHelpText(): string {
  return [
    "md-zh-format - Markdown formatter for Chinese-English mixed typography",
    "",
    "Usage:",
    "  md-zh-format <input.md> [options]",
    "  md-zh-format <a.md> <b.md> --write",
    "",
    "Options:",
    "  -w, --write                Overwrite input files in-place",
    "  -o, --output <path>        Write output to a target file (single input only)",
    "      --check                Only check formatting changes (exit 1 if changed)",
    "      --normalize-only       Run Prettier + mixed-layout rules, skip heading promotion",
    "      --print-width <num>    Prettier printWidth (default: 80)",
    "      --prose-wrap <mode>    Prettier proseWrap (always|never|preserve, default: preserve)",
    "      --tab-width <num>      Prettier tabWidth (default: 2)",
    "      --use-tabs             Prettier useTabs=true",
    "      --no-use-tabs          Prettier useTabs=false (default: false)",
    "  -h, --help                 Show help",
    "  -v, --version              Show version",
    "",
    "Behavior:",
    "  - Default pipeline: format body with Prettier, promote headings, then apply CJK layout rules",
    "  - Frontmatter is preserved as raw text by default",
    "  - Without --write/--output, result is printed to stdout",
  ].join("\n");
}

export function parseCliArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    inputPaths: [],
    write: false,
    check: false,
    normalizeOnly: false,
    prettier: {},
    help: false,
    version: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    switch (arg) {
      case "-h":
      case "--help":
        options.help = true;
        break;
      case "-v":
      case "--version":
        options.version = true;
        break;
      case "-w":
      case "--write":
        options.write = true;
        break;
      case "--check":
        options.check = true;
        break;
      case "--normalize-only":
        options.normalizeOnly = true;
        break;
      case "--print-width": {
        const value = getOptionValue(argv, i, arg);
        options.prettier.printWidth = parsePositiveInteger(value, arg);
        i += 1;
        break;
      }
      case "--prose-wrap": {
        const value = getOptionValue(argv, i, arg);
        if (!ALLOWED_PROSE_WRAP.has(value as MarkdownPrettierProseWrap)) {
          throw new Error(`${arg} must be one of: always, never, preserve.`);
        }
        options.prettier.proseWrap = value as MarkdownPrettierProseWrap;
        i += 1;
        break;
      }
      case "--tab-width": {
        const value = getOptionValue(argv, i, arg);
        options.prettier.tabWidth = parsePositiveInteger(value, arg);
        i += 1;
        break;
      }
      case "--use-tabs":
        options.prettier.useTabs = true;
        break;
      case "--no-use-tabs":
        options.prettier.useTabs = false;
        break;
      case "-o":
      case "--output": {
        const value = getOptionValue(argv, i, arg);
        options.outputPath = value;
        i += 1;
        break;
      }
      default:
        if (arg.startsWith("-")) {
          throw new Error(`Unknown option: ${arg}`);
        }
        options.inputPaths.push(arg);
        break;
    }
  }

  if (options.write && options.outputPath) {
    throw new Error("--write and --output cannot be used together.");
  }

  if (options.check && (options.write || options.outputPath)) {
    throw new Error("--check cannot be combined with --write or --output.");
  }

  if (options.outputPath && options.inputPaths.length !== 1) {
    throw new Error("--output only supports a single input file.");
  }

  if (
    options.inputPaths.length > 1 &&
    !options.write &&
    !options.check &&
    !options.outputPath
  ) {
    throw new Error("Multiple input files require --write or --check mode.");
  }

  return options;
}

async function formatOneFile(
  inputPath: string,
  normalizeOnly: boolean,
  prettierOptions: MarkdownPrettierOptions,
): Promise<{ absolutePath: string; original: string; formatted: string }> {
  const absolutePath = path.resolve(inputPath);
  const original = await fs.readFile(absolutePath, "utf-8");
  const normalizedInput = original.replace(/\r\n/g, "\n");

  const formatted = (
    await prettifyMarkdownContent(normalizedInput, absolutePath, {
      prettier: prettierOptions,
      promoteHeadings: !normalizeOnly,
    })
  ).prettifiedContent;

  return {
    absolutePath,
    original: normalizedInput,
    formatted,
  };
}

export async function runCli(
  argv: string[],
  io: CliIo = DEFAULT_IO,
): Promise<number> {
  let options: CliOptions;
  try {
    options = parseCliArgs(argv);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    io.stderr(`Error: ${message}\n\n${getHelpText()}\n`);
    return 2;
  }

  if (options.help) {
    io.stdout(`${getHelpText()}\n`);
    return 0;
  }

  if (options.version) {
    io.stdout(`${CLI_VERSION}\n`);
    return 0;
  }

  if (options.inputPaths.length === 0) {
    io.stderr(`Error: missing input file path.\n\n${getHelpText()}\n`);
    return 2;
  }

  const results: Array<{
    absolutePath: string;
    original: string;
    formatted: string;
  }> = [];

  for (const inputPath of options.inputPaths) {
    try {
      const formatted = await formatOneFile(
        inputPath,
        options.normalizeOnly,
        options.prettier,
      );
      results.push(formatted);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      io.stderr(`Error: failed to process ${inputPath}: ${message}\n`);
      return 2;
    }
  }

  if (options.check) {
    const changed = results.filter((item) => item.formatted !== item.original);
    if (changed.length > 0) {
      for (const item of changed) {
        io.stdout(`${item.absolutePath}\n`);
      }
      return 1;
    }
    return 0;
  }

  if (options.write) {
    for (const item of results) {
      if (item.formatted === item.original) {
        continue;
      }
      await fs.writeFile(item.absolutePath, item.formatted, "utf-8");
    }
    return 0;
  }

  if (options.outputPath) {
    const firstResult = results[0];
    if (!firstResult) {
      return 2;
    }
    const outputPath = path.resolve(options.outputPath);
    await fs.writeFile(outputPath, firstResult.formatted, "utf-8");
    return 0;
  }

  const firstResult = results[0];
  if (!firstResult) {
    return 2;
  }

  io.stdout(firstResult.formatted);
  return 0;
}

async function main(): Promise<void> {
  const exitCode = await runCli(process.argv.slice(2));
  process.exitCode = exitCode;
}

function resolveComparablePath(inputPath: string): string {
  const absolutePath = path.resolve(inputPath);
  try {
    return realpathSync(absolutePath);
  } catch {
    return absolutePath;
  }
}

export function isMainModule(
  invokedPath: string | undefined,
  moduleUrl: string = import.meta.url,
): boolean {
  if (!invokedPath) {
    return false;
  }

  const modulePath = resolveComparablePath(fileURLToPath(moduleUrl));
  const argvPath = resolveComparablePath(invokedPath);
  return modulePath === argvPath;
}

if (isMainModule(process.argv[1])) {
  void main();
}

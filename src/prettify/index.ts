import * as fs from "node:fs/promises";
import * as path from "node:path";
import { format as prettierFormat } from "prettier";
import { normalizeChsEngLayout } from "./chs-eng-layout.js";

export interface FrontmatterData {
  [key: string]: string | undefined;
}

interface ParsedFrontmatter {
  hasFrontmatter: boolean;
  data: FrontmatterData;
  rawFrontmatterBlock?: string;
  body: string;
}

export type MarkdownPrettierProseWrap = "always" | "never" | "preserve";

export interface MarkdownPrettierOptions {
  printWidth?: number;
  proseWrap?: MarkdownPrettierProseWrap;
  tabWidth?: number;
  useTabs?: boolean;
}

export interface PrettifyOptions {
  prettier?: MarkdownPrettierOptions;
  preserveFrontmatter?: boolean;
  promoteHeadings?: boolean;
}

export interface PrettifyResult {
  sourcePath: string;
  baseName: string;
  hasFrontmatter: boolean;
  frontmatter: FrontmatterData;
  body: string;
  prettifiedContent: string;
}

export const DEFAULT_MARKDOWN_PRETTIER_OPTIONS: Readonly<
  Required<MarkdownPrettierOptions>
> = Object.freeze({
  printWidth: 80,
  proseWrap: "preserve",
  tabWidth: 2,
  useTabs: false,
});

const ORDERED_HEADING_RE = /^\s*["'“”]?\s*(\d+)\s*(?:[.\-、]|[）\)])\s*(.*)$/;
const ATX_HEADING_RE = /^(\s{0,3})(#{1,6})([ \t]+)(.*)$/;
const FENCE_MARK_RE = /^\s{0,3}(```+|~~~+)/;

function normalizeLineBreaks(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

function splitLines(text: string): string[] {
  return normalizeLineBreaks(text).split("\n");
}

function parseFrontmatter(content: string): ParsedFrontmatter {
  const normalizedContent = normalizeLineBreaks(content);
  const lines = splitLines(normalizedContent);
  if (lines.length === 0 || lines[0].trim() !== "---") {
    return {
      hasFrontmatter: false,
      data: {},
      body: normalizedContent,
    };
  }

  let closingIndex = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      closingIndex = i;
      break;
    }
  }

  if (closingIndex < 0) {
    return {
      hasFrontmatter: false,
      data: {},
      body: normalizedContent,
    };
  }

  const frontmatterLines = lines.slice(1, closingIndex);
  const rawFrontmatterBlock = lines.slice(0, closingIndex + 1).join("\n");
  const body = lines.slice(closingIndex + 1).join("\n");
  const data: FrontmatterData = {};

  for (const line of frontmatterLines) {
    const match = line.match(/^\s*([A-Za-z0-9_-]+)\s*:\s*(.*?)\s*$/);
    if (!match) {
      continue;
    }

    const key = match[1];
    let value = match[2] ?? "";
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    data[key] = value;
  }

  return {
    hasFrontmatter: true,
    data,
    rawFrontmatterBlock,
    body,
  };
}

function normalizeHeadingTitle(rawHeadingText: string): string {
  const trimmed = rawHeadingText.replace(/\s+#+\s*$/, "").trim();
  const orderedMatch = trimmed.match(ORDERED_HEADING_RE);
  if (!orderedMatch) return trimmed;

  const rest = (orderedMatch[2] ?? "").replace(/^\s*["'“”]+/, "").trim();
  return rest.length > 0 ? rest : trimmed;
}

export function findEarliestHeadingTitle(body: string): string | undefined {
  const lines = splitLines(body);
  let fenceMark: "`" | "~" | null = null;

  for (const line of lines) {
    const fenceMatch = line.match(FENCE_MARK_RE);
    if (fenceMatch) {
      const ch = fenceMatch[1][0] as "`" | "~";
      if (!fenceMark) {
        fenceMark = ch;
        continue;
      }
      if (fenceMark === ch) {
        fenceMark = null;
      }
      continue;
    }
    if (fenceMark) continue;

    const headingMatch = line.match(ATX_HEADING_RE);
    if (!headingMatch) continue;
    const title = normalizeHeadingTitle(headingMatch[4] ?? "");
    if (title.length > 0) return title;
  }

  return undefined;
}

function promoteHeadingsToH1(body: string): string {
  const lines = splitLines(body);
  let fenceMark: "`" | "~" | null = null;
  let minDepth = 7;
  const headingIndexes: number[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fenceMatch = line.match(FENCE_MARK_RE);
    if (fenceMatch) {
      const ch = fenceMatch[1][0] as "`" | "~";
      if (!fenceMark) {
        fenceMark = ch;
        continue;
      }
      if (fenceMark === ch) {
        fenceMark = null;
      }
      continue;
    }
    if (fenceMark) continue;

    const match = line.match(ATX_HEADING_RE);
    if (!match) continue;
    headingIndexes.push(i);
    const depth = match[2].length;
    if (depth < minDepth) minDepth = depth;
  }

  if (headingIndexes.length === 0 || minDepth <= 1) {
    return lines.join("\n");
  }

  const offset = minDepth - 1;
  for (const index of headingIndexes) {
    const line = lines[index];
    const match = line.match(ATX_HEADING_RE);
    if (!match) continue;
    const indent = match[1] ?? "";
    const hashes = match[2] ?? "";
    const spacing = match[3] ?? " ";
    const tail = match[4] ?? "";
    const oldDepth = hashes.length;
    const newDepth = Math.max(1, oldDepth - offset);
    lines[index] = `${indent}${"#".repeat(newDepth)}${spacing}${tail}`;
  }

  return lines.join("\n");
}

function ensureTrailingNewline(text: string): string {
  return text.endsWith("\n") ? text : `${text}\n`;
}

function mergeFrontmatterAndBody(
  frontmatterBlock: string,
  body: string,
): string {
  const normalizedBody = body.replace(/^\n+/, "");
  if (normalizedBody.length === 0) {
    return ensureTrailingNewline(frontmatterBlock);
  }
  return ensureTrailingNewline(`${frontmatterBlock}\n${normalizedBody}`);
}

export function resolveMarkdownPrettierOptions(
  options?: MarkdownPrettierOptions,
): Required<MarkdownPrettierOptions> {
  return {
    printWidth:
      options?.printWidth ?? DEFAULT_MARKDOWN_PRETTIER_OPTIONS.printWidth,
    proseWrap:
      options?.proseWrap ?? DEFAULT_MARKDOWN_PRETTIER_OPTIONS.proseWrap,
    tabWidth: options?.tabWidth ?? DEFAULT_MARKDOWN_PRETTIER_OPTIONS.tabWidth,
    useTabs: options?.useTabs ?? DEFAULT_MARKDOWN_PRETTIER_OPTIONS.useTabs,
  };
}

export async function formatMarkdownWithPrettier(
  content: string,
  options?: MarkdownPrettierOptions,
): Promise<string> {
  const normalizedInput = normalizeLineBreaks(content);
  const resolved = resolveMarkdownPrettierOptions(options);

  return prettierFormat(normalizedInput, {
    parser: "markdown",
    printWidth: resolved.printWidth,
    proseWrap: resolved.proseWrap,
    tabWidth: resolved.tabWidth,
    useTabs: resolved.useTabs,
  });
}

export async function prettifyMarkdownContent(
  content: string,
  sourcePath: string,
  options: PrettifyOptions = {},
): Promise<PrettifyResult> {
  const absoluteSourcePath = path.resolve(sourcePath);
  const baseName = path.basename(
    absoluteSourcePath,
    path.extname(absoluteSourcePath),
  );

  const preserveFrontmatter = options.preserveFrontmatter ?? true;
  const promoteHeadings = options.promoteHeadings ?? true;

  const parsed = parseFrontmatter(content);
  const prettierBody = await formatMarkdownWithPrettier(
    parsed.body,
    options.prettier,
  );
  const promotedBody = promoteHeadings
    ? promoteHeadingsToH1(prettierBody)
    : prettierBody;
  const normalizedBody = normalizeChsEngLayout(promotedBody);

  const formattedBody = ensureTrailingNewline(normalizedBody);
  const prettifiedContent =
    preserveFrontmatter && parsed.hasFrontmatter && parsed.rawFrontmatterBlock
      ? mergeFrontmatterAndBody(parsed.rawFrontmatterBlock, formattedBody)
      : formattedBody;

  return {
    sourcePath: absoluteSourcePath,
    baseName,
    hasFrontmatter: parsed.hasFrontmatter,
    frontmatter: parsed.data,
    body: normalizedBody,
    prettifiedContent,
  };
}

export async function prettifyMarkdownFile(
  sourcePath: string,
  options: PrettifyOptions = {},
): Promise<PrettifyResult> {
  const absoluteSourcePath = path.resolve(sourcePath);
  const content = await fs.readFile(absoluteSourcePath, "utf-8");
  return prettifyMarkdownContent(content, absoluteSourcePath, options);
}

export { normalizeChsEngLayout } from "./chs-eng-layout.js";

import { unified } from "unified";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";

const HAN_SCRIPT_PATTERN = "\\p{Script=Han}";
const UNICODE_PUNCTUATION_PATTERN = "\\p{P}";
const CJK_RE = new RegExp(HAN_SCRIPT_PATTERN, "u");
const CJK_TO_ALNUM_RE = new RegExp(
  `(${HAN_SCRIPT_PATTERN})([A-Za-z0-9])`,
  "gu",
);
const ALNUM_TO_CJK_RE = new RegExp(
  `([A-Za-z0-9])(${HAN_SCRIPT_PATTERN})`,
  "gu",
);
const CJK_TO_OPEN_QUOTE_RE = new RegExp(
  `(${HAN_SCRIPT_PATTERN})\\s+([“‘])`,
  "gu",
);
const CLOSE_QUOTE_TO_CJK_RE = new RegExp(
  `([”’])\\s+(${HAN_SCRIPT_PATTERN})`,
  "gu",
);
const CJK_TO_OPEN_FULLWIDTH_PAREN_RE = new RegExp(
  `(${HAN_SCRIPT_PATTERN})\\s+（`,
  "gu",
);
const CLOSE_FULLWIDTH_PAREN_TO_CJK_RE = new RegExp(
  `）\\s+(${HAN_SCRIPT_PATTERN})`,
  "gu",
);
const FULLWIDTH_PUNCT_SPACE_BEFORE_RE = /\s+([，。！？：；、）】」』》])/g;
const FULLWIDTH_OPEN_PUNCT_SPACE_AFTER_RE = /([（【「『《])\s+/g;
const CJK_ASCII_PUNCT_LATIN_RE = new RegExp(
  `(${HAN_SCRIPT_PATTERN})([,.;:!?])([A-Za-z])`,
  "gu",
);
const EN_TERM_WITH_HAN_GLOSS_RE = new RegExp(
  `([A-Za-z][A-Za-z0-9_.-]*(?: [A-Za-z0-9_.-]+)*)\\s*（\\s*(${HAN_SCRIPT_PATTERN}[^）]*?)\\s*）`,
  "gu",
);
const ASCII_PUNCT_LATIN_RE = /([,;:!?])([A-Za-z])/g;
const NUMBER_PERCENT_OR_DEGREE_WITH_SPACE_RE = /(\d)\s+([%°])/g;
const NUMBER_UNIT_NO_SPACE_RE =
  /\b(\d+(?:\.\d+)?)(?:\s*)(Gbps|Mbps|Kbps|bps|TB|GB|MB|KB|ms|s|m|h|Hz|kHz|MHz|GHz)\b/g;
const MARKDOWN_TABLE_ROW_RE = /^\s*\|.*\|\s*$/;
const TOKEN_RE = /\uE000P(\d+)P\uE001/g;
const TOKEN_EXISTS_RE = /\uE000P\d+P\uE001/;
const AST_PROTECTED_NODE_TYPES = new Set([
  "definition",
  "footnoteReference",
  "image",
  "imageReference",
  "inlineCode",
  "link",
  "linkReference",
]);
const INLINE_HTML_PARENT_TYPES = new Set([
  "paragraph",
  "heading",
  "emphasis",
  "strong",
  "delete",
  "link",
  "linkReference",
  "tableCell",
]);

interface MarkdownNodePosition {
  start?: { offset?: number };
  end?: { offset?: number };
}

interface MarkdownAstNode {
  type?: string;
  position?: MarkdownNodePosition;
  children?: MarkdownAstNode[];
}

interface OffsetRange {
  start: number;
  end: number;
}

function addNodeRange(node: MarkdownAstNode, ranges: OffsetRange[]): void {
  const start = node.position?.start?.offset;
  const end = node.position?.end?.offset;
  if (
    typeof start === "number" &&
    Number.isFinite(start) &&
    typeof end === "number" &&
    Number.isFinite(end) &&
    end > start
  ) {
    ranges.push({ start, end });
  }
}

function parseMarkdownAst(input: string): MarkdownAstNode | undefined {
  try {
    return unified()
      .use(remarkParse)
      .use(remarkGfm)
      .parse(input) as unknown as MarkdownAstNode;
  } catch {
    return undefined;
  }
}

function toGlobalRegex(pattern: RegExp): RegExp {
  const flags = pattern.flags.includes("g")
    ? pattern.flags
    : `${pattern.flags}g`;
  return new RegExp(pattern.source, flags);
}

function protectByRegex(
  input: string,
  segments: string[],
  pattern: RegExp,
): string {
  const globalPattern = toGlobalRegex(pattern);
  return input.replace(globalPattern, (match) => {
    const token = `\uE000P${segments.length}P\uE001`;
    segments.push(match);
    return token;
  });
}

function collectHtmlBlockRangesFromAst(
  node: MarkdownAstNode,
  parentType: string | undefined,
  ranges: OffsetRange[],
): void {
  if (node.type === "html" && !INLINE_HTML_PARENT_TYPES.has(parentType ?? "")) {
    addNodeRange(node, ranges);
  }

  if (AST_PROTECTED_NODE_TYPES.has(node.type ?? "")) {
    addNodeRange(node, ranges);
  }

  if (!Array.isArray(node.children)) {
    return;
  }

  for (const child of node.children) {
    collectHtmlBlockRangesFromAst(child, node.type, ranges);
  }
}

function collectTextNodeRanges(
  node: MarkdownAstNode,
  ranges: OffsetRange[],
): void {
  if (node.type === "text") {
    addNodeRange(node, ranges);
  }

  if (!Array.isArray(node.children)) {
    return;
  }

  for (const child of node.children) {
    collectTextNodeRanges(child, ranges);
  }
}

function mergeOffsetRanges(ranges: OffsetRange[]): OffsetRange[] {
  if (ranges.length <= 1) {
    return ranges;
  }

  const sorted = [...ranges].sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    return a.end - b.end;
  });
  const merged: OffsetRange[] = [sorted[0]];

  for (let index = 1; index < sorted.length; index++) {
    const current = sorted[index];
    const previous = merged[merged.length - 1];
    if (current.start <= previous.end) {
      previous.end = Math.max(previous.end, current.end);
      continue;
    }
    merged.push(current);
  }

  return merged;
}

function collectCommonMarkHtmlBlockRanges(input: string): OffsetRange[] {
  const ast = parseMarkdownAst(input);
  if (!ast) {
    return [];
  }

  const ranges: OffsetRange[] = [];
  collectHtmlBlockRangesFromAst(ast, undefined, ranges);
  return mergeOffsetRanges(ranges);
}

function protectByOffsetRanges(
  input: string,
  segments: string[],
  ranges: OffsetRange[],
): string {
  if (ranges.length === 0) {
    return input;
  }

  let cursor = 0;
  let output = "";

  for (const range of ranges) {
    if (range.start < cursor) {
      continue;
    }
    if (range.start >= input.length) {
      break;
    }

    const safeStart = Math.max(0, range.start);
    const safeEnd = Math.min(input.length, range.end);
    if (safeEnd <= safeStart) {
      continue;
    }

    output += input.slice(cursor, safeStart);
    const token = `\uE000P${segments.length}P\uE001`;
    segments.push(input.slice(safeStart, safeEnd));
    output += token;
    cursor = safeEnd;
  }

  output += input.slice(cursor);
  return output;
}

function protectCommonMarkHtmlBlocks(
  input: string,
  segments: string[],
): string {
  const ranges = collectCommonMarkHtmlBlockRanges(input);
  return protectByOffsetRanges(input, segments, ranges);
}

function protectFencedCodeBlocks(input: string, segments: string[]): string {
  const lines = input.split("\n");
  const output: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const startMatch = lines[index].match(/^\s*(```+|~~~+)[^\n]*$/);
    if (!startMatch) {
      output.push(lines[index]);
      index += 1;
      continue;
    }

    const startMarker = startMatch[1];
    const markerChar = startMarker[0];
    const markerLen = startMarker.length;
    const blockLines = [lines[index]];
    index += 1;

    const endPattern = new RegExp(`^\\s*${markerChar}{${markerLen},}\\s*$`);
    while (index < lines.length) {
      blockLines.push(lines[index]);
      const isEnd = endPattern.test(lines[index]);
      index += 1;
      if (isEnd) break;
    }

    const token = `\uE000P${segments.length}P\uE001`;
    segments.push(blockLines.join("\n"));
    output.push(token);
  }

  return output.join("\n");
}

function isIndentedCodeLine(line: string): boolean {
  return /^(?:\t| {4})/.test(line);
}

function protectIndentedCodeBlocks(input: string, segments: string[]): string {
  const lines = input.split("\n");
  const output: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const previousLine = index > 0 ? lines[index - 1] : "";
    const canStartBlock =
      isIndentedCodeLine(line) &&
      (index === 0 || previousLine.trim().length === 0);

    if (!canStartBlock) {
      output.push(line);
      index += 1;
      continue;
    }

    const blockLines: string[] = [line];
    index += 1;

    while (index < lines.length) {
      const currentLine = lines[index];
      if (isIndentedCodeLine(currentLine) || currentLine.trim().length === 0) {
        blockLines.push(currentLine);
        index += 1;
        continue;
      }
      break;
    }

    const token = `\uE000P${segments.length}P\uE001`;
    segments.push(blockLines.join("\n"));
    output.push(token);
  }

  return output.join("\n");
}

function isEscaped(text: string, index: number): boolean {
  let slashCount = 0;
  for (let i = index - 1; i >= 0 && text[i] === "\\"; i--) {
    slashCount += 1;
  }
  return slashCount % 2 === 1;
}

function isWhitespaceChar(ch: string | undefined): boolean {
  return ch !== undefined && /\s/.test(ch);
}

function findMathClosingDelimiter(
  input: string,
  startIndex: number,
  delimiterLength: 1 | 2,
): number {
  const searchEndExclusive =
    delimiterLength === 1
      ? (() => {
          const lineBreakIndex = input.indexOf(
            "\n",
            startIndex + delimiterLength,
          );
          return lineBreakIndex >= 0 ? lineBreakIndex : input.length;
        })()
      : input.length;

  for (let i = startIndex + delimiterLength; i < searchEndExclusive; i++) {
    if (input[i] !== "$" || isEscaped(input, i)) continue;

    if (delimiterLength === 2) {
      if (input[i + 1] === "$" && !isEscaped(input, i + 1)) {
        return i;
      }
      continue;
    }

    if (input[i + 1] === "$") continue;
    if (isWhitespaceChar(input[i - 1])) continue;
    return i;
  }

  return -1;
}

function protectMathExpressions(input: string, segments: string[]): string {
  let output = "";
  let index = 0;

  while (index < input.length) {
    if (input[index] !== "$" || isEscaped(input, index)) {
      output += input[index];
      index += 1;
      continue;
    }

    const delimiterLength: 1 | 2 =
      input[index + 1] === "$" && !isEscaped(input, index + 1) ? 2 : 1;
    const openingLength = delimiterLength;
    const nextChar = input[index + openingLength];

    if (delimiterLength === 1) {
      if (!nextChar || isWhitespaceChar(nextChar) || nextChar === "$") {
        output += input[index];
        index += 1;
        continue;
      }
    } else if (!nextChar) {
      output += "$$";
      index += 2;
      continue;
    }

    const closeIndex = findMathClosingDelimiter(input, index, delimiterLength);
    if (closeIndex < 0) {
      output += input.slice(index, index + openingLength);
      index += openingLength;
      continue;
    }

    const closingLength = delimiterLength;
    const segment = input.slice(index, closeIndex + closingLength);
    const token = `\uE000P${segments.length}P\uE001`;
    segments.push(segment);
    output += token;
    index = closeIndex + closingLength;
  }

  return output;
}

function restoreProtected(input: string, segments: string[]): string {
  let restored = input;

  // A protected segment may contain older placeholder tokens; iterate until stable.
  for (let pass = 0; pass <= segments.length; pass++) {
    const next = restored.replace(TOKEN_RE, (_full, indexRaw: string) => {
      const index = Number.parseInt(indexRaw, 10);
      return Number.isFinite(index) && segments[index] !== undefined
        ? segments[index]
        : "";
    });
    restored = next;
    if (!TOKEN_EXISTS_RE.test(restored)) break;
  }

  return restored;
}

function transformByOffsetRanges(
  input: string,
  ranges: OffsetRange[],
  transformer: (segment: string) => string,
): string {
  if (ranges.length === 0) {
    return input;
  }

  let cursor = 0;
  let output = "";

  for (const range of ranges) {
    if (range.start < cursor) {
      continue;
    }

    const safeStart = Math.max(0, range.start);
    const safeEnd = Math.min(input.length, range.end);
    if (safeEnd <= safeStart) {
      continue;
    }

    output += input.slice(cursor, safeStart);
    output += transformer(input.slice(safeStart, safeEnd));
    cursor = safeEnd;
  }

  output += input.slice(cursor);
  return output;
}

function replaceUnescapedMatches(
  input: string,
  pattern: RegExp,
  replacer: (match: RegExpExecArray) => string,
): string {
  const globalPattern = toGlobalRegex(pattern);
  let output = "";
  let lastIndex = 0;

  for (const match of input.matchAll(globalPattern)) {
    const startIndex = match.index ?? 0;
    const fullMatch = match[0] ?? "";
    const endIndex = startIndex + fullMatch.length;

    if (isEscaped(input, startIndex)) {
      continue;
    }

    output += input.slice(lastIndex, startIndex);
    output += replacer(match as RegExpExecArray);
    lastIndex = endIndex;
  }

  output += input.slice(lastIndex);
  return output;
}

function repairEscapedInlineMarkup(input: string): string {
  if (TOKEN_EXISTS_RE.test(input)) {
    return input;
  }

  let repaired = input;

  repaired = replaceUnescapedMatches(
    repaired,
    new RegExp(`(?<!_)__([^_\\n]+?)__(?=${HAN_SCRIPT_PATTERN})`, "gu"),
    (match) => `<strong>${match[1]}</strong>`,
  );

  repaired = replaceUnescapedMatches(
    repaired,
    new RegExp(
      `(?<!\\*)\\*\\*([^*\\n]*?${UNICODE_PUNCTUATION_PATTERN})\\*\\*(?=${HAN_SCRIPT_PATTERN})`,
      "gu",
    ),
    (match) => `<strong>${match[1]}</strong>`,
  );

  repaired = replaceUnescapedMatches(
    repaired,
    new RegExp(
      `(?<!~)~~([^~\\n]*?${UNICODE_PUNCTUATION_PATTERN})~~(?=${HAN_SCRIPT_PATTERN})`,
      "gu",
    ),
    (match) => `<del>${match[1]}</del>`,
  );

  repaired = replaceUnescapedMatches(
    repaired,
    new RegExp(`(?<!_)_([^_\\n]+?)_(?=${HAN_SCRIPT_PATTERN})`, "gu"),
    (match) => `<em>${match[1]}</em>`,
  );

  repaired = replaceUnescapedMatches(
    repaired,
    new RegExp(
      `(?<!\\*)\\*([^*\\n]*?${UNICODE_PUNCTUATION_PATTERN})\\*(?=${HAN_SCRIPT_PATTERN})`,
      "gu",
    ),
    (match) => `<em>${match[1]}</em>`,
  );

  return repaired;
}

function repairEscapedInlineMarkupByAst(input: string): string {
  const ast = parseMarkdownAst(input);
  if (!ast) {
    return repairEscapedInlineMarkup(input);
  }

  const ranges: OffsetRange[] = [];
  collectTextNodeRanges(ast, ranges);
  return transformByOffsetRanges(input, ranges, repairEscapedInlineMarkup);
}

function protectMarkdownSensitiveParts(input: string): {
  text: string;
  segments: string[];
} {
  const segments: string[] = [];
  let protectedText = protectCommonMarkHtmlBlocks(input, segments);

  protectedText = protectFencedCodeBlocks(protectedText, segments);
  protectedText = protectIndentedCodeBlocks(protectedText, segments);
  protectedText = protectByRegex(protectedText, segments, /`+[^`\n]*`+/g);
  protectedText = protectMathExpressions(protectedText, segments);
  // Preserve hard-break markers (2+ trailing spaces) during normalization.
  protectedText = protectByRegex(protectedText, segments, / {2,}(?=\r?\n|$)/g);
  protectedText = protectByRegex(
    protectedText,
    segments,
    /!?\[[^\]\n]*\]\((?:\\.|[^)\n])*\)/g,
  );
  protectedText = protectByRegex(
    protectedText,
    segments,
    /<\/?[A-Za-z][^>\n]*>/g,
  );
  protectedText = protectByRegex(
    protectedText,
    segments,
    /\bhttps?:\/\/[^\s<>()]+/g,
  );
  protectedText = repairEscapedInlineMarkupByAst(protectedText);

  return {
    text: protectedText,
    segments,
  };
}

function hasCjk(input: string): boolean {
  return CJK_RE.test(input);
}

function normalizeQuotesInChineseContext(line: string): string {
  if (!hasCjk(line)) return line;

  let normalized = line;
  normalized = normalized.replace(/「([^「」\n]*)」/g, "“$1”");
  normalized = normalized.replace(/『([^『』\n]*)』/g, "‘$1’");
  normalized = normalized.replace(/"([^"\n]+)"/g, "“$1”");
  normalized = normalized.replace(/'([^'\n]+)'/g, "‘$1’");
  normalized = normalized.replace(CJK_TO_OPEN_QUOTE_RE, "$1$2");
  normalized = normalized.replace(CLOSE_QUOTE_TO_CJK_RE, "$1$2");
  return normalized;
}

function normalizeParenthesesInChineseContext(line: string): string {
  if (!hasCjk(line)) return line;

  let normalized = line;

  // Default in Chinese context: use full-width parentheses.
  normalized = normalized.replace(/\(\s*/g, "（");
  normalized = normalized.replace(/\s*\)/g, "）");

  // Exception: English term + Chinese gloss should keep half-width parentheses.
  normalized = normalized.replace(EN_TERM_WITH_HAN_GLOSS_RE, "$1 ($2)");

  // Half-width parentheses spacing (for the exception).
  normalized = normalized.replace(/\s*\(\s*/g, " (");
  normalized = normalized.replace(/\s*\)\s*/g, ") ");
  normalized = normalized.replace(/\s+([，。！？：；,.!?;:])/g, "$1");

  // Full-width parentheses around Chinese should not add spaces.
  normalized = normalized.replace(CJK_TO_OPEN_FULLWIDTH_PAREN_RE, "$1（");
  normalized = normalized.replace(CLOSE_FULLWIDTH_PAREN_TO_CJK_RE, "）$1");

  return normalized;
}

function normalizePunctuationSpacing(line: string): string {
  let normalized = line;
  normalized = normalized.replace(FULLWIDTH_PUNCT_SPACE_BEFORE_RE, "$1");
  normalized = normalized.replace(FULLWIDTH_OPEN_PUNCT_SPACE_AFTER_RE, "$1");
  normalized = normalized.replace(CJK_ASCII_PUNCT_LATIN_RE, "$1$2 $3");
  normalized = normalized.replace(ASCII_PUNCT_LATIN_RE, "$1 $2");
  return normalized;
}

function normalizeMixedSpacing(line: string): string {
  let normalized = line;
  normalized = normalized.replace(CJK_TO_ALNUM_RE, "$1 $2");
  normalized = normalized.replace(ALNUM_TO_CJK_RE, "$1 $2");
  normalized = normalized.replace(NUMBER_UNIT_NO_SPACE_RE, "$1 $2");
  normalized = normalized.replace(
    NUMBER_PERCENT_OR_DEGREE_WITH_SPACE_RE,
    "$1$2",
  );
  return normalized;
}

function normalizeEmDash(line: string): string {
  let output = "";
  let index = 0;

  while (index < line.length) {
    const isDoubleEmDash = line[index] === "—" && line[index + 1] === "—";
    if (!isDoubleEmDash) {
      output += line[index];
      index += 1;
      continue;
    }

    const isLongerRun = line[index - 1] === "—" || line[index + 2] === "—";
    if (isLongerRun) {
      output += line[index];
      index += 1;
      continue;
    }

    let lastNonWhitespaceIndex = output.length - 1;
    while (
      lastNonWhitespaceIndex >= 0 &&
      /\s/.test(output[lastNonWhitespaceIndex] ?? "")
    ) {
      lastNonWhitespaceIndex -= 1;
    }

    if (lastNonWhitespaceIndex >= 0) {
      output = output.slice(0, lastNonWhitespaceIndex + 1);
    }

    index += 2;
    while (index < line.length && /\s/.test(line[index] ?? "")) {
      index += 1;
    }

    const hasLeftContent = lastNonWhitespaceIndex >= 0;
    const hasRightContent = index < line.length;
    if (hasLeftContent && hasRightContent) {
      output += " -- ";
      continue;
    }
    if (hasLeftContent) {
      output += " --";
      continue;
    }
    if (hasRightContent) {
      output += "-- ";
      continue;
    }

    output += "--";
  }

  return output;
}

function compressSpaces(line: string): string {
  if (MARKDOWN_TABLE_ROW_RE.test(line)) {
    return line.trimEnd();
  }

  const leading = line.match(/^\s*/)?.[0] ?? "";
  const content = line.slice(leading.length).replace(/ {2,}/g, " ");
  return `${leading}${content}`.trimEnd();
}

function normalizeLine(line: string): string {
  let normalized = line;
  normalized = normalizeQuotesInChineseContext(normalized);
  normalized = normalizeParenthesesInChineseContext(normalized);
  normalized = normalizePunctuationSpacing(normalized);
  normalized = normalizeMixedSpacing(normalized);
  normalized = normalizeEmDash(normalized);
  normalized = compressSpaces(normalized);
  return normalized;
}

export function normalizeChsEngLayout(input: string): string {
  const { text: protectedText, segments } =
    protectMarkdownSensitiveParts(input);
  const normalized = protectedText
    .split("\n")
    .map((line) => normalizeLine(line))
    .join("\n")
    .replace(/[ \t]+$/gm, "");
  return restoreProtected(normalized, segments);
}

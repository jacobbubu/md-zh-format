import * as fs from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
  prettifyMarkdownFile,
  type MarkdownPrettierOptions,
} from "../../src/index.js";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const inputPath = path.join(currentDir, "input.md");
const outputPath = path.join(currentDir, "output.md");

const prettierOptions: MarkdownPrettierOptions = {
  printWidth: 80,
  proseWrap: "preserve",
  tabWidth: 2,
  useTabs: false,
};

const result = await prettifyMarkdownFile(inputPath, {
  prettier: prettierOptions,
  preserveFrontmatter: true,
  promoteHeadings: true,
});

await fs.writeFile(outputPath, result.prettifiedContent, "utf-8");

console.log(`Input:  ${inputPath}`);
console.log(`Output: ${outputPath}`);
console.log("\n--- Formatted Markdown ---\n");
console.log(result.prettifiedContent);

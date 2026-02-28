import { chmod } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const cliPath = resolve(process.cwd(), "dist/cli.js");

if (!existsSync(cliPath)) {
  process.exit(0);
}

await chmod(cliPath, 0o755);

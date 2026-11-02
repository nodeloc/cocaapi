import { copyFile, readdir } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const output = resolve(dirname(fileURLToPath(import.meta.url)), "../out");

async function normalize(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  let copied = 0;
  for (const entry of entries) {
    const source = join(directory, entry.name);
    if (entry.isDirectory()) {
      copied += await normalize(source);
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith(".txt")) continue;
    const parts = relative(output, source).split(sep);
    const segment = parts.findIndex((part) => part.startsWith("__next."));
    if (segment < 0 || segment === parts.length - 1) continue;
    await copyFile(source, join(output, ...parts.slice(0, segment), parts.slice(segment).join(".")));
    copied += 1;
  }
  return copied;
}

process.stdout.write(`Static export segment aliases: ${await normalize(output)}\n`);

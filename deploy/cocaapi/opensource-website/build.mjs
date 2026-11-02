import { cp, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const output = fileURLToPath(new URL("./dist/", import.meta.url));
await mkdir(output, { recursive: true });
await cp(
  new URL("./index.html", import.meta.url),
  new URL("./dist/index.html", import.meta.url),
);
await cp(
  new URL("./assets/", import.meta.url),
  new URL("./dist/assets/", import.meta.url),
  { recursive: true },
);
console.log("Built static website: " + output);

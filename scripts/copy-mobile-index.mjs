import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const source = resolve("dist/mobile/index.html");
const target = resolve("dist/index.html");

mkdirSync(dirname(target), { recursive: true });
copyFileSync(source, target);
// Tailwind CSS を static assets（public/assets/）にコピーする。
// Cloudflare 側は [assets] で /assets/tailwind.css として配信する。
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "..", "src", "ui", "styles", "tailwind.generated.css");
const destDir = join(here, "..", "public", "assets");

mkdirSync(destDir, { recursive: true });
copyFileSync(src, join(destDir, "tailwind.css"));

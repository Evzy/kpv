import { cp, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readReleaseVersion } from "../../scripts/read-release-version.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function main() {
  const meta = await readReleaseVersion();
  const owner = (process.env.KPV_GITHUB_OWNER || meta.githubOwner || "").trim() || "Evzy";
  const src = path.join(root, "js", "bootstrap.js");
  let text = await readFile(src, "utf8");
  text = text
    .replace(/__KPV_WGT_SHELL_VERSION__/g, meta.wgtShellVersion)
    .replace(/__KPV_RELEASES_OWNER__/g, owner)
    .replace(/__KPV_RELEASES_REPO__/g, "kpv-releases");
  await writeFile(path.join(root, "bootstrap.js"), text, "utf8");

  const jszipMin = path.join(root, "node_modules", "jszip", "dist", "jszip.min.js");
  await cp(jszipMin, path.join(root, "jszip.min.js"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

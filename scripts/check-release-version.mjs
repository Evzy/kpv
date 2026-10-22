import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readReleaseVersion } from "./read-release-version.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function readTizenPackageVersion() {
  const pkg = JSON.parse(await readFile(path.join(repoRoot, "tizen", "package.json"), "utf8"));
  return String(pkg.version || "").replace(/^v/i, "");
}

async function readBootstrapShellVersion() {
  const boot = await readFile(path.join(repoRoot, "tizen", "bootstrap.js"), "utf8");
  const m = boot.match(/WGT_SHELL_VERSION\s*=\s*"([^"]+)"/);
  return m ? m[1].replace(/^v/i, "") : "";
}

async function main() {
  const meta = await readReleaseVersion();
  const tizen = await readTizenPackageVersion();
  const shell = await readBootstrapShellVersion();
  const errors = [];
  if (tizen !== meta.version) {
    errors.push(`tizen/package.json version ${tizen} != release ${meta.version}`);
  }
  if (shell && shell !== meta.wgtShellVersion) {
    errors.push(`tizen/bootstrap.js shell ${shell} != release wgtShellVersion ${meta.wgtShellVersion}`);
  }
  if (errors.length) {
    console.error(errors.join("\n"));
    process.exit(1);
  }
  console.log(`Release version OK: ${meta.version} (${meta.versionCode})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

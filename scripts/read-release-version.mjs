import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function releaseVersionPath() {
  return path.join(repoRoot, "release", "version.json");
}

export async function readReleaseVersion() {
  const raw = JSON.parse(await readFile(releaseVersionPath(), "utf8"));
  return {
    version: String(raw.version || "0.0.0").replace(/^v/i, ""),
    versionCode: Number.parseInt(String(raw.versionCode ?? 1), 10) || 1,
    wgtShellVersion: String(raw.wgtShellVersion || raw.version || "0.0.0").replace(/^v/i, ""),
    minWgtShell: String(raw.minWgtShell || "0.0.0").replace(/^v/i, ""),
    forceWgtInstall: Boolean(raw.forceWgtInstall),
    githubOwner: String(raw.githubOwner || "").trim(),
  };
}

export async function syncTizenPackageJson() {
  const meta = await readReleaseVersion();
  const pkgPath = path.join(repoRoot, "tizen", "package.json");
  const pkg = JSON.parse(await readFile(pkgPath, "utf8"));
  pkg.version = meta.version;
  await writeFile(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
  return meta;
}

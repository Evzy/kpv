import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readReleaseVersion } from "./read-release-version.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function main() {
  const meta = await readReleaseVersion();
  const owner = (process.env.KPV_GITHUB_OWNER || meta.githubOwner || process.env.GITHUB_REPOSITORY_OWNER || "").trim();
  if (!owner) {
    console.error("Set KPV_GITHUB_OWNER or githubOwner in release/version.json");
    process.exit(1);
  }
  const tag = `v${meta.version}`;
  const base = `https://github.com/${owner}/kpv-releases/releases/download/${tag}`;
  const bundleSha256 = (process.env.KPV_BUNDLE_SHA256 || "").trim().toLowerCase();
  if (!bundleSha256) {
    console.error("Set KPV_BUNDLE_SHA256 (hex) before generating manifest");
    process.exit(1);
  }
  const manifest = {
    manifestVersion: 1,
    bundleVersion: meta.version,
    bundleUrl: `${base}/kpv-web-bundle.zip`,
    bundleSha256,
    minWgtShell: meta.minWgtShell,
    forceWgtInstall: meta.forceWgtInstall,
    wgtUrl: `${base}/KPV-v${meta.version}.wgt`,
    releaseNotes: process.env.KPV_RELEASE_NOTES || "",
  };
  const out = path.join(repoRoot, "release", "kpv-tv-manifest.json");
  await writeFile(out, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(`Wrote ${out}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

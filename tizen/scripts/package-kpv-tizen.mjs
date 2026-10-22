/**
 * WGT packager (same approach as NuvioMedia/NuvioTizen).
 * JSZip + forward-slash paths — avoids Windows zip parsing errors on Samsung TVs.
 */
import { access, cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";
import { readReleaseVersion } from "../../scripts/read-release-version.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const cacheDir = path.join(rootDir, ".cache");
const stagingDir = path.join(cacheDir, "tizen-package");

const defaultAppName = "KPV";
/** Must match Apps2Samsung author certificate prefix (see DEBUG.md). */
const defaultPackageId = process.env.TIZEN_PACKAGE_ID || "NuvioTV001";
const defaultAppId = process.env.TIZEN_APP_ID || `${defaultPackageId}.KPV`;

function normalizeVersion(version) {
  const parts = String(version || "0.0.0")
    .replace(/^v/i, "")
    .split(".")
    .map((part) => String(Number.parseInt(part, 10) || 0));
  while (parts.length < 3) parts.push("0");
  return parts.slice(0, 3).join(".");
}

async function pathExists(filePath) {
  try {
    await access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function readPackageVersion() {
  const versionPath = path.join(rootDir, "..", "release", "version.json");
  try {
    const raw = JSON.parse(await readFile(versionPath, "utf8"));
    return normalizeVersion(raw.wgtShellVersion || raw.version || "0.0.0");
  } catch {
    const packageJson = JSON.parse(await readFile(path.join(rootDir, "package.json"), "utf8"));
    return normalizeVersion(packageJson.version || "0.0.0");
  }
}

function updateConfigXml(configXml, { version, appId, packageId, appName }) {
  let next = configXml;
  next = next.replace(/(<widget\b[^>]*\bversion=")[^"]*(")/, `$1${version}$2`);
  next = next.replace(
    /<tizen:application id="[^"]*" package="[^"]*"/,
    `<tizen:application id="${appId}" package="${packageId}"`,
  );
  next = next.replace(/<name>[\s\S]*?<\/name>/, `<name>${appName}</name>`);
  return next;
}

async function stagePackage({ version, appId, packageId, appName, hello }) {
  await rm(stagingDir, { recursive: true, force: true });
  await mkdir(stagingDir, { recursive: true });

  const configPath = hello ? path.join(rootDir, "hello", "config.xml") : path.join(rootDir, "config.xml");
  const configXml = await readFile(configPath, "utf8");
  await writeFile(
    path.join(stagingDir, "config.xml"),
    updateConfigXml(configXml, { version, appId, packageId, appName }),
    "utf8",
  );

  if (hello) {
    await cp(path.join(rootDir, "hello", "index.html"), path.join(stagingDir, "index.html"));
    await cp(path.join(rootDir, "icon.png"), path.join(stagingDir, "icon.png"));
    return;
  }

  const flatFiles = [
    "bundle-cache.js",
    "boot.js",
    "bootstrap.js",
    "jszip.min.js",
    "index.html",
    "watch.html",
    "watch.js",
    "sniff.html",
    "sniff.js",
    "embed-engine.js",
    "avplay-play.js",
    "site.js",
    "companion.js",
    "playback-cache.js",
    "stream-resolve.js",
    "tizen-play.js",
    "tv-keys.js",
    "main.js",
    "style.css",
    "icon.png",
    "hls-shell.html",
    "hls.min.js",
  ];
  const releaseMeta = await readReleaseVersion();
  for (const name of flatFiles) {
    const src = path.join(rootDir, name);
    if (!(await pathExists(src))) continue;
    if (name === "index.html") {
      let html = await readFile(src, "utf8");
      html = html
        .replace(/__KPV_APP_VERSION__/g, `v${releaseMeta.version}`)
        .replace(/__KPV_STYLE_VER__/g, releaseMeta.version);
      await writeFile(path.join(stagingDir, name), html, "utf8");
      continue;
    }
    await cp(src, path.join(stagingDir, name));
  }
}

async function addDirectoryToZip(zip, dir, baseDir = dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === ".DS_Store") continue;
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(baseDir, fullPath).split(path.sep).join("/");
    if (entry.isDirectory()) {
      await addDirectoryToZip(zip, fullPath, baseDir);
      continue;
    }
    if (entry.isFile()) {
      zip.file(relativePath, await readFile(fullPath), { createFolders: false });
    }
  }
}

function parseArgs(argv) {
  const options = {
    outDir: rootDir,
    appId: defaultAppId,
    packageId: defaultPackageId,
    appName: defaultAppName,
    outputName: "KPV.wgt",
    hello: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--hello") {
      options.hello = true;
      options.appId = `${defaultPackageId}.KPVHello`;
      options.appName = "KPV Hello";
      options.outputName = "KPV-Hello.wgt";
      continue;
    }
    if (arg === "--outdir") {
      options.outDir = path.resolve(argv[i + 1] || "");
      i += 1;
    } else if (arg === "--app-id") {
      options.appId = argv[i + 1] || "";
      i += 1;
    } else if (arg === "--package-id") {
      options.packageId = argv[i + 1] || "";
      i += 1;
    }
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const version = await readPackageVersion();
  await stagePackage({ ...options, version });
  await mkdir(options.outDir, { recursive: true });
  const outputPath = path.join(options.outDir, options.outputName);
  const zip = new JSZip();
  await addDirectoryToZip(zip, stagingDir);
  const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  await writeFile(outputPath, buffer);
  console.log(`KPV WGT created: ${outputPath}`);
  console.log(`Tizen application id: ${options.appId}`);
  console.log(`Version: ${version}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

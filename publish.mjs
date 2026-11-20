// Release the Songloft plugin.
//   node publish.mjs            typecheck + build, write plugin.json (with hashes) to the repo root
//                               and copy the package to worker/public/songloft (bbc.wegoto.top mirror)
//   then commit + push
//   node publish.mjs --release  create the GitHub Release v<version> on HEAD and upload dist/ zip
//   cd worker && npx wrangler deploy   (updates the bbc.wegoto.top mirror)
import { execSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = "jerryrat/BBC-LEARNING";
const here = dirname(fileURLToPath(import.meta.url));
const mirror = join(here, "worker", "public", "songloft");
const RAW = "https://raw.githubusercontent.com/" + REPO + "/main";

if (process.argv.includes("--release")) {
  await release();
  process.exit(0);
}

execSync("npm run typecheck", { cwd: here, stdio: "inherit" });

// Point the manifest at the release we are about to make, then build.
const src = JSON.parse(readFileSync(join(here, "plugin.json"), "utf8"));
const pkg = JSON.parse(readFileSync(join(here, "package.json"), "utf8"));
if (pkg.version !== src.version) throw new Error("package.json and plugin.json versions differ");
const zipName = src.entryPath + ".jsplugin.zip";
src.updateUrl = RAW + "/plugin.json";
src.download_url = "https://github.com/" + REPO + "/releases/download/v" + src.version + "/" + zipName;
writeFileSync(join(here, "plugin.json"), JSON.stringify(src, null, 2) + "\n");
execSync("npm run build", { cwd: here, stdio: "inherit" });

const built = JSON.parse(readFileSync(join(here, "dist", "_build", "plugin.json"), "utf8"));
const zip = join(here, "dist", zipName);
// Root manifest = built hashes/version, but keep the source names (main.js, icon.svg) so the next build still works.
writeFileSync(join(here, "plugin.json"), JSON.stringify({ ...built, main: src.main, icon: src.icon }, null, 2) + "\n");
writeFileSync(
  join(here, "registry.json"),
  JSON.stringify({ name: "BBC Learning English", plugins: [RAW + "/plugin.json"] }, null, 2) + "\n",
);
// Mirror on bbc.wegoto.top: early installs use https://bbc.wegoto.top/songloft/plugin.json as updateUrl.
mkdirSync(mirror, { recursive: true });
copyFileSync(zip, join(mirror, zipName));
writeFileSync(join(mirror, "plugin.json"), JSON.stringify(built, null, 2) + "\n");
writeFileSync(
  join(mirror, "registry.json"),
  JSON.stringify({ name: "BBC Learning English", plugins: ["https://bbc.wegoto.top/songloft/plugin.json"] }, null, 2) + "\n",
);
console.log("built " + built.version + " - now commit + push, then: node publish.mjs --release");

// Uploads the zip that was built above (same hashes as the committed plugin.json).
async function release() {
  const built = JSON.parse(readFileSync(join(here, "plugin.json"), "utf8"));
  const zipName = built.entryPath + ".jsplugin.zip";
  const zip = join(here, "dist", zipName);
  const inZip = JSON.parse(readFileSync(join(here, "dist", "_build", "plugin.json"), "utf8"));
  if (inZip.zipHash !== built.zipHash || inZip.version !== built.version)
    throw new Error("dist/ does not match the committed plugin.json - run node publish.mjs first");
  if (execSync("git status --porcelain", { cwd: here }).toString().trim())
    throw new Error("commit and push first");
  const cred = execSync("git credential-manager get", { input: "protocol=https\nhost=github.com\n\n" }).toString();
  const token = (/^password=(.*)$/m.exec(cred) || [])[1];
  if (!token) throw new Error("no GitHub token in Git Credential Manager");
  const h = { Authorization: "Bearer " + token, Accept: "application/vnd.github+json" };
  const tag = "v" + built.version;
  const head = execSync("git rev-parse HEAD", { cwd: here }).toString().trim();
  let r = await fetch("https://api.github.com/repos/" + REPO + "/releases", {
    method: "POST",
    headers: { ...h, "Content-Type": "application/json" },
    body: JSON.stringify({
      tag_name: tag,
      target_commitish: head,
      name: tag,
      body: "BBC Learning English Songloft plugin " + built.version + "\n\nSource commit: " + head,
    }),
  });
  if (!r.ok) throw new Error("create release: " + r.status + " " + (await r.text()));
  const rel = await r.json();
  const upload = rel.upload_url.replace(/\{.*\}$/, "") + "?name=" + zipName;
  r = await fetch(upload, {
    method: "POST",
    headers: { ...h, "Content-Type": "application/zip" },
    body: readFileSync(zip),
  });
  if (!r.ok) throw new Error("upload asset: " + r.status + " " + (await r.text()));
  console.log("released " + tag + ": " + built.download_url);
}

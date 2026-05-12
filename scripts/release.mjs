import { execSync } from "child_process";
import { readFileSync, writeFileSync } from "fs";
import { createInterface } from "readline";

const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((resolve) => rl.question(q, resolve));

const RUN = "\x1b[36m[release]\x1b[0m";
const OK = "\x1b[32m✔\x1b[0m";
const ERR = "\x1b[31m✖\x1b[0m";

function run(cmd, opts = {}) {
  return execSync(cmd, { encoding: "utf-8", stdio: opts.silent ? "pipe" : "inherit", ...opts }).trim?.();
}

function getPkgVersion() {
  return JSON.parse(readFileSync("package.json", "utf8")).version;
}

function bumpVersion(target) {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  pkg.version = target;
  writeFileSync("package.json", JSON.stringify(pkg, null, "\t") + "\n");

  // mirror manifest and versions via the existing bump script
  process.env.npm_package_version = target;
  run("node version-bump.mjs", { silent: true });
}

function inferStableVersion(prerelease) {
  // 1.0.1-beta.20 -> 1.0.1
  const match = prerelease.match(/^(\d+\.\d+\.\d+)/);
  return match ? match[1] : null;
}

function getOriginRepo() {
  try {
    const remotes = run("git remote -v", { silent: true });
    const originMatch = remotes.match(/origin\s+git@github\.com:([^/]+\/[^.]+)\.git/);
    if (originMatch) return originMatch[1];
    const httpsMatch = remotes.match(/origin\s+https:\/\/github\.com\/([^/]+\/[^/\s]+)/);
    if (httpsMatch) return httpsMatch[1].replace(/\.git$/, "");
  } catch {
    // fall through
  }
  return null;
}

async function main() {
  const args = process.argv.slice(2);
  const isPrepare = args.includes("--prepare");
  const isPublish = args.includes("--publish");
  const targetVersion = args.find((a) => !a.startsWith("--"));

  console.log(`${RUN} Starting release workflow…`);

  // ── 1. Pre-flight checks ──────────────────────────────────────────
  const branch = run("git branch --show-current", { silent: true });
  if (branch !== "main") {
    console.error(`${ERR} Not on main branch (currently on '${branch}'). Abort.`);
    process.exit(1);
  }
  console.log(`${OK} On main branch`);

  const status = run("git status --short", { silent: true });
  if (status) {
    console.error(`${ERR} Working tree is not clean:\n${status}\nAbort.`);
    process.exit(1);
  }
  console.log(`${OK} Working tree clean`);

  try {
    run("git fetch origin main --quiet", { silent: true });
    const local = run("git rev-parse HEAD", { silent: true });
    const remote = run("git rev-parse origin/main", { silent: true });
    if (local !== remote) {
      console.error(`${ERR} Local main is ahead/behind origin/main. Push/pull first. Abort.`);
      process.exit(1);
    }
    console.log(`${OK} Local main is in sync with origin/main`);
  } catch {
    console.warn(`${RUN} Could not verify remote sync; continuing anyway.`);
  }

  console.log(`${RUN} Building…`);
  run("npm run build", { silent: false });
  console.log(`${OK} Build succeeded`);

  // ── 2. Determine version ──────────────────────────────────────────
  const current = getPkgVersion();
  let next = targetVersion;

  if (!next) {
    const suggested = inferStableVersion(current);
    const answer = await ask(
      `Current version is ${current}. ` +
        (suggested ? `Suggested stable version: ${suggested}. ` : "") +
        `Enter version to release (or press Enter for ${suggested ?? "manual input"}): `
    );
    next = answer.trim() || suggested;
    if (!next) {
      console.error(`${ERR} No version provided. Abort.`);
      process.exit(1);
    }
  }

  if (!/^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/.test(next)) {
    console.error(`${ERR} Invalid semver version: ${next}. Abort.`);
    process.exit(1);
  }

  const tagExists = run(`git tag --list ${next}`, { silent: true });
  if (tagExists) {
    console.error(`${ERR} Tag ${next} already exists locally. Abort.`);
    process.exit(1);
  }

  console.log(`${RUN} Releasing version ${next} (from ${current})`);

  // ── 3. Bump & commit ──────────────────────────────────────────────
  console.log(`${RUN} Bumping version files…`);
  bumpVersion(next);
  run("git add package.json package-lock.json manifest.json versions.json", { silent: true });
  run(`git commit -m "Release ${next}"`, { silent: false });
  console.log(`${OK} Committed version bump`);

  // ── 4. Tag ────────────────────────────────────────────────────────
  run(`git tag ${next}`, { silent: false });
  console.log(`${OK} Created tag ${next}`);

  if (isPrepare && !isPublish) {
    console.log(`${RUN} Preparation complete. Tag and commit are local only.`);
    console.log(`${RUN} Run again with --publish to push and create GitHub Release.`);
    rl.close();
    return;
  }

  // ── 5. Push ───────────────────────────────────────────────────────
  console.log(`${RUN} Pushing main and tag to origin…`);
  run("git push origin main", { silent: false });
  run(`git push origin ${next}`, { silent: false });
  console.log(`${OK} Pushed`);

  // ── 6. GitHub Release ─────────────────────────────────────────────
  const repo = getOriginRepo();
  if (!repo) {
    console.error(`${ERR} Could not detect origin repo. Create GitHub Release manually.`);
    rl.close();
    process.exit(1);
  }

  try {
    run("gh --version", { silent: true });
  } catch {
    console.error(`${ERR} GitHub CLI (gh) not found. Install it or create the release manually.`);
    rl.close();
    process.exit(1);
  }

  console.log(`${RUN} Creating GitHub Release on ${repo}…`);
  const assets = ["main.js", "manifest.json", "styles.css"]
    .filter((f) => {
      try {
        readFileSync(f);
        return true;
      } catch {
        return false;
      }
    })
    .join(" ");

  run(
    `gh release create ${next} --repo ${repo} --title "${next}" --notes "Release ${next}" ${assets}`,
    { silent: false }
  );
  console.log(`${OK} GitHub Release ${next} created`);

  rl.close();
}

main().catch((e) => {
  console.error(e);
  rl.close();
  process.exit(1);
});

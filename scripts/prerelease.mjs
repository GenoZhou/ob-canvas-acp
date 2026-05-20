#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const args = process.argv.slice(2);

const VERSION_FILES = {
	packageJson: path.join(rootDir, "package.json"),
	packageLock: path.join(rootDir, "package-lock.json"),
	manifest: path.join(rootDir, "manifest.json"),
	versions: path.join(rootDir, "versions.json"),
	readmeFiles: [path.join(rootDir, "README.md"), path.join(rootDir, "README.zh.md")],
};

const RELEASE_AUTHOR = {
	name: "Geno",
	email: "6045730+GenoZhou@users.noreply.github.com",
};

const explicitVersion = readArg("--version");
const explicitBase = readArg("--base");
const preid = readArg("--preid") || "beta";
const shouldPublish = hasFlag("--publish");
const remoteName = readArg("--remote") || "origin";

if (hasFlag("--help")) {
	usage();
	process.exit(0);
}

if (explicitBase && !["major", "minor", "patch"].includes(explicitBase)) {
	fail(`Invalid --base "${explicitBase}". Expected major, minor, or patch.`);
}

main();

function main() {
	ensureCleanTree();
	ensureMainBranch();

	const packageJson = readJson(VERSION_FILES.packageJson);
	const manifest = readJson(VERSION_FILES.manifest);
	if (manifest.version !== packageJson.version) {
		fail(`Version mismatch: manifest.json (${manifest.version}) vs package.json (${packageJson.version})`);
	}

	const nextVersion = explicitVersion || getNextPrereleaseVersion(packageJson.version, preid, explicitBase);
	validatePrereleaseVersion(nextVersion);
	ensureVersionAvailable(nextVersion);

	updateVersions(nextVersion);
	run("npm", ["run", "release:check"]);

	console.log(`\nPrepared prerelease ${nextVersion}.`);
	if (shouldPublish) publish(nextVersion);
}

function usage() {
	console.log(`Usage: node scripts/prerelease.mjs [options]

Options:
  --version <version>   Use an explicit prerelease version, e.g. 1.2.3-beta.2
  --base <type>         Base bump when starting a new prerelease: major, minor, patch
  --preid <id>          Prerelease identifier, default: beta
  --publish             Commit, tag, push, and verify
  --remote <name>       Git remote to inspect and push, default: origin
  --help                Show this help
`);
}

function publish(version) {
	ensureReleaseAuthor();
	const branch = commandOutputStrict("git", ["branch", "--show-current"]);
	run("git", ["add", ...existingVersionFiles()]);
	const staged = commandOutput("git", ["diff", "--cached", "--name-only"]);
	if (staged) run("git", ["commit", "-m", `Release ${version}`]);
	ensureVersionAvailable(version);

	console.log(`\nPublishing prerelease ${version}`);
	console.log(`Remote: ${remoteName}`);
	console.log(`Branch: ${branch}`);
	run("git", ["tag", version]);
	run("git", ["push", remoteName, branch, version]);
	run("npm", ["run", "verify:release", "--", version, "--remote", remoteName]);
}

function ensureCleanTree() {
	const status = commandOutputStrict("git", ["status", "--short"]);
	if (status) fail(`Working tree is not clean:\n${status}`);
}

function ensureMainBranch() {
	const branch = commandOutputStrict("git", ["branch", "--show-current"]);
	if (branch !== "main") fail(`Expected to release from main, currently on ${branch}.`);
}

function ensureReleaseAuthor() {
	run("git", ["config", "--local", "user.name", RELEASE_AUTHOR.name]);
	run("git", ["config", "--local", "user.email", RELEASE_AUTHOR.email]);
	const actualName = commandOutputStrict("git", ["config", "--local", "user.name"]);
	const actualEmail = commandOutputStrict("git", ["config", "--local", "user.email"]);
	if (actualName !== RELEASE_AUTHOR.name || actualEmail !== RELEASE_AUTHOR.email) {
		fail(`Release author mismatch: ${actualName} <${actualEmail}>`);
	}
}

function getNextPrereleaseVersion(version, id, baseType) {
	const parsed = parseVersion(version);
	const base = !baseType && parsed.prerelease ? parsed : bumpBase(parsed, baseType || "patch");
	const pattern = `${base.major}.${base.minor}.${base.patch}-${id}.*`;
	const localMax = getMaxPrereleaseTagNumber(commandOutput("git", ["tag", "--list", pattern]), base, id);
	const remoteMax = getMaxPrereleaseTagNumber(remoteTagOutput(pattern), base, id);
	return `${base.major}.${base.minor}.${base.patch}-${id}.${Math.max(localMax, remoteMax) + 1}`;
}

function getMaxPrereleaseTagNumber(tagOutput, base, id) {
	if (!tagOutput) return 0;
	const tagPattern = new RegExp(`(?:refs/tags/)?${base.major}\\.${base.minor}\\.${base.patch}-${escapeRegExp(id)}\\.(\\d+)$`);
	return tagOutput
		.split(/\r?\n/)
		.map((line) => line.trim().match(tagPattern)?.[1])
		.filter(Boolean)
		.map(Number)
		.reduce((max, value) => Math.max(max, value), 0);
}

function updateVersions(version) {
	const packageJson = readJson(VERSION_FILES.packageJson);
	packageJson.version = version;
	writeJson(VERSION_FILES.packageJson, packageJson);

	if (fs.existsSync(VERSION_FILES.packageLock)) {
		const packageLock = readJson(VERSION_FILES.packageLock);
		packageLock.version = version;
		if (packageLock.packages?.[""]) packageLock.packages[""].version = version;
		writeJson(VERSION_FILES.packageLock, packageLock);
	}

	const manifest = readJson(VERSION_FILES.manifest);
	manifest.version = version;
	writeJson(VERSION_FILES.manifest, manifest);

	const versions = fs.existsSync(VERSION_FILES.versions) ? readJson(VERSION_FILES.versions) : {};
	if (!versions[version]) {
		versions[version] = manifest.minAppVersion;
		writeJson(VERSION_FILES.versions, versions);
	}

	for (const readmeFile of VERSION_FILES.readmeFiles) {
		updateReadmeBadge(readmeFile, version);
	}
}

function updateReadmeBadge(filePath, version) {
	if (!fs.existsSync(filePath)) return;
	const badgeVersion = version.replace(/-/g, "--");
	const content = fs.readFileSync(filePath, "utf-8");
	const next = content.replace(
		/!\[Version\]\(https:\/\/img\.shields\.io\/badge\/version-[^)]+-blue\)/,
		`![Version](https://img.shields.io/badge/version-${badgeVersion}-blue)`,
	);
	fs.writeFileSync(filePath, next);
}

function existingVersionFiles() {
	return [
		VERSION_FILES.packageJson,
		VERSION_FILES.packageLock,
		VERSION_FILES.manifest,
		VERSION_FILES.versions,
		...VERSION_FILES.readmeFiles,
	].filter((filePath) => fs.existsSync(filePath));
}

function parseVersion(version) {
	const match = version.match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/);
	if (!match) fail(`Invalid version "${version}". Expected semver such as 1.2.3 or 1.2.3-beta.1.`);
	return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]), prerelease: match[4] || null };
}

function bumpBase(version, type) {
	if (type === "major") return { major: version.major + 1, minor: 0, patch: 0 };
	if (type === "minor") return { major: version.major, minor: version.minor + 1, patch: 0 };
	return { major: version.major, minor: version.minor, patch: version.patch + 1 };
}

function validatePrereleaseVersion(version) {
	if (!parseVersion(version).prerelease) fail(`"${version}" is not a prerelease version.`);
}

function ensureVersionAvailable(version) {
	if (commandOutput("git", ["tag", "--list", version])) fail(`Local tag ${version} already exists.`);
	if (remoteTagOutput(version)) fail(`Remote tag ${version} already exists on ${remoteName}.`);
}

function readArg(name) {
	const index = args.indexOf(name);
	return index === -1 ? null : args[index + 1] ?? null;
}

function hasFlag(name) {
	return args.includes(name);
}

function readJson(filePath) {
	return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function writeJson(filePath, data) {
	fs.writeFileSync(filePath, JSON.stringify(data, null, "\t") + "\n");
}

function remoteTagOutput(pattern) {
	return commandOutputStrict("git", ["ls-remote", "--tags", remoteName, `refs/tags/${pattern}`]);
}

function commandOutput(command, commandArgs) {
	const result = spawnSync(command, commandArgs, { cwd: rootDir, encoding: "utf-8" });
	return result.status === 0 ? result.stdout.trim() : "";
}

function commandOutputStrict(command, commandArgs) {
	const result = spawnSync(command, commandArgs, { cwd: rootDir, encoding: "utf-8" });
	if (result.status !== 0) {
		const details = result.stderr?.trim() || result.stdout?.trim() || `${command} exited with status ${result.status}`;
		fail(`Command failed: ${[command, ...commandArgs].join(" ")}\n${details}`);
	}
	return result.stdout.trim();
}

function run(command, commandArgs) {
	console.log(`\n$ ${[command, ...commandArgs].join(" ")}`);
	const result = spawnSync(command, commandArgs, { cwd: rootDir, stdio: "inherit" });
	if (result.status !== 0) process.exit(result.status ?? 1);
}

function escapeRegExp(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function fail(message) {
	console.error(`Error: ${message}`);
	process.exit(1);
}

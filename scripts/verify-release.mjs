#!/usr/bin/env node

import { spawnSync } from "child_process";

const args = process.argv.slice(2);
const remoteName = readArg("--remote") || "origin";

if (hasFlag("--help")) {
	usage();
	process.exit(0);
}

const version = args.find((arg) => !arg.startsWith("--")) || packageVersion();
if (!version) fail("Usage: node scripts/verify-release.mjs <version> [--remote origin]");

const branch = commandOutputStrict("git", ["branch", "--show-current"]);
const localTagSha = commandOutputStrict("git", ["rev-list", "-n", "1", version]);
const remoteTagSha = getRemoteTagSha(version);

if (!remoteTagSha) fail(`Remote tag ${version} does not exist on ${remoteName}.`);
if (localTagSha !== remoteTagSha) {
	fail(`Tag SHA mismatch: local ${localTagSha}, remote ${remoteTagSha}.`);
}
console.log(`Tag ${version} verified at ${localTagSha}.`);

run("git", ["fetch", remoteName, branch, "--quiet"]);
const localHead = commandOutputStrict("git", ["rev-parse", "HEAD"]);
const remoteHead = commandOutputStrict("git", ["rev-parse", `${remoteName}/${branch}`]);
if (localHead !== remoteHead) {
	fail(`Branch ${branch} mismatch: local ${localHead}, ${remoteName}/${branch} ${remoteHead}.`);
}
console.log(`Branch ${branch} is pushed to ${remoteName}.`);

verifyGitHubReleaseOrWorkflow(version, localTagSha);

function verifyGitHubReleaseOrWorkflow(tag, tagSha) {
	const repo = getOriginRepo();
	if (!repo) fail("Could not detect origin GitHub repo.");
	if (!commandSucceeds("gh", ["--version"])) fail("GitHub CLI (gh) is not available.");

	if (commandSucceeds("gh", ["release", "view", tag, "--repo", repo])) {
		console.log(`GitHub Release ${tag} exists on ${repo}.`);
		return;
	}

	const runsJson = commandOutputStrict("gh", [
		"run",
		"list",
		"--repo",
		repo,
		"--workflow",
		"release.yml",
		"--limit",
		"10",
		"--json",
		"status,conclusion,headSha,url,displayTitle",
	]);
	const runs = JSON.parse(runsJson);
	const run = runs.find((item) => item.headSha === tagSha);
	if (!run) fail(`GitHub Release ${tag} does not exist and no release workflow run was found for ${tagSha}.`);
	if (run.status === "completed" && run.conclusion && run.conclusion !== "success" && run.conclusion !== "skipped") {
		fail(`Release workflow finished with ${run.conclusion}: ${run.url}`);
	}
	console.log(`Release workflow status for ${tag}: ${run.status}${run.conclusion ? `/${run.conclusion}` : ""}`);
	console.log(run.url);
}

function getRemoteTagSha(tag) {
	const output = commandOutputStrict("git", ["ls-remote", "--tags", remoteName, `refs/tags/${tag}`]);
	return output.split(/\s+/)[0] || "";
}

function usage() {
	console.log(`Usage: node scripts/verify-release.mjs <version> [options]

Options:
  --remote <name>       Git remote to inspect, default: origin
  --help                Show this help
`);
}

function getOriginRepo() {
	const remotes = commandOutputStrict("git", ["remote", "-v"]);
	const sshMatch = remotes.match(/origin\s+git@github\.com:([^/]+\/[^.]+)\.git/);
	if (sshMatch) return sshMatch[1];
	const httpsMatch = remotes.match(/origin\s+https:\/\/github\.com\/([^/]+\/[^/\s]+)/);
	if (httpsMatch) return httpsMatch[1].replace(/\.git$/, "");
	return "";
}

function packageVersion() {
	try {
		return JSON.parse(commandOutputStrict("node", ["-p", "JSON.stringify(require('./package.json'))"])).version;
	} catch {
		return "";
	}
}

function readArg(name) {
	const index = args.indexOf(name);
	return index === -1 ? null : args[index + 1] ?? null;
}

function hasFlag(name) {
	return args.includes(name);
}

function commandOutputStrict(command, commandArgs) {
	const result = spawnSync(command, commandArgs, { encoding: "utf-8" });
	if (result.status !== 0) {
		const details = result.stderr?.trim() || result.stdout?.trim() || `${command} exited with status ${result.status}`;
		fail(`Command failed: ${[command, ...commandArgs].join(" ")}\n${details}`);
	}
	return result.stdout.trim();
}

function commandSucceeds(command, commandArgs) {
	const result = spawnSync(command, commandArgs, { stdio: "ignore" });
	return result.status === 0;
}

function run(command, commandArgs) {
	console.log(`\n$ ${[command, ...commandArgs].join(" ")}`);
	const result = spawnSync(command, commandArgs, { stdio: "inherit" });
	if (result.status !== 0) process.exit(result.status ?? 1);
}

function fail(message) {
	console.error(`Error: ${message}`);
	process.exit(1);
}

#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const REQUIRED_FILES = ["main.js", "manifest.json", "styles.css"];
const MAX_MAIN_JS_BYTES = 500 * 1024;

let hasError = false;

checkRequiredFiles();
checkMainJs();
checkManifest();
checkStyles();

if (hasError) {
	console.error("Distribution checks failed.");
	process.exit(1);
}

console.log("Distribution checks passed.");

function checkRequiredFiles() {
	const missingFiles = REQUIRED_FILES.filter((file) => !fs.existsSync(path.join(rootDir, file)));
	if (missingFiles.length) fail(`Missing files: ${missingFiles.join(", ")}`);
}

function checkMainJs() {
	const filePath = path.join(rootDir, "main.js");
	if (!fs.existsSync(filePath)) return;
	const content = fs.readFileSync(filePath, "utf-8");
	if (content.includes("//# sourceMappingURL=") || content.includes("/*# sourceMappingURL=")) {
		fail("main.js contains a sourcemap reference");
	}
	const size = fs.statSync(filePath).size;
	if (size > MAX_MAIN_JS_BYTES) {
		fail(`main.js is too large: ${(size / 1024).toFixed(1)}KB`);
	}
}

function checkManifest() {
	const filePath = path.join(rootDir, "manifest.json");
	if (!fs.existsSync(filePath)) return;
	const manifest = JSON.parse(fs.readFileSync(filePath, "utf-8"));
	const missingFields = ["id", "name", "version", "minAppVersion"].filter((field) => !(field in manifest));
	if (missingFields.length) fail(`manifest.json missing fields: ${missingFields.join(", ")}`);

	const packagePath = path.join(rootDir, "package.json");
	if (fs.existsSync(packagePath)) {
		const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf-8"));
		if (packageJson.version !== manifest.version) {
			fail(`Version mismatch: package.json (${packageJson.version}) vs manifest.json (${manifest.version})`);
		}
	}
}

function checkStyles() {
	const filePath = path.join(rootDir, "styles.css");
	if (fs.existsSync(filePath) && fs.statSync(filePath).size === 0) {
		fail("styles.css is empty");
	}
}

function fail(message) {
	console.error(`Error: ${message}`);
	hasError = true;
}

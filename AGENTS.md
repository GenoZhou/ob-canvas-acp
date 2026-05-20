# Canvas ACP agent guide

## Project facts

- Repository: `canvas-acp`.
- Product name: `Canvas ACP`.
- Obsidian plugin id: `canvas-acp`. The plugin has not been published yet, so repo/package/plugin identifiers should stay aligned.
- Target: Obsidian desktop plugin, TypeScript bundled to top-level `main.js`.
- Core workflow: ask an ACP-compatible agent about a selected canvas note/text/group node, then stream the generated answer back into the canvas as a new text node.
- Source lives in `src/`; tests live in `src/__tests__/`; release helper scripts live in `scripts/`.
- Generated release artifacts are `main.js`, `manifest.json`, and `styles.css`. `main.js` is generated and must not be committed.

## Commands

- Install: `npm install`.
- Development watch: `npm run dev`.
- Cheap local verification: `npm run verify`.
- Full release gate: `npm run release:check`.
- Tests only: `npm test`.
- Lint only: `npm run lint`.
- Production build: `npm run build`.
- Validate release artifacts: `npm run check-dist`.

Use `rg`/`rg --files` for repo exploration. Read focused snippets instead of dumping whole files, and prefer `git diff --stat` plus targeted diffs before full diffs.

## Agent workflow

- Keep Codex output concise: brief status updates, compact command results, and no long pasted logs unless the failure needs them.
- Actively use `kimi-delegate-verify` (`/Users/geno/.agents/skills/kimi-delegate-verify/SKILL.md`) to offload implementation, release debugging, CI repair, or other multi-step development work when policy and user approval allow it. Codex remains responsible for independent verification after Kimi finishes.
- When using Kimi, provide a decision-complete prompt with scope, stop conditions, checks, and a required final report. Do not edit the same workspace while Kimi is mutating it.
- If Kimi cannot be used because of policy, auth, sandbox, or network limits, say so briefly and continue locally only when that is the safest path.
- Do not silently broaden scope. For docs-only tasks, edit docs only. For code tasks, keep changes close to the requested behavior.
- Do not revert user changes or unrelated dirty files.
- Before closing out, verify `git status --short --branch` and summarize only confirmed results.

## Code structure

- Keep `src/main.ts` focused on plugin lifecycle, command registration, settings setup, and unload behavior.
- Put ACP protocol work in `src/acpClient.ts`.
- Put canvas parsing/writing behavior in `src/canvas.ts` and `src/workflow.ts`.
- Put settings types, defaults, and settings UI in `src/settings.ts`.
- Put optional diagnostics in `src/debug.ts`.
- Add or update focused Vitest coverage in `src/__tests__/` when behavior changes.

Prefer small modules with clear responsibility. Avoid large dependencies and Node/Electron-only APIs unless the desktop-only constraint explicitly justifies them.

## Obsidian constraints

- Register commands with stable ids.
- Persist settings with `loadData()` / `saveData()`.
- Use Obsidian `register*` helpers for listeners, DOM events, and intervals so unload is clean.
- Keep startup light; defer expensive work until a command is invoked.
- Batch vault/canvas access and avoid broad scans unless the feature requires it.
- User-facing copy should be short, sentence case, and consistent with README terminology.

## Privacy and security

- Default to local/offline behavior.
- The plugin may send selected canvas context and the user's question to the configured ACP agent process. Do not add hidden telemetry or unrelated network calls.
- Any new external service or data transfer must be user-visible, opt-in when appropriate, and documented in README/settings copy.
- Do not execute remote code, fetch-and-eval scripts, or update plugin code outside normal releases.
- Read/write only what is necessary inside the vault.

## Release workflow

This repo follows the shared `release-flow` pattern.

- Prepare prerelease: `npm run prerelease`.
- Publish prerelease: `npm run release:prerelease`.
- Prepare stable release: `npm run release:prepare`.
- Publish stable release: `npm run release:stable`.
- Post-publish check: `npm run verify:release -- <version>`.

There is intentionally no `npm run release` alias. npm would treat `prerelease` as a lifecycle hook and could run the wrong preparation path before a stable publish.

Release scripts update `package.json`, `package-lock.json`, `manifest.json`, and `versions.json`, run `npm run release:check`, then publish scripts commit the version bump, create a semver tag without a `v` prefix, push `main` plus the tag, and run `verify:release`.

Do not add a `prepublish` npm script. npm also runs that lifecycle during install, which wastes time and can make dependency setup noisy. Keep release verification behind the explicit `release:check` script.

GitHub Actions creates the GitHub Release from the pushed tag and attaches `manifest.json`, `main.js`, and `styles.css`. The release workflow also attests `main.js` and `styles.css` with `actions/attest`. Keep `manifest.json` `author` / `authorUrl` populated; `check-dist` rejects an empty author. Do not also create a local `gh release` unless recovering from a failed workflow.

Before release work, re-check current tags, version files, branch, remote, and workflow status. After a publish command, use the single `verify:release` path instead of rerunning the full gate unless there is a concrete reason.

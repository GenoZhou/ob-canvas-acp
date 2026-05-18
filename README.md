# Canvas ACP

Canvas ACP is an Obsidian desktop plugin for asking an ACP-compatible LLM agent a question about a canvas node.

## Workflow

1. Open a canvas and select a **note node**, **text node**, or **group node**.
2. Run **Ask question about canvas node** from the command palette, ribbon, or a hotkey.
3. A modal opens showing:
   - An input field for your question.
   - An editable **提示词预览** (prompt preview) so you can review and tweak the prompt before sending.
   - Stats line showing upstream context size and total characters.
   - An **Include thinking** checkbox to keep or strip `<think>` blocks from the response.
4. Submit and the modal closes. A new text node is created on the canvas.
5. The plugin streams the agent response into the new text node. The question appears as the edge label.

### Group nodes

Selecting a **group node** treats all contained note/text nodes as combined context. A single edge connects the group to the generated response.

### Upstream context

If the selected node has incoming edges, the content of those upstream nodes is automatically included as additional context in the prompt.

## Settings

Configure in **Settings → Canvas ACP**:

- **Agent command**: executable path, such as `node` or an absolute path to an ACP agent.
- **Agent arguments**: arguments passed to the command, such as the path to an ACP adapter.
- **Generated node size**: width and height for new canvas text nodes.
- **System prompt**: replaces the default base prompt when non-empty. Blank or whitespace-only values fall back to the default behavior.
- **Debug logging**: prints selection, canvas write, and ACP protocol diagnostics to the developer console.

## Commands

- **Ask question about canvas node**: opens the question modal for the selected canvas node.

Assign a shortcut in **Settings → Hotkeys**.

## Privacy

The plugin sends only the selected node content, upstream context, and your question to the ACP agent process you configure. It does not make hidden network requests or collect telemetry. Any network access depends on the configured agent.

## Development

- Install dependencies with `npm install`.
- Run `npm run dev` to compile in watch mode.
- Run `npm run build` before publishing.
- Run `npm test` to execute the test suite.
- Copy `main.js`, `styles.css`, and `manifest.json` into `VaultFolder/.obsidian/plugins/canvas-acp/` for manual testing.

## Acknowledgments

- This plugin was bootstrapped from the [Obsidian Sample Plugin](https://github.com/obsidianmd/obsidian-sample-plugin) template. Its build tooling and plugin skeleton provided the starting point.
- The idea of bringing an [Agent Client Protocol (ACP)](https://github.com/agentclientprotocol/agent-client-protocol) agent into Obsidian was inspired by [obsidian-agent-client](https://github.com/RAIT-09/obsidian-agent-client) by RAIT-09. While the codebases are independent (this project implements ACP communication with a lightweight custom client rather than the official SDK), the conceptual proof that ACP agents can work inside Obsidian was valuable.

## Release

- Run `npm run verify` for a local test/lint pass during development.
- Run `npm run prepublish` before manual release checks; it builds, tests, lints, and validates release artifacts.
- Prepare the next prerelease with `npm run prerelease`. Publish it with `npm run release:prerelease`.
- Prepare the next stable release with `npm run release:prepare`. Publish it with `npm run release:stable`.
- There is intentionally no `npm run release` alias, because npm would run the `prerelease` lifecycle hook before it.
- Release scripts update `package.json`, `package-lock.json`, `manifest.json`, and `versions.json`.
- Publish scripts commit the version bump, create a semver tag without a `v` prefix, push `main` plus the tag, and run `npm run verify:release -- <version>`.
- GitHub Actions creates the GitHub Release from the pushed tag and attaches `manifest.json`, `main.js`, and `styles.css`.

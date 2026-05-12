# Canvas ACP

Canvas ACP is an Obsidian desktop plugin for asking an ACP-compatible LLM agent a question about a note or text node on a canvas.

The workflow is:

1. Open a canvas and select one note node or text node.
2. Run **Ask question about canvas node** from the command palette, ribbon, or a hotkey you assign in Obsidian.
3. Enter a question in the modal.
4. The modal closes and a new response text node is added to the canvas.
5. The plugin sends the selected node content and question to the configured ACP agent.
6. The agent response streams into the new text node. The question is written on the edge label.

This is designed for canvas-based research flows where notes and text blocks become context nodes and questions become labeled transitions between generated responses.

## ACP setup

Canvas ACP launches an ACP-compatible command over stdio. Configure it in **Settings → Canvas ACP**:

- **Agent command**: executable path, such as `node`, `gemini`, or an absolute path to another ACP agent command.
- **Agent arguments**: arguments passed to that command, such as the path to an ACP adapter.
- **Output folder**: reserved for generated Markdown note workflows.
- **Note name template**: reserved for generated Markdown note workflows. Supports `{{source}}` and `{{question}}`.
- **Debug logging**: prints selection, Canvas write, and ACP protocol diagnostics to the developer console.

For example, if your ACP adapter is a JavaScript executable, set **Agent command** to your Node.js path and **Agent arguments** to the adapter path.

## Commands

- **Ask question about canvas node**: Opens the question modal for the selected canvas note or text node.

You can assign a shortcut in **Settings → Hotkeys**.

## Privacy

The plugin sends only the selected note content and your question to the ACP agent process you configure. It does not make hidden network requests or collect telemetry. Any network access depends on the configured agent.

## Development

- Install dependencies with `npm install`.
- Run `npm run dev` to compile in watch mode.
- Run `npm run build` before publishing.
- Copy `main.js`, `styles.css`, and `manifest.json` into `VaultFolder/.obsidian/plugins/ob-canvas-acp/` for manual testing.

## Release

- Update `manifest.json` and `versions.json` with the new version.
- Run `npm version patch`, `npm version minor`, or `npm version major` to keep version files in sync.
- Build with `npm run build`.
- Attach `manifest.json`, `main.js`, and `styles.css` to the GitHub release.

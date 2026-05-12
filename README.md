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
- Copy `main.js`, `styles.css`, and `manifest.json` into `VaultFolder/.obsidian/plugins/ob-canvas-acp/` for manual testing.

## Release

- Update `manifest.json` and `versions.json` with the new version.
- Run `npm version patch`, `npm version minor`, or `npm version prerelease --preid=beta` to keep version files in sync.
- Build with `npm run build`.
- Attach `manifest.json`, `main.js`, and `styles.css` to the GitHub release.

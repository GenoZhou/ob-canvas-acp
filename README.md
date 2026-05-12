# Canvas ACP

Canvas ACP is an Obsidian plugin based on the official sample plugin scaffold.

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

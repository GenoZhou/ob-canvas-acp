import {defineConfig} from "vitest/config";

export default defineConfig({
	test: {
		globals: true,
		environment: "node",
		alias: {
			obsidian: "__mocks__/obsidian.ts",
		},
	},
});

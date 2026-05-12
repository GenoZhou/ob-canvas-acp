import {describe, expect, it} from "vitest";
import {splitArgs, buildPromptBlocks, buildTextOnlyPrompt} from "../acpClient";

describe("splitArgs", () => {
	it("splits plain arguments", () => {
		expect(splitArgs("node script.js")).toEqual(["node", "script.js"]);
	});

	it("handles empty string", () => {
		expect(splitArgs("")).toEqual([]);
	});

	it("handles double-quoted arguments", () => {
		expect(splitArgs('node "my script.js"')).toEqual(["node", "my script.js"]);
	});

	it("handles single-quoted arguments", () => {
		expect(splitArgs("node 'my script.js'")).toEqual(["node", "my script.js"]);
	});

	it("treats unclosed quotes as plain tokens", () => {
		expect(splitArgs('node "script')).toEqual(["node", "script"]);
	});
});

describe("buildPromptBlocks", () => {
	it("builds text-only block when no resources", () => {
		const blocks = buildPromptBlocks("Hello", []);
		expect(blocks).toEqual([{text: "Hello", type: "text"}]);
	});

	it("includes resources after text block", () => {
		const blocks = buildPromptBlocks("Hello", [
			{uri: "file:///a.md", text: "A", mimeType: "text/markdown"},
		]);
		expect(blocks).toHaveLength(2);
		expect(blocks[0]).toEqual({text: "Hello", type: "text"});
		expect(blocks[1]).toEqual({
			type: "resource",
			resource: {uri: "file:///a.md", text: "A", mimeType: "text/markdown"},
		});
	});
});

describe("buildTextOnlyPrompt", () => {
	it("returns prompt unchanged when no resources", () => {
		expect(buildTextOnlyPrompt("Hello", [])).toBe("Hello");
	});

	it("embeds resources as XML", () => {
		const prompt = buildTextOnlyPrompt("Q", [
			{uri: "file:///a.md", text: "content", mimeType: "text/markdown"},
		]);
		expect(prompt).toContain("Q");
		expect(prompt).toContain("Context:");
		expect(prompt).toContain('<resource uri="file:///a.md" mimeType="text/markdown">');
		expect(prompt).toContain("content");
		expect(prompt).toContain("</resource>");
	});
});

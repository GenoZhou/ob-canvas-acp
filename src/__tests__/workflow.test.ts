import {describe, expect, it} from "vitest";
import {buildPrompt, DEFAULT_SYSTEM_PROMPT, getSourceUri, summarizeSelection} from "../workflow";
import type {SelectedCanvasSource} from "../canvas";

function mockSelection(overrides: Partial<SelectedCanvasSource> = {}): SelectedCanvasSource {
	return {
		canvasPath: "test.canvas",
		sourceNodeId: "node-1",
		sourceText: "source text",
		upstreamContext: undefined,
		upstreamNodeCount: 0,
		sourceFile: undefined,
		sourceTitle: undefined,
		sourceUri: undefined,
		view: undefined,
		...overrides,
	};
}

describe("buildPrompt", () => {
	it("includes the question and source", () => {
		const prompt = buildPrompt(mockSelection(), "What is this?", false);
		expect(prompt).toContain("What is this?");
		expect(prompt).toContain("Canvas node");
	});

	it("includes upstream context when present", () => {
		const prompt = buildPrompt(
			mockSelection({upstreamContext: "Upstream info", upstreamNodeCount: 1}),
			"Explain?",
			false,
		);
		expect(prompt).toContain("Upstream info");
		expect(prompt).toContain("upstream nodes");
	});

	it("includes thinking instruction when enabled", () => {
		const prompt = buildPrompt(mockSelection(), "Why?", true);
		expect(prompt).toContain("reasoning process");
	});

	it("prefers sourceFile path in attribution", () => {
		const selection = mockSelection({
			sourceFile: {path: "notes/hello.md", basename: "hello"} as unknown as File,
		});
		const prompt = buildPrompt(selection, "Q", false);
		expect(prompt).toContain("notes/hello.md");
	});

	it("uses default system prompt when no custom prompt is provided", () => {
		const prompt = buildPrompt(mockSelection(), "What is this?", false);
		expect(prompt.startsWith(DEFAULT_SYSTEM_PROMPT)).toBe(true);
	});

	it("uses custom system prompt when provided", () => {
		const custom = "You are a custom assistant.";
		const prompt = buildPrompt(mockSelection(), "What is this?", false, custom);
		expect(prompt.startsWith(custom)).toBe(true);
		expect(prompt).not.toContain("You are helping expand an Obsidian canvas graph.");
	});

	it("falls back to default system prompt for whitespace-only custom prompt", () => {
		const prompt = buildPrompt(mockSelection(), "What is this?", false, "   \n\t  ");
		expect(prompt.startsWith(DEFAULT_SYSTEM_PROMPT)).toBe(true);
	});

	it("preserves upstream context, thinking, and constraints with custom system prompt", () => {
		const custom = "Custom assistant.";
		const prompt = buildPrompt(
			mockSelection({upstreamContext: "Upstream info", upstreamNodeCount: 1}),
			"Explain?",
			true,
			custom,
		);
		expect(prompt.startsWith(custom)).toBe(true);
		expect(prompt).toContain("Upstream info");
		expect(prompt).toContain("reasoning process");
		expect(prompt).toContain("Create a concise but useful Markdown note body.");
		expect(prompt).toContain("Source:");
		expect(prompt).toContain("Question: Explain?");
	});
});

describe("getSourceUri", () => {
	it("returns file URI when sourceFile exists", () => {
		const selection = mockSelection({
			sourceFile: {path: "notes/hello.md"} as unknown as File,
		});
		expect(getSourceUri(selection, "/vault")).toContain("file:///vault/notes/hello.md");
	});

	it("falls back to canvas URI", () => {
		const selection = mockSelection({sourceUri: "canvas://node-1"});
		expect(getSourceUri(selection, "/vault")).toBe("canvas://node-1");
	});

	it("uses unknown fallback when nothing available", () => {
		expect(getSourceUri(mockSelection(), "/vault")).toBe("canvas://unknown");
	});
});

describe("summarizeSelection", () => {
	it("summarizes basic selection", () => {
		const summary = summarizeSelection(mockSelection());
		expect(summary.canvasPath).toBe("test.canvas");
		expect(summary.sourceTextLength).toBe(11);
		expect(summary.upstreamNodeCount).toBe(0);
	});
});

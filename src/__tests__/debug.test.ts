import {describe, expect, it} from "vitest";
import {summarizeText} from "../debug";

describe("summarizeText", () => {
	it("returns length and preview for short text", () => {
		const result = summarizeText("hello");
		expect(result.length).toBe(5);
		expect(result.preview).toBe("hello");
	});

	it("truncates preview to 160 chars", () => {
		const long = "a".repeat(200);
		const result = summarizeText(long);
		expect(result.length).toBe(200);
		expect(result.preview).toBe("a".repeat(160));
	});
});

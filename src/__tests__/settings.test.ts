import {describe, expect, it} from "vitest";
import {parseNodeSize} from "../settings";

describe("parseNodeSize", () => {
	it("parses a valid number", () => {
		expect(parseNodeSize("420", 160, 420)).toBe(420);
	});

	it("enforces minimum", () => {
		expect(parseNodeSize("100", 160, 420)).toBe(160);
	});

	it("falls back on NaN", () => {
		expect(parseNodeSize("abc", 160, 420)).toBe(420);
	});

	it("falls back on empty string", () => {
		expect(parseNodeSize("", 160, 420)).toBe(420);
	});
});

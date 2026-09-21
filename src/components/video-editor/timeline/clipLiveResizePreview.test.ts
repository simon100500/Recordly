import { describe, expect, it } from "vitest";
import { resolveClipLiveResizePreview } from "./clipLiveResizePreview";

describe("resolveClipLiveResizePreview", () => {
	it("anchors the right edge when previewing a left-edge trim", () => {
		const preview = resolveClipLiveResizePreview(
			[
				{ id: "left", startMs: 0, endMs: 4_000, speed: 1, sourceStartMs: 0 },
				{ id: "clip", startMs: 4_000, endMs: 7_000, speed: 1, sourceStartMs: 4_000 },
				{ id: "right", startMs: 7_000, endMs: 9_000, speed: 1, sourceStartMs: 7_000 },
			],
			"clip",
			{ start: 4_500, end: 7_000 },
		);

		expect(preview).toEqual({
			span: { start: 4_000, end: 6_500 },
			sourceSpan: { start: 4_500, end: 7_000 },
			rippleDeltaMs: -500,
			rippleStartMs: 7_000,
		});
	});

	it("shows left-edge expansion as source reveal plus right ripple growth", () => {
		const preview = resolveClipLiveResizePreview(
			[
				{ id: "left", startMs: 0, endMs: 4_000, speed: 1, sourceStartMs: 0 },
				{ id: "clip", startMs: 4_000, endMs: 7_000, speed: 1, sourceStartMs: 4_000 },
				{ id: "right", startMs: 7_000, endMs: 9_000, speed: 1, sourceStartMs: 7_000 },
			],
			"clip",
			{ start: 3_000, end: 7_000 },
		);

		expect(preview).toEqual({
			span: { start: 4_000, end: 8_000 },
			sourceSpan: { start: 3_000, end: 7_000 },
			rippleDeltaMs: 1_000,
			rippleStartMs: 7_000,
		});
	});
});

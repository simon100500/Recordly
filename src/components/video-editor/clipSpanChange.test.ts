import type { Span } from "dnd-timeline";
import { describe, expect, it } from "vitest";
import { resolveClipSpanChange, resolveRippleClipDelete } from "./clipSpanChange";
import { type ClipRegion, getClipSourceEndMs } from "./types";

function resolve(clipRegions: ClipRegion[], id: string, span: Span) {
	return resolveClipSpanChange({ clipRegions, id, span, snapThresholdMs: 50 });
}

describe("resolveClipSpanChange", () => {
	it("snaps a resized left edge to the previous clip and reveals the matching source section", () => {
		const result = resolve(
			[
				{ id: "left", startMs: 0, endMs: 5_000, speed: 1, sourceStartMs: 0 },
				{ id: "clip", startMs: 5_200, endMs: 9_000, speed: 1, sourceStartMs: 5_200 },
			],
			"clip",
			{ start: 5_030, end: 9_000 },
		);

		expect(result?.clip).toMatchObject({
			startMs: 5_000,
			endMs: 9_000,
			sourceStartMs: 5_000,
		});
	});

	it("keeps waveform source scale stable when stretching the right edge", () => {
		const result = resolve(
			[{ id: "clip", startMs: 0, endMs: 4_000, speed: 1, sourceStartMs: 0 }],
			"clip",
			{ start: 0, end: 6_000 },
		);

		expect(result?.clip).toMatchObject({
			startMs: 0,
			endMs: 6_000,
			sourceStartMs: 0,
		});
		expect(getClipSourceEndMs(result?.clip as ClipRegion)).toBe(6_000);
	});

	it("snaps moved clips to the left neighbour without changing their source segment", () => {
		const result = resolve(
			[
				{ id: "left", startMs: 0, endMs: 5_000, speed: 1, sourceStartMs: 0 },
				{ id: "clip", startMs: 6_000, endMs: 8_000, speed: 1, sourceStartMs: 6_000 },
			],
			"clip",
			{ start: 5_030, end: 7_030 },
		);

		expect(result?.clip).toMatchObject({
			startMs: 5_000,
			endMs: 7_000,
			sourceStartMs: 6_000,
		});
		expect(result?.movementDeltaMs).toBe(-1_000);
	});
});

describe("resolveRippleClipDelete", () => {
	it("removes the selected clip and shifts following clips left to close the gap", () => {
		const result = resolveRippleClipDelete(
			[
				{ id: "left", startMs: 0, endMs: 2_000, speed: 1, sourceStartMs: 0 },
				{ id: "middle", startMs: 2_000, endMs: 4_000, speed: 1, sourceStartMs: 2_000 },
				{ id: "right", startMs: 4_000, endMs: 7_000, speed: 1, sourceStartMs: 4_000 },
			],
			"middle",
		);

		expect(result?.deletedSpan).toEqual({ startMs: 2_000, endMs: 4_000 });
		expect(result?.shiftMs).toBe(2_000);
		expect(result?.clipRegions).toEqual([
			{ id: "left", startMs: 0, endMs: 2_000, speed: 1, sourceStartMs: 0 },
			{ id: "right", startMs: 2_000, endMs: 5_000, speed: 1, sourceStartMs: 4_000 },
		]);
	});
});

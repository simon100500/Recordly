import { describe, expect, it } from "vitest";

import { resolveRangeAfterTotalMsChange, resolveTimelineWheelPanDeltaPx } from "./useTimelineRange";

describe("resolveTimelineWheelPanDeltaPx", () => {
	it("uses trackpad horizontal wheel movement for timeline panning", () => {
		expect(
			resolveTimelineWheelPanDeltaPx({
				deltaX: 24,
				deltaY: 0,
				deltaMode: 0,
			}),
		).toBe(24);
	});

	it("uses shifted vertical wheel movement for timeline panning", () => {
		expect(
			resolveTimelineWheelPanDeltaPx({
				deltaX: 0,
				deltaY: 3,
				deltaMode: 1,
				shiftKey: true,
			}),
		).toBe(48);
	});

	it("keeps ctrl wheel available for timeline zoom unless shift is also held", () => {
		expect(
			resolveTimelineWheelPanDeltaPx({
				deltaX: 0,
				deltaY: 3,
				deltaMode: 1,
				ctrlKey: true,
			}),
		).toBe(0);
		expect(
			resolveTimelineWheelPanDeltaPx({
				deltaX: 0,
				deltaY: 3,
				deltaMode: 1,
				ctrlKey: true,
				shiftKey: true,
			}),
		).toBe(48);
	});

	it("uses regular wheel movement when the timeline has no vertical overflow", () => {
		expect(
			resolveTimelineWheelPanDeltaPx({
				deltaX: 0,
				deltaY: 20,
				deltaMode: 0,
				canScrollVertically: false,
			}),
		).toBe(20);
	});
});

describe("resolveRangeAfterTotalMsChange", () => {
	it("preserves the zoomed visible span when the timeline grows after a clip resize", () => {
		expect(
			resolveRangeAfterTotalMsChange({
				previousRange: { start: 2_000, end: 6_000 },
				previousTotalMs: 10_000,
				nextTotalMs: 12_000,
			}),
		).toEqual({ start: 2_000, end: 6_000 });
	});

	it("keeps the visible range anchored to the end when a ripple edit extends the tail", () => {
		expect(
			resolveRangeAfterTotalMsChange({
				previousRange: { start: 6_000, end: 10_000 },
				previousTotalMs: 10_000,
				nextTotalMs: 12_000,
			}),
		).toEqual({ start: 8_000, end: 12_000 });
	});

	it("clamps the existing zoom window when the timeline shrinks", () => {
		expect(
			resolveRangeAfterTotalMsChange({
				previousRange: { start: 7_000, end: 10_000 },
				previousTotalMs: 10_000,
				nextTotalMs: 8_000,
			}),
		).toEqual({ start: 5_000, end: 8_000 });
	});
});

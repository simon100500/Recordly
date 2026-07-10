import { describe, expect, it } from "vitest";
import { stepCropPanFollow } from "./cropPanFollow";

describe("stepCropPanFollow", () => {
	const crop = { x: 0.1, y: 0.1, width: 0.8, height: 0.8 };

	it("keeps the cursor 10% from the bottom edge", () => {
		const cursor = { cx: 0.5, cy: 0.85 };
		const result = stepCropPanFollow({
			cursor,
			crop,
			prevOffset: { x: 0, y: 0 },
			strength: 1,
			smoothFactor: 1,
		});

		expect(result).not.toBeNull();
		expect(result!.offset.x).toBe(0);
		expect(result!.offset.y).toBeCloseTo(0.03, 6);
		expect(result!.effectiveCrop.y).toBeCloseTo(0.13, 6);
		expect((cursor.cy - result!.effectiveCrop.y) / result!.effectiveCrop.height).toBeCloseTo(0.9, 6);
	});

	it("keeps the cursor 10% from the top edge", () => {
		const cursor = { cx: 0.5, cy: 0.15 };
		const result = stepCropPanFollow({
			cursor,
			crop,
			prevOffset: { x: 0, y: 0 },
			strength: 1,
			smoothFactor: 1,
		});

		expect(result).not.toBeNull();
		expect(result!.offset.x).toBe(0);
		expect(result!.offset.y).toBeCloseTo(-0.03, 6);
		expect(result!.effectiveCrop.y).toBeCloseTo(0.07, 6);
		expect((cursor.cy - result!.effectiveCrop.y) / result!.effectiveCrop.height).toBeCloseTo(0.1, 6);
	});
});

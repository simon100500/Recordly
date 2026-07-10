import { describe, expect, it } from "vitest";
import { DEFAULT_CROP_PAN_OFFSET, stepCropPanFollow } from "./cropPanFollow";

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
		expect((cursor.cy - result!.effectiveCrop.y) / result!.effectiveCrop.height).toBeCloseTo(
			0.9,
			6,
		);
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
		expect((cursor.cy - result!.effectiveCrop.y) / result!.effectiveCrop.height).toBeCloseTo(
			0.1,
			6,
		);
	});

	it("translates a full-height canvas to anchor the initial cursor at the bottom edge", () => {
		const cursor = { cx: 0.5, cy: 0.5 };
		const result = stepCropPanFollow({
			cursor,
			crop: { x: 0, y: 0, width: 1, height: 1 },
			prevOffset: DEFAULT_CROP_PAN_OFFSET,
			strength: 1,
			smoothFactor: 1,
		});

		expect(result).not.toBeNull();
		expect(result!.offset.y).toBe(-0.4);
		expect(result!.fade.y).toBe(-0.4);
		expect(result!.effectiveCrop.y).toBe(0);
		expect(result!.cursorViewportOffset.y).toBe(0.4);
		expect(
			(cursor.cy - result!.effectiveCrop.y + result!.cursorViewportOffset.y) /
				result!.effectiveCrop.height,
		).toBeCloseTo(0.9, 6);

		let jitterResult = result!;
		for (const cy of [0.49, 0.51, 0.48, 0.52]) {
			jitterResult = stepCropPanFollow({
				cursor: { cx: 0.5, cy },
				crop: { x: 0, y: 0, width: 1, height: 1 },
				prevOffset: jitterResult.offset,
				strength: 1,
				smoothFactor: 1,
			})!;

			expect(jitterResult.offset.verticalAnchor).toBe("bottom");
			expect(
				(cy - jitterResult.effectiveCrop.y + jitterResult.cursorViewportOffset.y) /
					jitterResult.effectiveCrop.height,
			).toBeCloseTo(0.9, 6);
		}

		const oppositeBoundaryResult = stepCropPanFollow({
			cursor: { cx: 0.5, cy: 0.1 },
			crop: { x: 0, y: 0, width: 1, height: 1 },
			prevOffset: jitterResult.offset,
			strength: 1,
			smoothFactor: 1,
		});

		expect(oppositeBoundaryResult!.offset.verticalAnchor).toBe("top");
	});

	it("translates a full-height canvas to anchor the initial cursor at the top edge", () => {
		const cursor = { cx: 0.5, cy: 0.49 };
		const result = stepCropPanFollow({
			cursor,
			crop: { x: 0, y: 0, width: 1, height: 1 },
			prevOffset: DEFAULT_CROP_PAN_OFFSET,
			strength: 1,
			smoothFactor: 1,
		});

		expect(result).not.toBeNull();
		expect(result!.offset.y).toBe(0.39);
		expect(result!.fade.y).toBe(0.39);
		expect(result!.effectiveCrop.y).toBe(0);
		expect(result!.cursorViewportOffset.y).toBe(-0.39);
		expect(
			(cursor.cy - result!.effectiveCrop.y + result!.cursorViewportOffset.y) /
				result!.effectiveCrop.height,
		).toBeCloseTo(0.1, 6);

		const downwardResult = stepCropPanFollow({
			cursor: { cx: 0.5, cy: 0.9 },
			crop: { x: 0, y: 0, width: 1, height: 1 },
			prevOffset: result!.offset,
			strength: 1,
			smoothFactor: 1,
		});

		expect(downwardResult!.offset.verticalAnchor).toBe("bottom");
	});
});

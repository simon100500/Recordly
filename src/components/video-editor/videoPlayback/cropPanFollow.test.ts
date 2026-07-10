import { describe, expect, it } from "vitest";
import { DEFAULT_CROP_PAN_FOCUS, DEFAULT_CROP_PAN_OFFSET, stepCropPanFollow } from "./cropPanFollow";

describe("stepCropPanFollow", () => {
	const crop = { x: 0.1, y: 0.1, width: 0.8, height: 0.8 };

	it("keeps the cursor 10% from the bottom edge", () => {
		const cursor = { cx: 0.5, cy: 0.85 };
		const result = stepCropPanFollow({
			cursor,
			crop,
			prevOffset: { x: 0, y: 0 },
			prevFocus: DEFAULT_CROP_PAN_FOCUS,
			strength: 1,
			zoomScale: 2,
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
			prevFocus: DEFAULT_CROP_PAN_FOCUS,
			strength: 1,
			zoomScale: 2,
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

	it("keeps a full-frame canvas stationary inside the safe zone", () => {
		const result = stepCropPanFollow({
			cursor: { cx: 0.5, cy: 0.5 },
			crop: { x: 0, y: 0, width: 1, height: 1 },
			prevOffset: DEFAULT_CROP_PAN_OFFSET,
			prevFocus: DEFAULT_CROP_PAN_FOCUS,
			strength: 1,
			zoomScale: 2,
			smoothFactor: 1,
		});

		expect(result!.offset.y).toBe(0);
		expect(result!.fade.y).toBe(0);
		expect(result!.effectiveCrop.y).toBe(0);
		expect(result!.cursorViewportOffset.y).toBe(0);
		expect(result!.focus.cy).toBe(0.5);
	});

	it("keeps focus centered while the cursor roams a horizontal crop's free axis", () => {
		const horizontalCrop = { x: 0.15, y: 0, width: 0.7, height: 1 };

		// zoomScale 1.5 → halfSpan ≈ 0.333, safeMargin ≈ 0.167
		// safe zone from prevFocus 0.5 = [0.333, 0.667]
		for (const cy of [0.4, 0.5, 0.6]) {
			const result = stepCropPanFollow({
				cursor: { cx: 0.5, cy },
				crop: horizontalCrop,
				prevOffset: DEFAULT_CROP_PAN_OFFSET,
				prevFocus: DEFAULT_CROP_PAN_FOCUS,
				strength: 1,
				zoomScale: 1.5,
				smoothFactor: 1,
			});

			expect(result).not.toBeNull();
			expect(result!.fade.y).toBe(0);
			expect(result!.effectiveCrop.y).toBe(0);
			expect(result!.focus.cy).toBe(0.5);
		}
	});

	it("shifts the focus when the cursor exits the safe zone on a free axis", () => {
		const horizontalCrop = { x: 0.15, y: 0, width: 0.7, height: 1 };

		// zoomScale 1.5 → halfSpan ≈ 0.333, safeMargin ≈ 0.167
		// prevFocus 0.5 → safeMax = 0.667, cursor at 0.85 exits
		// focus = 0.85 - 0.167 = 0.683, clamped to 1 - halfSpan = 0.667
		const result = stepCropPanFollow({
			cursor: { cx: 0.5, cy: 0.85 },
			crop: horizontalCrop,
			prevOffset: DEFAULT_CROP_PAN_OFFSET,
			prevFocus: { cx: 0.5, cy: 0.5 },
			strength: 1,
			zoomScale: 1.5,
			smoothFactor: 1,
		});

		expect(result).not.toBeNull();
		expect(result!.fade.y).toBe(0);
		expect(result!.focus.cy).toBeCloseTo(0.667, 2);
		expect(result!.focus.cy).toBeGreaterThan(0.5);
		expect(result!.focus.cy).toBeLessThan(0.85);
	});

	it("clamps the focus so the visible area never exceeds source bounds", () => {
		const horizontalCrop = { x: 0.15, y: 0, width: 0.7, height: 1 };

		// zoomScale 2 → halfSpan = 0.25, max focus = 0.75
		const result = stepCropPanFollow({
			cursor: { cx: 0.5, cy: 0.99 },
			crop: horizontalCrop,
			prevOffset: DEFAULT_CROP_PAN_OFFSET,
			prevFocus: { cx: 0.5, cy: 0.5 },
			strength: 1,
			zoomScale: 2,
			smoothFactor: 1,
		});

		expect(result).not.toBeNull();
		expect(result!.focus.cy).toBeLessThanOrEqual(0.75);
		expect(result!.focus.cy).toBeGreaterThanOrEqual(0.25);
	});

	it("holds the focus steady once the cursor returns inside the safe zone", () => {
		const horizontalCrop = { x: 0.15, y: 0, width: 0.7, height: 1 };

		// Step 1: cursor near bottom → focus shifts
		const step1 = stepCropPanFollow({
			cursor: { cx: 0.5, cy: 0.85 },
			crop: horizontalCrop,
			prevOffset: DEFAULT_CROP_PAN_OFFSET,
			prevFocus: { cx: 0.5, cy: 0.5 },
			strength: 1,
			zoomScale: 1.5,
			smoothFactor: 1,
		})!;

		// Step 2: cursor returns toward centre → focus should hold
		const step2 = stepCropPanFollow({
			cursor: { cx: 0.5, cy: 0.6 },
			crop: horizontalCrop,
			prevOffset: step1.offset,
			prevFocus: step1.focus,
			strength: 1,
			zoomScale: 1.5,
			smoothFactor: 1,
		})!;

		expect(step2.focus.cy).toBe(step1.focus.cy);
	});

	it("extends the focus beyond source bounds when a bottom margin is set", () => {
		const horizontalCrop = { x: 0.15, y: 0, width: 0.7, height: 1 };

		// zoomScale 1.5 → halfSpan ≈ 0.333, visibleSpan ≈ 0.667
		// bottom margin 10% → gap = 0.067, maxFocus = 1 - 0.333 + 0.067 = 0.733
		const noMargin = stepCropPanFollow({
			cursor: { cx: 0.5, cy: 0.95 },
			crop: horizontalCrop,
			prevOffset: DEFAULT_CROP_PAN_OFFSET,
			prevFocus: { cx: 0.5, cy: 0.5 },
			strength: 1,
			zoomScale: 1.5,
			smoothFactor: 1,
		})!;

		const withMargin = stepCropPanFollow({
			cursor: { cx: 0.5, cy: 0.95 },
			crop: horizontalCrop,
			prevOffset: DEFAULT_CROP_PAN_OFFSET,
			prevFocus: { cx: 0.5, cy: 0.5 },
			strength: 1,
			zoomScale: 1.5,
			smoothFactor: 1,
			margins: { top: 0, bottom: 0.1, left: 0, right: 0 },
		})!;

		// Without margin, focus clamped to 1 - halfSpan = 0.667
		expect(noMargin.focus.cy).toBeCloseTo(0.667, 2);
		// With margin, focus extends beyond normal clamp
		expect(withMargin.focus.cy).toBeGreaterThan(noMargin.focus.cy);
		expect(withMargin.focus.cy).toBeCloseTo(0.733, 2);
	});

	it("extends the focus on the left when a left margin is set", () => {
		const verticalCrop = { x: 0, y: 0.15, width: 1, height: 0.7 };

		const withMargin = stepCropPanFollow({
			cursor: { cx: 0.05, cy: 0.5 },
			crop: verticalCrop,
			prevOffset: DEFAULT_CROP_PAN_OFFSET,
			prevFocus: { cx: 0.5, cy: 0.5 },
			strength: 1,
			zoomScale: 1.5,
			smoothFactor: 1,
			margins: { top: 0, bottom: 0, left: 0.1, right: 0 },
		})!;

		// Focus should go below normal min (halfSpan ≈ 0.333)
		expect(withMargin.focus.cx).toBeLessThan(0.333);
		expect(withMargin.focus.cx).toBeCloseTo(0.267, 2);
	});
});

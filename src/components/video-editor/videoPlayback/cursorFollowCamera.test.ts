import { describe, expect, it } from "vitest";
import {
	computeCursorFollowFocus,
	createCursorFollowCameraState,
} from "./cursorFollowCamera";

describe("computeCursorFollowFocus", () => {
	it("holds the camera while the cursor stays inside the safe zone", () => {
		const state = createCursorFollowCameraState();
		const cursorSamples = [
			{ timeMs: 0, cx: 0.5, cy: 0.5, interactionType: "move" as const },
			{ timeMs: 100, cx: 0.6, cy: 0.58, interactionType: "move" as const },
		];

		const initialFocus = computeCursorFollowFocus(
			state,
			cursorSamples,
			0,
			2,
			1,
			{ cx: 0.5, cy: 0.5 },
			{ snapToEdgesRatio: 0.25 },
		);
		const heldFocus = computeCursorFollowFocus(
			state,
			cursorSamples,
			100,
			2,
			1,
			{ cx: 0.5, cy: 0.5 },
			{ snapToEdgesRatio: 0.25 },
		);

		expect(initialFocus).toEqual({ cx: 0.5, cy: 0.5 });
		expect(heldFocus).toEqual(initialFocus);
	});

	it("recenters the cursor after it leaves the safe zone", () => {
		const state = createCursorFollowCameraState();
		const cursorSamples = [
			{ timeMs: 0, cx: 0.5, cy: 0.5, interactionType: "move" as const },
			{ timeMs: 100, cx: 0.7, cy: 0.5, interactionType: "move" as const },
			{ timeMs: 200, cx: 0.72, cy: 0.5, interactionType: "move" as const },
		];

		computeCursorFollowFocus(
			state,
			cursorSamples,
			0,
			2,
			1,
			{ cx: 0.5, cy: 0.5 },
			{ snapToEdgesRatio: 0.25 },
		);

		const firstShift = computeCursorFollowFocus(
			state,
			cursorSamples,
			100,
			2,
			1,
			{ cx: 0.5, cy: 0.5 },
			{ snapToEdgesRatio: 0.25 },
		);
		const secondShift = computeCursorFollowFocus(
			state,
			cursorSamples,
			200,
			2,
			1,
			{ cx: 0.5, cy: 0.5 },
			{ snapToEdgesRatio: 0.25 },
		);

		expect(firstShift.cx).toBeCloseTo(0.7, 6);
		expect(firstShift.cy).toBeCloseTo(0.5, 6);
		expect(secondShift.cx).toBeCloseTo(0.7, 6);
		expect(secondShift.cy).toBeCloseTo(0.5, 6);
	});

	it("clamps the camera when the cursor pushes past the stage edge", () => {
		const state = createCursorFollowCameraState();
		const cursorSamples = [
			{ timeMs: 0, cx: 0.5, cy: 0.5, interactionType: "move" as const },
			{ timeMs: 100, cx: 1, cy: 1, interactionType: "move" as const },
		];

		computeCursorFollowFocus(
			state,
			cursorSamples,
			0,
			2,
			1,
			{ cx: 0.5, cy: 0.5 },
			{ snapToEdgesRatio: 0.25 },
		);

		const clampedFocus = computeCursorFollowFocus(
			state,
			cursorSamples,
			100,
			2,
			1,
			{ cx: 0.5, cy: 0.5 },
			{ snapToEdgesRatio: 0.25 },
		);

		expect(clampedFocus).toEqual({ cx: 0.75, cy: 0.75 });
	});

	it("starts auto zooms from the saved region focus before following the cursor", () => {
		const state = createCursorFollowCameraState();
		const cursorSamples = [
			{ timeMs: 0, cx: 0.8, cy: 0.2, interactionType: "move" as const },
			{ timeMs: 100, cx: 0.82, cy: 0.22, interactionType: "move" as const },
		];

		const initialFocus = computeCursorFollowFocus(
			state,
			cursorSamples,
			0,
			2,
			1,
			{ cx: 0.3, cy: 0.7 },
			{ snapToEdgesRatio: 0.25 },
		);

		expect(initialFocus).toEqual({ cx: 0.3, cy: 0.7 });
	});

	it("keeps the cursor 10% from the bottom when it leaves the vertical safe zone", () => {
		const state = createCursorFollowCameraState();
		const cursorSamples = [
			{ timeMs: 0, cx: 0.5, cy: 0.5, interactionType: "move" as const },
			{ timeMs: 100, cx: 0.5, cy: 0.71, interactionType: "move" as const },
		];
		computeCursorFollowFocus(
			state,
			cursorSamples,
			0,
			2,
			1,
			{ cx: 0.5, cy: 0.5 },
		);
		const shiftedFocus = computeCursorFollowFocus(
			state,
			cursorSamples,
			100,
			2,
			1,
			{ cx: 0.5, cy: 0.5 },
		);
		expect(shiftedFocus.cx).toBeCloseTo(0.5, 6);
		expect(shiftedFocus.cy).toBeCloseTo(0.51, 6);
	});

	it("keeps the cursor 10% from the top when it leaves the vertical safe zone", () => {
		const state = createCursorFollowCameraState();
		const cursorSamples = [
			{ timeMs: 0, cx: 0.5, cy: 0.5, interactionType: "move" as const },
			{ timeMs: 100, cx: 0.5, cy: 0.29, interactionType: "move" as const },
		];
		computeCursorFollowFocus(
			state,
			cursorSamples,
			0,
			2,
			1,
			{ cx: 0.5, cy: 0.5 },
		);
		const shiftedFocus = computeCursorFollowFocus(
			state,
			cursorSamples,
			100,
			2,
			1,
			{ cx: 0.5, cy: 0.5 },
		);
		expect(shiftedFocus.cx).toBeCloseTo(0.5, 6);
		expect(shiftedFocus.cy).toBeCloseTo(0.49, 6);
	});

	it("clamps cropped follow focus at the crop boundary", () => {
		const state = createCursorFollowCameraState();
		const cursorSamples = [
			{ timeMs: 0, cx: 0.5, cy: 0.5, interactionType: "move" as const },
			{ timeMs: 100, cx: 0.5, cy: 0.63, interactionType: "move" as const },
		];
		const cropRegion = { x: 0, y: 0.2, width: 1, height: 0.4 };

		computeCursorFollowFocus(
			state,
			cursorSamples,
			0,
			2,
			1,
			{ cx: 0.5, cy: 0.5 },
			undefined,
			cropRegion,
		);
		const shiftedFocus = computeCursorFollowFocus(
			state,
			cursorSamples,
			100,
			2,
			1,
			{ cx: 0.5, cy: 0.5 },
			undefined,
			cropRegion,
		);

		expect(shiftedFocus.cx).toBeCloseTo(0.5, 6);
		expect(shiftedFocus.cy).toBeCloseTo(0.5, 6);
	});

	it("uses crop height for the vertical safe-zone offset", () => {
		const state = createCursorFollowCameraState();
		const cursorSamples = [
			{ timeMs: 0, cx: 0.5, cy: 0.5, interactionType: "move" as const },
			{ timeMs: 100, cx: 0.5, cy: 0.63, interactionType: "move" as const },
		];
		const cropRegion = { x: 0, y: 0.25, width: 1, height: 0.4 };

		computeCursorFollowFocus(
			state,
			cursorSamples,
			0,
			2,
			1,
			{ cx: 0.5, cy: 0.5 },
			undefined,
			cropRegion,
		);
		const shiftedFocus = computeCursorFollowFocus(
			state,
			cursorSamples,
			100,
			2,
			1,
			{ cx: 0.5, cy: 0.5 },
			undefined,
			cropRegion,
		);

		expect(shiftedFocus.cx).toBeCloseTo(0.5, 6);
		expect(shiftedFocus.cy).toBeCloseTo(0.55, 6);
	});
});

import { describe, expect, it } from "vitest";
import type { TimelineRenderItem } from "../../core/timelineTypes";
import { resolvePreviewSourceSpan } from "./timelinePreviewSourceSpan";

const clipItem: TimelineRenderItem = {
	id: "clip-1",
	rowId: "clip",
	span: { start: 1000, end: 5000 },
	sourceSpan: { start: 2000, end: 6000 },
	label: "Clip 1",
	variant: "clip",
};

describe("resolvePreviewSourceSpan", () => {
	it("reveals earlier source frames when stretching the left edge left", () => {
		expect(resolvePreviewSourceSpan(clipItem, { start: 500, end: 5000 })).toEqual({
			start: 1500,
			end: 6000,
		});
	});

	it("keeps the left source anchor when stretching the right edge right", () => {
		expect(resolvePreviewSourceSpan(clipItem, { start: 1000, end: 6500 })).toEqual({
			start: 2000,
			end: 7500,
		});
	});

	it("does not shift source sampling for body drags", () => {
		expect(resolvePreviewSourceSpan(clipItem, { start: 3000, end: 7000 })).toEqual({
			start: 2000,
			end: 6000,
		});
	});
});

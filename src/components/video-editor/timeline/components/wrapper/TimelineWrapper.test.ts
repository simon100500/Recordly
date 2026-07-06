import { describe, expect, it } from "vitest";
import { CLIP_ROW_ID } from "../../core/constants";
import { shouldPublishLiveResizePreview } from "./TimelineWrapper";

describe("shouldPublishLiveResizePreview", () => {
	it("publishes live resize previews for clips so edge stretching updates source underlays", () => {
		expect(
			shouldPublishLiveResizePreview("clip-1", [
				{ id: "clip-1", rowId: CLIP_ROW_ID, start: 0, end: 4000 },
				{ id: "audio-1", rowId: "row-audio-0", start: 0, end: 4000 },
			]),
		).toBe(true);
	});

	it("does not publish live resize previews for non-clip rows", () => {
		expect(
			shouldPublishLiveResizePreview("audio-1", [
				{ id: "clip-1", rowId: CLIP_ROW_ID, start: 0, end: 4000 },
				{ id: "audio-1", rowId: "row-audio-0", start: 0, end: 4000 },
			]),
		).toBe(false);
	});
});

import { describe, expect, it } from "vitest";

import { buildCaptionAudioCandidates, shiftCaptionCueTimes } from "./audioSource";

describe("caption audio candidates", () => {
	it("prioritizes the external editor audio track over embedded recording audio", () => {
		expect(
			buildCaptionAudioCandidates(
				"/videos/recording.mp4",
				"/recordings/voiceover.webm",
				1500,
			),
		).toEqual([
			{ path: "/recordings/voiceover.webm", label: "external audio track", startMs: 1500 },
			{ path: "/videos/recording.mp4", label: "recording", startMs: 0 },
		]);
	});

	it("shifts generated cue times to the external track timeline position", () => {
		expect(shiftCaptionCueTimes([{ startMs: 0, endMs: 900, text: "Hello" }], 1500)).toEqual([
			{ startMs: 1500, endMs: 2400, text: "Hello" },
		]);
	});
});

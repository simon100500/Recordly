import { describe, expect, it, vi } from "vitest";

vi.mock("../../audio/waveform/WaveformGenerator", () => ({
	waveformGenerator: {
		generate: vi.fn(),
	},
}));

import { appendWaveformRefreshToken } from "./useTimelineAudioPeaks";

describe("appendWaveformRefreshToken", () => {
	it("adds a stable cache-busting query parameter for refreshed local media URLs", () => {
		expect(
			appendWaveformRefreshToken(
				"http://127.0.0.1:49152/video?path=C%3A%5CRecordly%5Crecording.mp4",
				3,
			),
		).toBe(
			"http://127.0.0.1:49152/video?path=C%3A%5CRecordly%5Crecording.mp4&recordlyWaveformRefresh=3",
		);
	});

	it("leaves the resource unchanged before a refresh is requested", () => {
		expect(
			appendWaveformRefreshToken(
				"http://127.0.0.1:49152/video?path=C%3A%5CRecordly%5Crecording.mp4",
				0,
			),
		).toBe("http://127.0.0.1:49152/video?path=C%3A%5CRecordly%5Crecording.mp4");
	});
});

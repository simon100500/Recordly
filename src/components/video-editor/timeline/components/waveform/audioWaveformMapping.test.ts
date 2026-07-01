import { describe, expect, it } from "vitest";
import { resolveWaveformSourceTimeMs } from "./audioWaveformMapping";

describe("resolveWaveformSourceTimeMs", () => {
	it("reveals later source audio as clip width grows instead of stretching the old segment", () => {
		const base = {
			segmentStartMs: 4_000,
			segmentEndMs: 6_000,
			displayStartMs: 4_000,
			displayEndMs: 6_000,
			pixelsPerDisplayMs: 0.1,
		};

		expect(resolveWaveformSourceTimeMs({ ...base, cssX: 0 })).toBe(4_000);
		expect(resolveWaveformSourceTimeMs({ ...base, cssX: 100 })).toBe(5_000);
		expect(resolveWaveformSourceTimeMs({ ...base, cssX: 300 })).toBe(7_000);
	});

	it("preserves clip speed when mapping visible pixels to source audio", () => {
		expect(
			resolveWaveformSourceTimeMs({
				segmentStartMs: 1_000,
				segmentEndMs: 5_000,
				displayStartMs: 10_000,
				displayEndMs: 12_000,
				pixelsPerDisplayMs: 0.1,
				cssX: 100,
			}),
		).toBe(3_000);
	});

	it("keeps the right side anchored when the left trim hides source audio", () => {
		const afterLeftTrim = {
			segmentStartMs: 4_700,
			segmentEndMs: 7_200,
			displayStartMs: 4_400,
			displayEndMs: 6_900,
			pixelsPerDisplayMs: 0.1,
		};

		expect(resolveWaveformSourceTimeMs({ ...afterLeftTrim, cssX: 0 })).toBe(4_700);
		expect(resolveWaveformSourceTimeMs({ ...afterLeftTrim, cssX: 100 })).toBe(5_700);
		expect(resolveWaveformSourceTimeMs({ ...afterLeftTrim, cssX: 250 })).toBe(7_200);
	});
});

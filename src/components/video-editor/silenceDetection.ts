export interface SilenceSegment {
	startMs: number;
	endMs: number;
	amplitude: number;
}

export function detectSilence(
	peaks: Float32Array,
	durationMs: number,
	sensitivity: number,
	minSilenceMs: number,
): SilenceSegment[] {
	if (peaks.length === 0 || durationMs <= 0) return [];

	const msPerPeak = durationMs / peaks.length;
	const windowMs = 10;
	const windowPeaks = Math.max(1, Math.round(windowMs / msPerPeak));
	const threshold = Math.max(0.001, sensitivity);
	const minSilenceWindows = Math.max(1, Math.round(minSilenceMs / windowMs));

	const silent: SilenceSegment[] = [];
	let silenceStart: number | null = null;
	let silentWindowCount = 0;

	for (let i = 0; i < peaks.length; i += windowPeaks) {
		let maxAmp = 0;
		const windowEnd = Math.min(i + windowPeaks, peaks.length);
		for (let j = i; j < windowEnd; j++) {
			const amp = Math.abs(peaks[j]);
			if (amp > maxAmp) maxAmp = amp;
		}

		const timeMs = (i * durationMs) / peaks.length;
		const isSilent = maxAmp < threshold;

		if (isSilent) {
			if (silenceStart === null) silenceStart = timeMs;
			silentWindowCount++;
		} else {
			if (silenceStart !== null && silentWindowCount >= minSilenceWindows) {
				silent.push({
					startMs: silenceStart,
					endMs: timeMs,
					amplitude: maxAmp,
				});
			}
			silenceStart = null;
			silentWindowCount = 0;
		}
	}

	if (silenceStart !== null && silentWindowCount >= minSilenceWindows) {
		silent.push({
			startMs: silenceStart,
			endMs: durationMs,
			amplitude: 0,
		});
	}

	return silent;
}

export function invertSilence(
	silentSegments: SilenceSegment[],
	totalDurationMs: number,
	minRegionMs: number,
): { startMs: number; endMs: number }[] {
	const regions: { startMs: number; endMs: number }[] = [];
	let cursor = 0;

	for (const seg of silentSegments) {
		if (seg.startMs - cursor >= minRegionMs) {
			regions.push({ startMs: cursor, endMs: seg.startMs });
		}
		cursor = seg.endMs;
	}

	if (totalDurationMs - cursor >= minRegionMs) {
		regions.push({ startMs: cursor, endMs: totalDurationMs });
	}

	return regions;
}

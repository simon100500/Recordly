interface ResolveWaveformSourceTimeParams {
	cssX: number;
	segmentStartMs: number;
	segmentEndMs: number;
	displayStartMs: number;
	displayEndMs: number;
	pixelsPerDisplayMs: number;
}

export function resolveWaveformSourceTimeMs({
	cssX,
	segmentStartMs,
	segmentEndMs,
	displayStartMs,
	displayEndMs,
	pixelsPerDisplayMs,
}: ResolveWaveformSourceTimeParams): number {
	const sourceDurationMs = Math.max(0, segmentEndMs - segmentStartMs);
	const displayDurationMs = Math.max(1, displayEndMs - displayStartMs);
	const speed = sourceDurationMs > 0 ? sourceDurationMs / displayDurationMs : 1;
	const sourceMsPerCssPx = speed / Math.max(pixelsPerDisplayMs, Number.EPSILON);
	const displayWidthCssPx = displayDurationMs * pixelsPerDisplayMs;
	return segmentEndMs - (displayWidthCssPx - cssX) * sourceMsPerCssPx;
}

import type { Span } from "dnd-timeline";
import type { ClipRegion } from "./types";

export interface RemovedTimelineSegment {
	startMs: number;
	endMs: number;
}

export interface ResolvedClipSpanChange {
	clip: ClipRegion;
	removedSegments: RemovedTimelineSegment[];
	movementDeltaMs: number | null;
}

export function resolveClipSpanChange(params: {
	clipRegions: ClipRegion[];
	id: string;
	span: Span;
	snapThresholdMs?: number;
}): ResolvedClipSpanChange | null {
	const { clipRegions, id, span, snapThresholdMs = 120 } = params;
	const oldClip = clipRegions.find((clip) => clip.id === id);
	if (!oldClip) return null;

	const rawStart = Math.round(span.start);
	const rawEnd = Math.round(span.end);
	const rawStartDelta = rawStart - oldClip.startMs;
	const rawEndDelta = rawEnd - oldClip.endMs;
	const isBodyDrag = Math.abs(rawStartDelta - rawEndDelta) < 1 && Math.abs(rawStartDelta) > 0;
	const isLeftEdge = rawStartDelta !== 0 && rawEndDelta === 0;
	const isRightEdge = rawStartDelta === 0 && rawEndDelta !== 0;

	const sortedForSnap = [...clipRegions].sort((left, right) => left.startMs - right.startMs);
	const snapIndex = sortedForSnap.findIndex((clip) => clip.id === id);
	const previousClip = snapIndex > 0 ? sortedForSnap[snapIndex - 1] : null;
	const nextClip =
		snapIndex >= 0 && snapIndex < sortedForSnap.length - 1
			? sortedForSnap[snapIndex + 1]
			: null;

	let newStart = rawStart;
	let newEnd = rawEnd;

	if (
		(isLeftEdge || isBodyDrag) &&
		previousClip &&
		Math.abs(rawStart - previousClip.endMs) < snapThresholdMs
	) {
		const shift = previousClip.endMs - rawStart;
		newStart = rawStart + shift;
		if (isBodyDrag) newEnd = rawEnd + shift;
	} else if (
		(isRightEdge || isBodyDrag) &&
		nextClip &&
		Math.abs(rawEnd - nextClip.startMs) < snapThresholdMs
	) {
		const shift = nextClip.startMs - rawEnd;
		newEnd = rawEnd + shift;
		if (isBodyDrag) newStart = rawStart + shift;
	}

	const startDelta = newStart - oldClip.startMs;
	let newSourceStartMs = oldClip.sourceStartMs ?? oldClip.startMs;
	if (isLeftEdge) {
		newSourceStartMs = Math.max(0, Math.round(newSourceStartMs + startDelta));
	}

	const removedSegments = [
		...(newStart > oldClip.startMs ? [{ startMs: oldClip.startMs, endMs: newStart }] : []),
		...(newEnd < oldClip.endMs ? [{ startMs: newEnd, endMs: oldClip.endMs }] : []),
	];

	return {
		clip: {
			...oldClip,
			startMs: newStart,
			endMs: newEnd,
			sourceStartMs: newSourceStartMs,
		},
		removedSegments,
		movementDeltaMs: isBodyDrag ? newStart - oldClip.startMs : null,
	};
}

export function resolveRippleClipDelete(
	clipRegions: ClipRegion[],
	id: string,
): { clipRegions: ClipRegion[]; deletedSpan: RemovedTimelineSegment; shiftMs: number } | null {
	const deletedClip = clipRegions.find((clip) => clip.id === id);
	if (!deletedClip) return null;

	const shiftMs = Math.max(0, deletedClip.endMs - deletedClip.startMs);
	return {
		deletedSpan: { startMs: deletedClip.startMs, endMs: deletedClip.endMs },
		shiftMs,
		clipRegions: clipRegions
			.filter((clip) => clip.id !== id)
			.map((clip) =>
				clip.startMs >= deletedClip.endMs
					? { ...clip, startMs: clip.startMs - shiftMs, endMs: clip.endMs - shiftMs }
					: clip,
			),
	};
}

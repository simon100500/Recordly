import type { Span } from "dnd-timeline";
import type { ClipRegion } from "./types";

export interface RemovedTimelineSegment {
	startMs: number;
	endMs: number;
}

export interface ResolvedClipSpanChange {
	clip: ClipRegion;
	clipRegions: ClipRegion[];
	removedSegments: RemovedTimelineSegment[];
	movementDeltaMs: number | null;
	rippleDeltaMs: number;
	rippleStartMs: number | null;
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
	const edgeDriftToleranceMs = 2;
	const isBodyDrag =
		Math.abs(rawStartDelta - rawEndDelta) <= edgeDriftToleranceMs &&
		Math.abs(rawStartDelta) > edgeDriftToleranceMs;
	const isLeftEdge =
		Math.abs(rawStartDelta) > edgeDriftToleranceMs &&
		Math.abs(rawEndDelta) <= edgeDriftToleranceMs;
	const isRightEdge =
		Math.abs(rawStartDelta) <= edgeDriftToleranceMs &&
		Math.abs(rawEndDelta) > edgeDriftToleranceMs;

	const sortedForSnap = [...clipRegions].sort((left, right) => left.startMs - right.startMs);
	const snapIndex = sortedForSnap.findIndex((clip) => clip.id === id);
	const previousClip = snapIndex > 0 ? sortedForSnap[snapIndex - 1] : null;
	const nextClip =
		snapIndex >= 0 && snapIndex < sortedForSnap.length - 1
			? sortedForSnap[snapIndex + 1]
			: null;

	let newStart = rawStart;
	let newEnd = rawEnd;
	let rippleDeltaMs = 0;
	let rippleStartMs: number | null = null;

	if (isLeftEdge) {
		const leftAnchorMs = previousClip?.endMs ?? 0;
		const timelineTrimDeltaMs = Math.max(0, rawStart - oldClip.startMs);
		newStart = leftAnchorMs;
		if (timelineTrimDeltaMs > 0) {
			newEnd = Math.max(newStart, oldClip.endMs - timelineTrimDeltaMs);
			rippleDeltaMs = newEnd - oldClip.endMs;
			rippleStartMs = oldClip.endMs;
		}
	} else if (
		isBodyDrag &&
		previousClip &&
		Math.abs(rawStart - previousClip.endMs) < snapThresholdMs
	) {
		const shift = previousClip.endMs - rawStart;
		newStart = rawStart + shift;
		newEnd = rawEnd + shift;
	} else if (
		(isRightEdge || isBodyDrag) &&
		nextClip &&
		Math.abs(rawEnd - nextClip.startMs) < snapThresholdMs
	) {
		const shift = nextClip.startMs - rawEnd;
		newEnd = rawEnd + shift;
		if (isBodyDrag) newStart = rawStart + shift;
	}

	if (isRightEdge) {
		rippleDeltaMs = newEnd - oldClip.endMs;
		rippleStartMs = oldClip.endMs;
	}

	const sourceStartDelta = isLeftEdge
		? rawStart > oldClip.startMs
			? rawStart - oldClip.startMs
			: newStart - oldClip.startMs
		: newStart - oldClip.startMs;
	let newSourceStartMs = oldClip.sourceStartMs ?? oldClip.startMs;
	if (isLeftEdge) {
		const speed = Number.isFinite(oldClip.speed) && oldClip.speed > 0 ? oldClip.speed : 1;
		newSourceStartMs = Math.max(0, Math.round(newSourceStartMs + sourceStartDelta * speed));
	}

	const removedSegments = [
		...(sourceStartDelta > 0 ? [{ startMs: newEnd, endMs: oldClip.endMs }] : []),
		...(newEnd < oldClip.endMs ? [{ startMs: newEnd, endMs: oldClip.endMs }] : []),
	];
	const uniqueRemovedSegments = removedSegments.filter(
		(segment, index) =>
			removedSegments.findIndex(
				(candidate) =>
					candidate.startMs === segment.startMs && candidate.endMs === segment.endMs,
			) === index,
	);

	const updatedClip = {
		...oldClip,
		startMs: newStart,
		endMs: newEnd,
		sourceStartMs: newSourceStartMs,
	};
	const updatedClipRegions = clipRegionsWithRipple({
		clipRegions,
		id,
		updatedClip,
		rippleStartMs,
		rippleDeltaMs,
	});

	return {
		clip: updatedClip,
		clipRegions: updatedClipRegions,
		removedSegments: uniqueRemovedSegments,
		movementDeltaMs: isBodyDrag ? newStart - oldClip.startMs : null,
		rippleDeltaMs,
		rippleStartMs,
	};
}

function clipRegionsWithRipple(params: {
	clipRegions: ClipRegion[];
	id: string;
	updatedClip: ClipRegion;
	rippleStartMs: number | null;
	rippleDeltaMs: number;
}) {
	const { clipRegions, id, updatedClip, rippleStartMs, rippleDeltaMs } = params;
	return clipRegions.map((clip) => {
		if (clip.id === id) return updatedClip;
		if (rippleStartMs !== null && rippleDeltaMs !== 0 && clip.startMs >= rippleStartMs) {
			return {
				...clip,
				startMs: clip.startMs + rippleDeltaMs,
				endMs: clip.endMs + rippleDeltaMs,
			};
		}
		return clip;
	});
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

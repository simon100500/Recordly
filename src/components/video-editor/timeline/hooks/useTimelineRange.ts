import type { Range } from "dnd-timeline";
import {
	type RefObject,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	type WheelEvent,
} from "react";
import { createInitialRange, normalizeWheelDeltaToPixels } from "../core/time";
import { clampRange } from "../dnd/engine";

interface UseTimelineRangeParams {
	totalMs: number;
	minVisibleRangeMs: number;
	timelineContainerRef: RefObject<HTMLDivElement>;
}

export interface TimelineWheelPanDeltaInput {
	deltaX: number;
	deltaY: number;
	deltaMode: number;
	shiftKey?: boolean;
	ctrlKey?: boolean;
	metaKey?: boolean;
	canScrollVertically?: boolean;
}

export function resolveTimelineWheelPanDeltaPx({
	deltaX,
	deltaY,
	deltaMode,
	shiftKey = false,
	ctrlKey = false,
	metaKey = false,
	canScrollVertically = true,
}: TimelineWheelPanDeltaInput) {
	if ((ctrlKey || metaKey) && !shiftKey) {
		return 0;
	}

	if (Math.abs(deltaX) > 0) {
		return normalizeWheelDeltaToPixels(deltaX, deltaMode);
	}

	if ((shiftKey || !canScrollVertically) && Math.abs(deltaY) > 0) {
		return normalizeWheelDeltaToPixels(deltaY, deltaMode);
	}

	return 0;
}

export function resolveRangeAfterTotalMsChange({
	previousRange,
	previousTotalMs,
	nextTotalMs,
}: {
	previousRange: Range;
	previousTotalMs: number;
	nextTotalMs: number;
}): Range {
	const safeNextTotalMs = Math.max(0, Math.round(nextTotalMs));
	if (safeNextTotalMs <= 0) {
		return createInitialRange(safeNextTotalMs);
	}

	const safePreviousTotalMs = Math.max(0, Math.round(previousTotalMs));
	if (safePreviousTotalMs <= 0) {
		return createInitialRange(safeNextTotalMs);
	}

	const previousVisibleSpan = Math.max(1, previousRange.end - previousRange.start);
	const visibleSpan = Math.min(previousVisibleSpan, safeNextTotalMs);
	const maxStart = Math.max(0, safeNextTotalMs - visibleSpan);
	const wasAnchoredToEnd = Math.abs(previousRange.end - safePreviousTotalMs) <= 1;
	const start = wasAnchoredToEnd
		? maxStart
		: Math.max(0, Math.min(previousRange.start, maxStart));

	return { start, end: start + visibleSpan };
}

export function useTimelineRange({
	totalMs,
	minVisibleRangeMs,
	timelineContainerRef,
}: UseTimelineRangeParams) {
	const [range, setRange] = useState<Range>(() => createInitialRange(totalMs));
	const previousTotalMsRef = useRef(totalMs);

	useEffect(() => {
		const previousTotalMs = previousTotalMsRef.current;
		previousTotalMsRef.current = totalMs;
		if (previousTotalMs === totalMs) return;
		setRange((previousRange) =>
			resolveRangeAfterTotalMsChange({
				previousRange,
				previousTotalMs,
				nextTotalMs: totalMs,
			}),
		);
	}, [totalMs]);

	const clampedRange = useMemo<Range>(() => {
		if (totalMs === 0) {
			return range;
		}
		return clampRange(range, { totalMs, minVisibleRangeMs });
	}, [range, totalMs, minVisibleRangeMs]);

	const panTimelineRange = useCallback(
		(deltaMs: number) => {
			if (!Number.isFinite(deltaMs) || deltaMs === 0 || totalMs <= 0) {
				return;
			}

			setRange((previous) => {
				const visibleSpan = Math.max(1, previous.end - previous.start);
				const maxStart = Math.max(0, totalMs - visibleSpan);
				const nextStart = Math.max(0, Math.min(previous.start + deltaMs, maxStart));
				return { start: nextStart, end: nextStart + visibleSpan };
			});
		},
		[totalMs],
	);

	const handleTimelineWheel = useCallback(
		(event: WheelEvent<HTMLDivElement>) => {
			if (((event.ctrlKey || event.metaKey) && !event.shiftKey) || totalMs <= 0) {
				return;
			}

			const container = timelineContainerRef.current;
			const horizontalDeltaPx = resolveTimelineWheelPanDeltaPx({
				deltaX: event.deltaX,
				deltaY: event.deltaY,
				deltaMode: event.deltaMode,
				shiftKey: event.shiftKey,
				ctrlKey: event.ctrlKey,
				metaKey: event.metaKey,
				canScrollVertically: container
					? container.scrollHeight > container.clientHeight + 1
					: true,
			});

			if (horizontalDeltaPx === 0) {
				return;
			}

			const containerWidth = container?.clientWidth ?? 0;
			const visibleRangeMs = clampedRange.end - clampedRange.start;
			if (containerWidth <= 0 || visibleRangeMs <= 0) {
				return;
			}

			event.preventDefault();
			const deltaMs = (horizontalDeltaPx / containerWidth) * visibleRangeMs;
			panTimelineRange(deltaMs);
		},
		[clampedRange.end, clampedRange.start, panTimelineRange, timelineContainerRef, totalMs],
	);

	const fitToScreen = useCallback(() => {
		if (totalMs <= 0) return;
		setRange({ start: 0, end: totalMs });
	}, [totalMs]);

	// factor < 1 zooms in (smaller visible span), factor > 1 zooms out (wider).
	// Anchored at the center of the visible range and allowed to exceed the
	// content duration (up to 2x) so the user can pull below "fit to screen".
	const zoomByFactor = useCallback(
		(factor: number) => {
			if (totalMs <= 0) return;
			setRange((previous) => {
				const span = Math.max(1, previous.end - previous.start);
				const maxSpan = totalMs * 2;
				const newSpan = Math.max(minVisibleRangeMs, Math.min(maxSpan, span * factor));
				if (Math.abs(newSpan - span) < 0.5) return previous;
				const center = previous.start + span / 2;
				const start = center - newSpan / 2;
				return { start, end: start + newSpan };
			});
		},
		[minVisibleRangeMs, totalMs],
	);

	return {
		range,
		setRange,
		clampedRange,
		handleTimelineWheel,
		zoomByFactor,
		fitToScreen,
	};
}

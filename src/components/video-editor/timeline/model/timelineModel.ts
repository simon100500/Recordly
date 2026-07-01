import { formatClipSpeedLabel } from "../../clipSpeedChange";
import type {
	AnnotationRegion,
	AudioRegion,
	ClipRegion,
	ZoomRegion,
} from "../../types";
import { CLIP_ROW_ID, ZOOM_ROW_ID } from "../core/constants";
import {
	getAnnotationTrackIndex,
	getAnnotationTrackRowId,
	getAudioTrackIndex,
	getAudioTrackRowId,
	isAnnotationTrackRowId,
	isAudioTrackRowId,
} from "../core/rows";
import type { TimelineRegionSpan, TimelineRenderItem } from "../core/timelineTypes";

export function getAnnotationLabel(region: AnnotationRegion): string {
	if (region.type === "text") {
		const preview = region.content.trim() || "Empty text";
		return preview.length > 20 ? `${preview.substring(0, 20)}...` : preview;
	}
	if (region.type === "image") {
		return "Image";
	}
	return "Annotation";
}

export function getAudioLabel(region: AudioRegion): string {
	return region.audioPath.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, "") || "Audio";
}

function collapseShiftAt(
	timeMs: number,
	sortedClips: { startMs: number; endMs: number }[],
): number {
	let shift = 0;
	let prevEnd = 0;
	for (const c of sortedClips) {
		const gap = c.startMs - prevEnd;
		if (timeMs < c.startMs) return shift;
		shift += gap;
		if (timeMs <= c.endMs) return shift;
		prevEnd = c.endMs;
	}
	return shift;
}

export function buildTimelineItems(params: {
	zoomRegions: ZoomRegion[];
	clipRegions: ClipRegion[];
	annotationRegions: AnnotationRegion[];
	audioRegions: AudioRegion[];
	collapse?: boolean;
}): TimelineRenderItem[] {
	const { zoomRegions, clipRegions, annotationRegions, audioRegions, collapse } = params;

	const sortedClips = collapse
		? [...clipRegions].sort((a, b) => a.startMs - b.startMs)
		: null;

	function collapseMs(ms: number): number {
		if (!sortedClips) return ms;
		return ms - collapseShiftAt(ms, sortedClips);
	}

	const zooms: TimelineRenderItem[] = zoomRegions.map((region, index) => {
		const span = collapse
			? {
					start: collapseMs(region.startMs),
					end: collapseMs(region.endMs),
				}
			: { start: region.startMs, end: region.endMs };
		return {
			id: region.id,
			rowId: ZOOM_ROW_ID,
			span,
			label: `Zoom ${index + 1}`,
			zoomDepth: region.depth,
			zoomMode: region.mode ?? "auto",
			variant: "zoom",
		};
	});

	const clips: TimelineRenderItem[] = clipRegions.map((region, index) => {
		const displayDurationMs = Math.max(0, region.endMs - region.startMs);
		const speed = Number.isFinite(region.speed) && region.speed > 0 ? region.speed : 1;
		const sourceEndMs = region.startMs + displayDurationMs * speed;
		const speedLabel = formatClipSpeedLabel(speed);

		const span = collapse
			? {
					start: collapseMs(region.startMs),
					end: collapseMs(region.endMs),
				}
			: { start: region.startMs, end: region.endMs };

		return {
			id: region.id,
			rowId: CLIP_ROW_ID,
			span,
			sourceSpan: { start: region.startMs, end: sourceEndMs },
			label: speedLabel ? `Clip ${index + 1} ${speedLabel}` : `Clip ${index + 1}`,
			speedValue: speedLabel ? speed : undefined,
			showSourceAudio: region.showSourceAudio,
			muted: Boolean(region.muted),
			variant: "clip",
		};
	});

	const annotations: TimelineRenderItem[] = annotationRegions.map((region) => ({
		id: region.id,
		rowId: getAnnotationTrackRowId(region.trackIndex ?? 0),
		span: { start: region.startMs, end: region.endMs },
		label: getAnnotationLabel(region),
		variant: "annotation",
	}));

	const audios: TimelineRenderItem[] = audioRegions.map((region) => ({
		id: region.id,
		rowId: getAudioTrackRowId(region.trackIndex ?? 0),
		span: { start: region.startMs, end: region.endMs },
		label: getAudioLabel(region),
		audioPath: region.audioPath,
		audioGain: region.volume,
		audioNormalize: Boolean(region.normalize),
		variant: "audio",
	}));

	return [...zooms, ...clips, ...annotations, ...audios];
}

export function buildAllRegionSpans(params: {
	zoomRegions: ZoomRegion[];
	clipRegions: ClipRegion[];
	audioRegions: AudioRegion[];
	collapse?: boolean;
}): TimelineRegionSpan[] {
	const { zoomRegions, clipRegions, audioRegions, collapse } = params;

	const sortedClips = collapse
		? [...clipRegions].sort((a, b) => a.startMs - b.startMs)
		: null;

	function collapseMs(ms: number): number {
		if (!sortedClips) return ms;
		return ms - collapseShiftAt(ms, sortedClips);
	}

	const zooms = zoomRegions.map((r) => ({
		id: r.id,
		start: collapse ? collapseMs(r.startMs) : r.startMs,
		end: collapse ? collapseMs(r.endMs) : r.endMs,
		rowId: ZOOM_ROW_ID,
	}));
	const clips = clipRegions.map((r) => ({
		id: r.id,
		start: collapse ? collapseMs(r.startMs) : r.startMs,
		end: collapse ? collapseMs(r.endMs) : r.endMs,
		rowId: CLIP_ROW_ID,
	}));
	const audios = audioRegions.map((r) => ({
		id: r.id,
		start: r.startMs,
		end: r.endMs,
		rowId: getAudioTrackRowId(r.trackIndex ?? 0),
	}));
	return [...zooms, ...clips, ...audios];
}

export function resolveDropRowId(
	id: string,
	proposedRowId: string,
	timelineItems: TimelineRenderItem[],
) {
	const currentRowId = timelineItems.find((item) => item.id === id)?.rowId;
	if (!currentRowId) {
		return proposedRowId;
	}

	if (isAnnotationTrackRowId(currentRowId)) {
		return isAnnotationTrackRowId(proposedRowId)
			? getAnnotationTrackRowId(getAnnotationTrackIndex(proposedRowId))
			: currentRowId;
	}

	if (isAudioTrackRowId(currentRowId)) {
		return isAudioTrackRowId(proposedRowId)
			? getAudioTrackRowId(getAudioTrackIndex(proposedRowId))
			: currentRowId;
	}

	return currentRowId;
}

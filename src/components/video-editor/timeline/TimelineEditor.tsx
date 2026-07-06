import {
	ArrowsOutSimple as FitScreen,
	Plus,
	MagnifyingGlassPlus as ZoomIn,
	MagnifyingGlassMinus as ZoomOut,
} from "@phosphor-icons/react";
import type { Span } from "dnd-timeline";
import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type {
	SourceAudioTrackMeta,
	SourceAudioTrackSettings,
} from "@/components/video-editor/audio/audioTypes";
import { useScopedT } from "@/contexts/I18nContext";
import { useShortcuts } from "@/contexts/ShortcutsContext";
import { fromFileUrl } from "../projectPersistence";
import type {
	AnnotationRegion,
	AudioRegion,
	ClipRegion,
	CursorTelemetryPoint,
	SpeedRegion,
	TrimRegion,
	ZoomFocus,
	ZoomRegion,
} from "../types";
import { getClipSourceEndMs } from "../types";
import { resolveClipLiveResizePreview } from "./clipLiveResizePreview";
import KeyframeMarkers from "./components/markers/KeyframeMarkers";
import TimelineCanvas from "./components/viewport/TimelineCanvas";
import TimelineWrapper from "./components/wrapper/TimelineWrapper";
import { calculateTimelineScale } from "./core/time";
import type { AudioPeaksData } from "./core/timelineTypes";
import { useTimelineAudioPeaks } from "./hooks/useTimelineAudioPeaks";
import { useTimelineEditorRuntime } from "./hooks/useTimelineEditorRuntime";
import { useTimelineRange } from "./hooks/useTimelineRange";
import {
	buildSourceSidecarPathCandidates,
	buildTimelineSourceAudioTracks,
} from "./sourceAudioTracks";

export interface TimelineEditorProps {
	videoDuration: number;
	currentTime: number;
	playheadTime?: number;
	onSeek?: (time: number) => void;
	cursorTelemetry?: CursorTelemetryPoint[];
	autoSuggestZoomsTrigger?: number;
	onAutoSuggestZoomsConsumed?: () => void;
	disableSuggestedZooms?: boolean;
	zoomRegions: ZoomRegion[];
	onZoomAdded: (span: Span) => void;
	onZoomSuggested?: (span: Span, focus: ZoomFocus) => void;
	onZoomSpanChange: (id: string, span: Span) => void;
	onZoomDelete: (id: string) => void;
	selectedZoomId: string | null;
	onSelectZoom: (id: string | null) => void;
	trimRegions?: TrimRegion[];
	onTrimSpanChange?: (id: string, span: Span) => void;
	clipRegions?: ClipRegion[];
	onClipSplit?: (splitMs: number) => void;
	onClipSpanChange?: (id: string, span: Span) => void;
	onClipDelete?: (id: string) => void;
	selectedClipId?: string | null;
	onSelectClip?: (id: string | null) => void;
	annotationRegions?: AnnotationRegion[];
	onAnnotationAdded?: (span: Span, trackIndex?: number) => void;
	onAnnotationSpanChange?: (id: string, span: Span, trackIndex?: number) => void;
	onAnnotationDelete?: (id: string) => void;
	selectedAnnotationId?: string | null;
	onSelectAnnotation?: (id: string | null) => void;
	speedRegions?: SpeedRegion[];
	onSpeedSpanChange?: (id: string, span: Span) => void;
	audioRegions?: AudioRegion[];
	onAudioAdded?: (span: Span, audioPath: string, trackIndex?: number) => void;
	onAudioSpanChange?: (id: string, span: Span, trackIndex?: number) => void;
	onAudioDelete?: (id: string) => void;
	selectedAudioId?: string | null;
	onSelectAudio?: (id: string | null) => void;
	videoPath?: string | null;
	videoSourcePath?: string | null;
	sourceAudioRefreshKey?: number;
	cursorTelemetrySourcePath?: string | null;
	showSourceAudioTrack?: boolean;
	onSourceAudioAvailabilityChange?: (available: boolean) => void;
	sourceAudioTrackSettings?: SourceAudioTrackSettings;
	getSourceAudioTrackSettingsForClip?: (clipId: string | null) => SourceAudioTrackSettings;
	onSourceAudioTracksMetaChange?: (tracks: SourceAudioTrackMeta) => void;
}

function extractLocalPathFromMediaServerUrl(input: string | null | undefined): string | null {
	if (!input) return null;
	try {
		const url = new URL(input);
		const isLocalMediaServer =
			(url.protocol === "http:" || url.protocol === "https:") &&
			(url.hostname === "127.0.0.1" || url.hostname === "localhost") &&
			url.pathname === "/video";
		if (!isLocalMediaServer) return null;
		return url.searchParams.get("path");
	} catch {
		return null;
	}
}

export interface TimelineEditorHandle {
	addZoom: () => void;
	suggestZooms: () => void;
	splitClip: () => void;
	addAnnotation: (trackIndex?: number) => void;
	addAudio: (trackIndex?: number) => Promise<void>;
	getSourceAudioPeaks: () => AudioPeaksData | null;
	keyframes: { id: string; time: number }[];
}

const TimelineEditor = forwardRef<TimelineEditorHandle, TimelineEditorProps>(
	function TimelineEditor(
		{
			videoDuration,
			currentTime,
			playheadTime,
			onSeek,
			cursorTelemetry = [],
			autoSuggestZoomsTrigger = 0,
			onAutoSuggestZoomsConsumed,
			disableSuggestedZooms = false,
			zoomRegions,
			onZoomAdded,
			onZoomSuggested,
			onZoomSpanChange,
			onZoomDelete,
			selectedZoomId,
			onSelectZoom,
			trimRegions = [],
			onTrimSpanChange,
			clipRegions = [],
			onClipSplit,
			onClipSpanChange,
			onClipDelete,
			selectedClipId,
			onSelectClip,
			annotationRegions = [],
			onAnnotationAdded,
			onAnnotationSpanChange,
			onAnnotationDelete,
			selectedAnnotationId,
			onSelectAnnotation,
			speedRegions = [],
			onSpeedSpanChange,
			audioRegions = [],
			onAudioAdded,
			onAudioSpanChange,
			onAudioDelete,
			selectedAudioId,
			onSelectAudio,
			videoPath,
			videoSourcePath,
			sourceAudioRefreshKey = 0,
			cursorTelemetrySourcePath,
			showSourceAudioTrack = false,
			onSourceAudioAvailabilityChange,
			sourceAudioTrackSettings = {},
			getSourceAudioTrackSettingsForClip,
			onSourceAudioTracksMetaChange,
		},
		ref,
	) {
		const t = useScopedT("settings");
		const totalMs = useMemo(
			() => Math.max(0, Math.round(videoDuration * 1000)),
			[videoDuration],
		);
		const currentTimeMs = useMemo(
			() => Math.round((playheadTime ?? currentTime) * 1000),
			[currentTime, playheadTime],
		);
		const timelineScale = useMemo(() => calculateTimelineScale(videoDuration), [videoDuration]);
		const safeMinDurationMs = useMemo(
			() =>
				totalMs > 0
					? Math.min(timelineScale.minItemDurationMs, totalMs)
					: timelineScale.minItemDurationMs,
			[timelineScale.minItemDurationMs, totalMs],
		);

		const timelineContainerRef = useRef<HTMLDivElement>(null);
		const isTimelineFocusedRef = useRef(false);
		const { setRange, clampedRange, handleTimelineWheel, zoomByFactor, fitToScreen } =
			useTimelineRange({
				totalMs,
				minVisibleRangeMs: timelineScale.minVisibleRangeMs,
				timelineContainerRef,
			});

		const [liveSpanPreviewById, setLiveSpanPreviewById] = useState<Record<string, Span>>({});
		const liveZoomPreview = useMemo(() => {
			const previewSpans: Record<string, Span> = {};
			const sourcePreviewSpans: Record<string, Span> = {};
			const hiddenZoomIds = new Set<string>();
			let activeResizeId: string | null = null;
			let activeResizeDisplaySpan: Span | null = null;

			for (const [previewId, rawPreviewSpan] of Object.entries(liveSpanPreviewById)) {
				const oldClip = clipRegions.find((clip) => clip.id === previewId);
				if (!oldClip) continue;
				const clipPreview = resolveClipLiveResizePreview(
					clipRegions,
					previewId,
					rawPreviewSpan,
				);
				const previewSpan = clipPreview?.span ?? rawPreviewSpan;
				if (clipPreview) {
					// Active clip: store source span + display span for waveform overlay
					sourcePreviewSpans[previewId] = clipPreview.sourceSpan;
					activeResizeId = previewId;
					activeResizeDisplaySpan = clipPreview.span;

					// Do NOT add active clip to previewSpans — overriding Item.span
					// mid-resize conflicts with dnd-timeline's direct DOM manipulation
					// and causes position jumps. dnd-timeline handles the visual.

					// Ripple: add shifted spans for following clips
					if (clipPreview.rippleDeltaMs !== 0 && clipPreview.rippleStartMs !== null) {
						for (const clip of clipRegions) {
							if (
								clip.id !== previewId &&
								clip.startMs >= clipPreview.rippleStartMs
							) {
								previewSpans[clip.id] = {
									start: clip.startMs + clipPreview.rippleDeltaMs,
									end: clip.endMs + clipPreview.rippleDeltaMs,
								};
								sourcePreviewSpans[clip.id] = {
									start: clip.sourceStartMs ?? clip.startMs,
									end: getClipSourceEndMs(clip),
								};
							}
						}
					}
				}

				const resolvedNewStart = Math.round(previewSpan.start);
				const resolvedNewEnd = Math.round(previewSpan.end);
				const removedSegments = [
					...(resolvedNewStart > oldClip.startMs
						? [{ startMs: oldClip.startMs, endMs: resolvedNewStart }]
						: []),
					...(resolvedNewEnd < oldClip.endMs
						? [{ startMs: resolvedNewEnd, endMs: oldClip.endMs }]
						: []),
				];

				const startDelta = resolvedNewStart - oldClip.startMs;
				const endDelta = resolvedNewEnd - oldClip.endMs;
				const isMove = Math.abs(startDelta - endDelta) < 1 && Math.abs(startDelta) > 0;

				if (isMove) {
					const delta = startDelta;
					for (const zoom of zoomRegions) {
						const overlaps =
							zoom.startMs < oldClip.endMs && zoom.endMs > oldClip.startMs;
						if (!overlaps) continue;
						previewSpans[zoom.id] = {
							start: zoom.startMs + delta,
							end: zoom.endMs + delta,
						};
					}
				}

				if (removedSegments.length > 0) {
					for (const zoom of zoomRegions) {
						const removed = removedSegments.some(
							(segment) =>
								zoom.startMs < segment.endMs && zoom.endMs > segment.startMs,
						);
						if (removed) hiddenZoomIds.add(zoom.id);
					}
				}
			}

			return {
				previewSpans,
				sourcePreviewSpans,
				hiddenZoomIds,
				activeResizeId,
				activeResizeDisplaySpan,
			};
		}, [clipRegions, liveSpanPreviewById, zoomRegions]);
		const { shortcuts: keyShortcuts, isMac } = useShortcuts();
		const { peaks: rawSourceAudioPeaks, loading: sourceAudioLoading } = useTimelineAudioPeaks(
			videoPath,
			{ refreshKey: sourceAudioRefreshKey },
		);
		const localSourcePath = useMemo(() => {
			if (!videoPath) return null;
			return (
				extractLocalPathFromMediaServerUrl(videoPath) ||
				(/^file:\/\//i.test(videoPath) ? fromFileUrl(videoPath) : videoPath)
			);
		}, [videoPath]);
		const micSidecarPaths = useMemo(
			() => (localSourcePath ? buildSourceSidecarPathCandidates(localSourcePath, "mic") : []),
			[localSourcePath],
		);
		const micSidecarFallbackPaths = useMemo(() => micSidecarPaths.slice(1), [micSidecarPaths]);
		const systemSidecarPaths = useMemo(
			() =>
				localSourcePath ? buildSourceSidecarPathCandidates(localSourcePath, "system") : [],
			[localSourcePath],
		);
		const systemSidecarFallbackPaths = useMemo(
			() => systemSidecarPaths.slice(1),
			[systemSidecarPaths],
		);
		const { peaks: micSidecarPeaks, loading: micSidecarLoading } = useTimelineAudioPeaks(
			micSidecarPaths[0] ?? null,
			{ fallbackResources: micSidecarFallbackPaths, refreshKey: sourceAudioRefreshKey },
		);
		const { peaks: systemSidecarPeaks, loading: systemSidecarLoading } = useTimelineAudioPeaks(
			systemSidecarPaths[0] ?? null,
			{
				fallbackResources: systemSidecarFallbackPaths,
				refreshKey: sourceAudioRefreshKey,
			},
		);
		const sourceAudioTracks = useMemo(
			() =>
				buildTimelineSourceAudioTracks({
					sourceAudioPeaks: rawSourceAudioPeaks,
					micSidecarPeaks,
					systemSidecarPeaks,
					labels: {
						system: t("audio.systemLabel", "Source System"),
						mic: t("audio.micLabel", "Source Mic"),
						mixed: t("audio.mixedLabel", "Source"),
					},
				}),
			[micSidecarPeaks, rawSourceAudioPeaks, systemSidecarPeaks, t],
		);

		const sourceAudioPeaks = sourceAudioTracks[0]?.peaks ?? null;
		const isLoading = useMemo(() => {
			// If we are still actively trying to load audio peaks (main or sidecars)
			if (videoPath && (sourceAudioLoading || micSidecarLoading || systemSidecarLoading))
				return true;

			// Robust telemetry loading detection:
			// If a source path is set but telemetry hasn't arrived (or failed/retried) for it yet.
			if (videoSourcePath && cursorTelemetrySourcePath !== videoSourcePath) return true;

			return false;
		}, [
			videoPath,
			videoSourcePath,
			cursorTelemetrySourcePath,
			sourceAudioLoading,
			micSidecarLoading,
			systemSidecarLoading,
		]);
		useEffect(() => {
			onSourceAudioTracksMetaChange?.(
				sourceAudioTracks.map((t) => ({ id: t.id, label: t.label })),
			);
		}, [onSourceAudioTracksMetaChange, sourceAudioTracks]);
		void sourceAudioTrackSettings;
		useEffect(() => {
			onSourceAudioAvailabilityChange?.(sourceAudioTracks.length > 0);
		}, [onSourceAudioAvailabilityChange, sourceAudioTracks.length]);

		const {
			keyframes,
			selectedKeyframeId,
			setSelectedKeyframeId,
			selectAllBlocksActive,
			setSelectAllBlocksActive,
			handleKeyframeMove,
			clearSelectedBlocks,
			handleSelectZoom,
			handleSelectClip,
			handleSelectAnnotation,
			handleSelectAudio,
			hasOverlap,
			timelineItems,
			allRegionSpans,
			getResolvedDropRowId,
			handleItemSpanChange,
			canPlaceZoomAtMs,
			addZoomAtMs,
		} = useTimelineEditorRuntime({
			ref,
			videoDuration,
			totalMs,
			currentTimeMs,
			safeMinDurationMs,
			cursorTelemetry,
			autoSuggestZoomsTrigger,
			onAutoSuggestZoomsConsumed,
			disableSuggestedZooms,
			sourceAudioPeaks,
			zoomRegions,
			onZoomAdded,
			onZoomSuggested,
			onZoomSpanChange,
			onZoomDelete,
			selectedZoomId,
			onSelectZoom,
			trimRegions,
			onTrimSpanChange,
			clipRegions,
			onClipSplit,
			onClipSpanChange,
			onClipDelete,
			selectedClipId,
			onSelectClip,
			annotationRegions,
			onAnnotationAdded,
			onAnnotationSpanChange,
			onAnnotationDelete,
			selectedAnnotationId,
			onSelectAnnotation,
			speedRegions,
			onSpeedSpanChange,
			audioRegions,
			onAudioAdded,
			onAudioSpanChange,
			onAudioDelete,
			selectedAudioId,
			onSelectAudio,
			isMac,
			keyShortcuts,
			isTimelineFocusedRef,
		});

		if (!videoDuration || videoDuration === 0) {
			return (
				<div className="flex-1 flex flex-col items-center justify-center rounded-lg bg-editor-surface gap-3">
					<div className="w-12 h-12 rounded-full bg-foreground/5 flex items-center justify-center">
						<Plus className="w-6 h-6 text-muted-foreground" />
					</div>
					<div className="text-center">
						<p className="text-sm font-medium text-muted-foreground">No Video Loaded</p>
						<p className="text-xs text-muted-foreground/70 mt-1">
							Drag and drop a video to start editing
						</p>
					</div>
				</div>
			);
		}

		return (
			<div className="flex-1 min-h-0 flex flex-col bg-editor-bg overflow-hidden relative">
				<div
					ref={timelineContainerRef}
					className="flex-1 min-h-0 overflow-auto bg-editor-bg"
					tabIndex={0}
					onFocus={() => {
						isTimelineFocusedRef.current = true;
					}}
					onBlur={() => {
						isTimelineFocusedRef.current = false;
					}}
					onMouseDown={() => {
						timelineContainerRef.current?.focus();
						isTimelineFocusedRef.current = true;
					}}
					onClick={() => {
						setSelectedKeyframeId(null);
						setSelectAllBlocksActive(false);
					}}
					onWheel={handleTimelineWheel}
				>
					<TimelineWrapper
						range={clampedRange}
						videoDuration={videoDuration}
						hasOverlap={hasOverlap}
						onRangeChange={setRange}
						minItemDurationMs={timelineScale.minItemDurationMs}
						minVisibleRangeMs={timelineScale.minVisibleRangeMs}
						onItemSpanChange={handleItemSpanChange}
						resolveTargetRowId={getResolvedDropRowId}
						allRegionSpans={allRegionSpans}
						onLiveSpanPreviewChange={(id, span) => {
							setLiveSpanPreviewById((prev) => {
								if (!span) {
									if (!(id in prev)) return prev;
									const next = { ...prev };
									delete next[id];
									return next;
								}
								const current = prev[id];
								if (
									current &&
									current.start === span.start &&
									current.end === span.end
								) {
									return prev;
								}
								return { ...prev, [id]: span };
							});
						}}
					>
						<KeyframeMarkers
							keyframes={keyframes}
							selectedKeyframeId={selectedKeyframeId}
							setSelectedKeyframeId={setSelectedKeyframeId}
							onKeyframeMove={handleKeyframeMove}
							videoDurationMs={totalMs}
							timelineRef={timelineContainerRef}
						/>
						<TimelineCanvas
							items={timelineItems}
							videoDurationMs={totalMs}
							currentTimeMs={currentTimeMs}
							onSeek={onSeek}
							onAddZoomAtMs={addZoomAtMs}
							canPlaceZoomAtMs={canPlaceZoomAtMs}
							onSelectZoom={handleSelectZoom}
							onSelectClip={handleSelectClip}
							onSelectAnnotation={handleSelectAnnotation}
							onSelectAudio={handleSelectAudio}
							selectedZoomId={selectedZoomId}
							selectedClipId={selectedClipId}
							selectedAnnotationId={selectedAnnotationId}
							selectedAudioId={selectedAudioId}
							selectAllBlocksActive={selectAllBlocksActive}
							onClearBlockSelection={clearSelectedBlocks}
							keyframes={keyframes}
							sourceAudioTracks={sourceAudioTracks}
							getSourceAudioTrackSettingsForClip={getSourceAudioTrackSettingsForClip}
							showSourceAudioTrack={showSourceAudioTrack}
							liveSpanPreviewById={liveZoomPreview.previewSpans}
							liveSourceSpanPreviewById={liveZoomPreview.sourcePreviewSpans}
							activeResizeId={liveZoomPreview.activeResizeId}
							activeResizeDisplaySpan={liveZoomPreview.activeResizeDisplaySpan}
							liveHiddenItemIds={Array.from(liveZoomPreview.hiddenZoomIds)}
							isLoading={isLoading}
						/>
					</TimelineWrapper>
				</div>
				<div className="absolute bottom-3 right-3 z-[55] flex items-center gap-0.5 rounded-lg border border-foreground/10 bg-editor-panel/95 p-1 shadow-lg backdrop-blur">
					<Button
						onClick={() => zoomByFactor(1.4)}
						variant="ghost"
						size="icon"
						className="h-7 w-7 text-muted-foreground hover:text-[#2563EB] hover:bg-[#2563EB]/10"
						title="Zoom out"
						aria-label="Zoom out"
					>
						<ZoomOut className="w-4 h-4" />
					</Button>
					<Button
						onClick={fitToScreen}
						variant="ghost"
						size="icon"
						className="h-7 w-7 text-muted-foreground hover:text-[#2563EB] hover:bg-[#2563EB]/10"
						title="Fit to screen"
						aria-label="Fit to screen"
					>
						<FitScreen className="w-4 h-4" />
					</Button>
					<Button
						onClick={() => zoomByFactor(1 / 1.4)}
						variant="ghost"
						size="icon"
						className="h-7 w-7 text-muted-foreground hover:text-[#2563EB] hover:bg-[#2563EB]/10"
						title="Zoom in"
						aria-label="Zoom in"
					>
						<ZoomIn className="w-4 h-4" />
					</Button>
				</div>
			</div>
		);
	},
);

TimelineEditor.displayName = "TimelineEditor";

export default TimelineEditor;

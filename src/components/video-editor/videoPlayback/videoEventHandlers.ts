import type React from "react";
import { extensionHost } from "@/lib/extensions";
import { enablePitchPreservingPlayback } from "@/lib/mediaTiming";
import type { SpeedRegion, TrimRegion } from "../types";

export interface PlaybackTimelineSegment {
	clipId: string;
	outputStartMs: number;
	outputEndMs: number;
	sourceStartMs: number;
	sourceEndMs: number;
	speed: number;
}

interface PresentedFrameMetadata {
	mediaTime?: number;
}

type PresentedFrameVideoElement = HTMLVideoElement & {
	requestVideoFrameCallback?: (
		callback: (now: DOMHighResTimeStamp, metadata: PresentedFrameMetadata) => void,
	) => number;
	cancelVideoFrameCallback?: (handle: number) => void;
};

interface VideoEventHandlersParams {
	video: HTMLVideoElement;
	isSeekingRef: React.MutableRefObject<boolean>;
	isPlayingRef: React.MutableRefObject<boolean>;
	allowPlaybackRef: React.MutableRefObject<boolean>;
	currentTimeRef: React.MutableRefObject<number>;
	timeUpdateAnimationRef: React.MutableRefObject<number | null>;
	onPlayStateChange: (playing: boolean) => void;
	onTimeUpdate: (time: number) => void;
	trimRegionsRef: React.MutableRefObject<TrimRegion[]>;
	speedRegionsRef: React.MutableRefObject<SpeedRegion[]>;
	timelineSegmentsRef?: React.MutableRefObject<PlaybackTimelineSegment[]>;
	timelineTimeRef?: React.MutableRefObject<number>;
}

export function createVideoEventHandlers(params: VideoEventHandlersParams) {
	const {
		video,
		isSeekingRef,
		isPlayingRef,
		allowPlaybackRef,
		currentTimeRef,
		timeUpdateAnimationRef,
		onPlayStateChange,
		onTimeUpdate,
		trimRegionsRef,
		speedRegionsRef,
		timelineSegmentsRef,
		timelineTimeRef,
	} = params;
	const presentedFrameVideo = video as PresentedFrameVideoElement;
	let videoFrameRequestId: number | null = null;
	let activeTimelineSegment: PlaybackTimelineSegment | null = null;
	enablePitchPreservingPlayback(video);

	const emitTime = (timeValue: number) => {
		currentTimeRef.current = timeValue * 1000;
		onTimeUpdate(timeValue);
		extensionHost.emitEvent({ type: "playback:timeupdate", timeMs: timeValue * 1000 });
	};

	// Helper function to check if current time is within a trim region
	const findActiveTrimRegion = (currentTimeMs: number): TrimRegion | null => {
		const trimRegions = trimRegionsRef.current;
		return (
			trimRegions.find(
				(region) => currentTimeMs >= region.startMs && currentTimeMs < region.endMs,
			) || null
		);
	};

	// Helper function to find the active speed region at the current time
	const findActiveSpeedRegion = (currentTimeMs: number): SpeedRegion | null => {
		return (
			speedRegionsRef.current.find(
				(region) => currentTimeMs >= region.startMs && currentTimeMs < region.endMs,
			) || null
		);
	};

	const getSortedTimelineSegments = () =>
		[...(timelineSegmentsRef?.current ?? [])].sort(
			(left, right) => left.outputStartMs - right.outputStartMs,
		);

	const mapSourceMsToOutputMs = (sourceTimeMs: number, segment: PlaybackTimelineSegment) => {
		const speed = Number.isFinite(segment.speed) && segment.speed > 0 ? segment.speed : 1;
		return Math.round(segment.outputStartMs + (sourceTimeMs - segment.sourceStartMs) / speed);
	};

	const findTimelineSegmentForSourceTime = (
		sourceTimeMs: number,
		options: { includeEnd?: boolean } = {},
	): PlaybackTimelineSegment | null => {
		const segments = getSortedTimelineSegments();
		if (segments.length === 0) return null;

		const candidates = segments.filter((segment) => {
			const beforeEnd = options.includeEnd
				? sourceTimeMs <= segment.sourceEndMs
				: sourceTimeMs < segment.sourceEndMs;
			return sourceTimeMs >= segment.sourceStartMs && beforeEnd;
		});
		if (candidates.length === 0) return null;
		if (
			activeTimelineSegment &&
			candidates.some((segment) => segment === activeTimelineSegment)
		) {
			return activeTimelineSegment;
		}

		const preferredOutputMs = timelineTimeRef?.current;
		if (Number.isFinite(preferredOutputMs)) {
			return candidates.reduce((best, candidate) =>
				Math.abs(
					mapSourceMsToOutputMs(sourceTimeMs, candidate) - (preferredOutputMs ?? 0),
				) < Math.abs(mapSourceMsToOutputMs(sourceTimeMs, best) - (preferredOutputMs ?? 0))
					? candidate
					: best,
			);
		}

		return candidates[0];
	};

	const getNextTimelineSegment = (
		segment: PlaybackTimelineSegment,
	): PlaybackTimelineSegment | null => {
		const segments = getSortedTimelineSegments();
		const segmentIndex = segments.findIndex((candidate) => candidate.clipId === segment.clipId);
		if (segmentIndex < 0 || segmentIndex + 1 >= segments.length) return null;
		return segments[segmentIndex + 1] ?? null;
	};

	const findEndingTimelineSegmentFromHint = (
		sourceTimeMs: number,
	): PlaybackTimelineSegment | null => {
		const preferredOutputMs = timelineTimeRef?.current;
		if (!Number.isFinite(preferredOutputMs)) return null;

		return (
			getSortedTimelineSegments().find(
				(segment) =>
					sourceTimeMs >= segment.sourceEndMs &&
					(preferredOutputMs ?? 0) >= segment.outputStartMs &&
					(preferredOutputMs ?? 0) <= segment.outputEndMs,
			) ?? null
		);
	};

	const jumpToTimelineSegment = (segment: PlaybackTimelineSegment) => {
		const targetTime = segment.sourceStartMs / 1000;
		video.currentTime = targetTime;
		activeTimelineSegment = segment;
		if (timelineTimeRef) {
			timelineTimeRef.current = segment.outputStartMs;
		}
		emitTime(targetTime);
	};

	const maybeJumpAtTimelineSegmentBoundary = (sourceTimeMs: number): boolean => {
		const segment =
			activeTimelineSegment ??
			findEndingTimelineSegmentFromHint(sourceTimeMs) ??
			findTimelineSegmentForSourceTime(sourceTimeMs, { includeEnd: true });
		if (!segment || sourceTimeMs < segment.sourceEndMs) {
			activeTimelineSegment = segment;
			return false;
		}

		const nextSegment = getNextTimelineSegment(segment);
		if (!nextSegment) return false;

		jumpToTimelineSegment(nextSegment);
		return true;
	};

	const skipPastTrimRegion = (trimRegion: TrimRegion) => {
		const skipToTime = trimRegion.endMs / 1000;
		const clampedSkipToTime = Math.min(skipToTime, video.duration);

		video.currentTime = clampedSkipToTime;
		emitTime(clampedSkipToTime);

		if (clampedSkipToTime >= video.duration) {
			video.pause();
		}
	};

	const cancelScheduledUpdate = () => {
		if (timeUpdateAnimationRef.current !== null) {
			cancelAnimationFrame(timeUpdateAnimationRef.current);
			timeUpdateAnimationRef.current = null;
		}

		if (
			videoFrameRequestId !== null &&
			typeof presentedFrameVideo.cancelVideoFrameCallback === "function"
		) {
			presentedFrameVideo.cancelVideoFrameCallback(videoFrameRequestId);
			videoFrameRequestId = null;
		}
	};

	const scheduleNextUpdate = () => {
		if (video.paused || video.ended) {
			return;
		}

		// Align editor state with the frame Chromium actually presented instead of
		// polling `currentTime` on a generic animation frame.
		if (typeof presentedFrameVideo.requestVideoFrameCallback === "function") {
			videoFrameRequestId = presentedFrameVideo.requestVideoFrameCallback(
				(_now, metadata) => {
					videoFrameRequestId = null;
					updateTime(metadata);
				},
			);
			return;
		}

		timeUpdateAnimationRef.current = requestAnimationFrame(() => {
			timeUpdateAnimationRef.current = null;
			updateTime();
		});
	};

	function getPresentedTime(metadata?: PresentedFrameMetadata): number {
		const mediaTime = metadata?.mediaTime;
		return Number.isFinite(mediaTime) ? (mediaTime ?? 0) : video.currentTime;
	}

	function updateTime(metadata?: PresentedFrameMetadata) {
		if (!video) return;

		const presentedTime = getPresentedTime(metadata);
		const currentTimeMs = presentedTime * 1000;
		if (maybeJumpAtTimelineSegmentBoundary(currentTimeMs)) {
			scheduleNextUpdate();
			return;
		}

		const activeTrimRegion = findActiveTrimRegion(currentTimeMs);

		// If we're in a trim region during playback, skip to the end of it
		if (activeTrimRegion && !video.paused && !video.ended) {
			skipPastTrimRegion(activeTrimRegion);
		} else {
			// Apply playback speed from active speed region
			activeTimelineSegment = findTimelineSegmentForSourceTime(currentTimeMs);
			const activeSpeedRegion = findActiveSpeedRegion(currentTimeMs);
			enablePitchPreservingPlayback(video);
			video.playbackRate =
				activeTimelineSegment?.speed ?? (activeSpeedRegion ? activeSpeedRegion.speed : 1);
			if (activeTimelineSegment && timelineTimeRef) {
				timelineTimeRef.current = mapSourceMsToOutputMs(
					currentTimeMs,
					activeTimelineSegment,
				);
			}
			emitTime(presentedTime);
		}

		scheduleNextUpdate();
	}

	const handlePlay = () => {
		if (!allowPlaybackRef.current) {
			video.pause();
			return;
		}

		isPlayingRef.current = true;
		onPlayStateChange(true);
		cancelScheduledUpdate();
		scheduleNextUpdate();
	};

	const handlePause = () => {
		isPlayingRef.current = false;
		onPlayStateChange(false);
		cancelScheduledUpdate();
		emitTime(video.currentTime);
	};

	const handleSeeked = () => {
		isSeekingRef.current = false;

		const currentTimeMs = video.currentTime * 1000;
		const activeTrimRegion = findActiveTrimRegion(currentTimeMs);

		// Never leave the preview parked on removed footage after a seek.
		if (activeTrimRegion) {
			skipPastTrimRegion(activeTrimRegion);
		} else {
			activeTimelineSegment = findTimelineSegmentForSourceTime(currentTimeMs, {
				includeEnd: true,
			});
			if (activeTimelineSegment && timelineTimeRef) {
				timelineTimeRef.current = mapSourceMsToOutputMs(
					currentTimeMs,
					activeTimelineSegment,
				);
			}
			emitTime(video.currentTime);
		}
	};

	const handleSeeking = () => {
		isSeekingRef.current = true;
		activeTimelineSegment = findTimelineSegmentForSourceTime(video.currentTime * 1000, {
			includeEnd: true,
		});
		emitTime(video.currentTime);
	};

	return {
		dispose: cancelScheduledUpdate,
		handlePlay,
		handlePause,
		handleSeeked,
		handleSeeking,
	};
}

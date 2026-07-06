import { useTimelineContext } from "dnd-timeline";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import type { AudioPeaksData } from "../../core/timelineTypes";

interface AudioWaveformProps {
	peaks: AudioPeaksData;
	segmentStartMs?: number;
	segmentEndMs?: number;
	displayStartMs?: number;
	displayEndMs?: number;
	gain?: number;
	normalize?: boolean;
	className?: string;
}

// Bar geometry in CSS pixels. Each peak is scattered into the bar covering its
// source time; a bar keeps the max level -> an honest level histogram.
const BAR_WIDTH_CSS = 2;
const BAR_GAP_CSS = 1;
const BAR_PITCH_CSS = BAR_WIDTH_CSS + BAR_GAP_CSS;
// One-sided, anchored to the bottom edge. Tallest bar reaches this fraction of
// the clip height.
const MAX_BAR_HEIGHT_FACTOR = 0.82;

/**
 * Renders the clip's audio as a level-bar histogram (like a bar EQ) drawn on a
 * canvas that fills its parent container.
 *
 * Correctness at every zoom level: instead of drawing one interpolated line for
 * the whole clip (which just stretches like a static backdrop when zoomed), we
 * scatter every decoded peak into the bar whose time-window it falls in. The
 * bar grid is derived from the clip's *measured* pixel width, so when the user
 * zooms in the clip gets wider, more bars fit, and the peaks spread across them
 * — revealing finer real-audio detail. Zooming out aggregates peaks per bar
 * (max-hold), preserving the true loudness envelope.
 */
function AudioWaveformComponent({
	peaks,
	segmentStartMs,
	segmentEndMs,
	displayStartMs,
	displayEndMs,
	gain = 1,
	normalize = false,
	className,
}: AudioWaveformProps) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const { range } = useTimelineContext();
	const [resizeKey, setResizeKey] = useState(0);
	const lastDrawAtRef = useRef(0);

	// Bump resizeKey when the canvas element changes size.
	const observerRef = useRef<ResizeObserver | null>(null);
	const setCanvasRef = useCallback((node: HTMLCanvasElement | null) => {
		if (observerRef.current) {
			observerRef.current.disconnect();
			observerRef.current = null;
		}
		(canvasRef as React.MutableRefObject<HTMLCanvasElement | null>).current = node;
		if (node) {
			const ro = new ResizeObserver(() => setResizeKey((k) => k + 1));
			ro.observe(node);
			observerRef.current = ro;
		}
	}, []);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		void resizeKey;
		let rafId = 0;

		const draw = () => {
			const now = performance.now();
			if (now - lastDrawAtRef.current < 33) {
				rafId = requestAnimationFrame(draw);
				return;
			}
			lastDrawAtRef.current = now;

			const ctx = canvas.getContext("2d");
			if (!ctx) return;

			const rect = canvas.getBoundingClientRect();
			const dpr = window.devicePixelRatio || 1;
			const cssWidth = rect.width;
			const cssHeight = rect.height;
			const width = Math.round(cssWidth * dpr);
			const height = Math.round(cssHeight * dpr);

			if (width === 0 || height === 0) return;

			canvas.width = width;
			canvas.height = height;
			ctx.clearRect(0, 0, width, height);

			const { peaks: peakData, durationMs } = peaks;
			if (durationMs <= 0 || peakData.length === 0) return;

			// Source-audio span this clip actually plays back.
			const segStart = segmentStartMs ?? range.start;
			const segEnd = segmentEndMs ?? range.end;
			const segDurationMs = Math.max(0, segEnd - segStart);
			if (segDurationMs <= 0) return;

			// Guard against speed/trim skew: only the source span matters for
			// which peaks belong to this clip. displayStartMs/displayEndMs are
			// accepted for API compatibility but the bar layout follows the
			// measured canvas width (which already encodes the timeline zoom).
			void displayStartMs;
			void displayEndMs;

			const peakCount = peakData.length;
			const denom = Math.max(1, peakCount - 1);

			// Bar grid (CSS px), capped to the measured canvas width.
			const numBars = Math.max(0, Math.min(Math.floor(cssWidth / BAR_PITCH_CSS), peakCount));
			if (numBars === 0) return;
			const levels = new Float32Array(numBars);

			// Scatter each peak into the bar covering its source time.
			for (let i = 0; i < peakCount; i++) {
				const peakSourceMs = (i / denom) * durationMs;
				if (peakSourceMs < segStart || peakSourceMs > segEnd) continue;

				const frac = (peakSourceMs - segStart) / segDurationMs; // 0..1 across the clip
				const cssX = frac * cssWidth;
				const barIndex = Math.floor(cssX / BAR_PITCH_CSS);
				if (barIndex < 0 || barIndex >= numBars) continue;

				let amp = peakData[i];
				if (normalize) amp = Math.sqrt(Math.max(0, amp));
				amp = Math.max(0, Math.min(1, amp * gain));
				if (amp > levels[barIndex]) levels[barIndex] = amp;
			}

			// Inherit the clip container's text color (white on the saturated
			// fills) and draw bottom-anchored bars.
			const fill = getComputedStyle(canvas).color || "rgba(255, 255, 255, 0.8)";
			ctx.fillStyle = fill;

			const baseY = height;
			const maxBarPx = height * MAX_BAR_HEIGHT_FACTOR;
			const barWidthDevice = Math.max(1, Math.round(BAR_WIDTH_CSS * dpr));

			for (let b = 0; b < numBars; b++) {
				const level = levels[b];
				if (level <= 0) continue;
				const xDevice = Math.round(b * BAR_PITCH_CSS * dpr);
				const barHeight = Math.max(1, level * maxBarPx);
				ctx.fillRect(xDevice, baseY - barHeight, barWidthDevice, barHeight);
			}
		};
		rafId = requestAnimationFrame(draw);
		return () => cancelAnimationFrame(rafId);
	}, [
		displayEndMs,
		displayStartMs,
		gain,
		normalize,
		peaks,
		range.start,
		range.end,
		resizeKey,
		segmentStartMs,
		segmentEndMs,
	]);

	return (
		<canvas
			ref={setCanvasRef}
			className={className ?? "absolute inset-0 w-full h-full pointer-events-none"}
			style={{ display: "block" }}
		/>
	);
}

export default memo(AudioWaveformComponent);

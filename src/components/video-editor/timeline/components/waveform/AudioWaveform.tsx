import { useTimelineContext } from "dnd-timeline";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import type { AudioPeaksData } from "../../core/timelineTypes";
import { resolveWaveformSourceTimeMs } from "./audioWaveformMapping";

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

/**
 * Renders an audio waveform as a canvas that fills its parent container.
 * Automatically syncs with the timeline's visible range so the waveform
 * scrolls and zooms together with the clip items above it.
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
	const { range, valueToPixels } = useTimelineContext();
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
			const width = Math.round(cssWidth * dpr);
			const height = Math.round(rect.height * dpr);

			if (width === 0 || height === 0) return;

			canvas.width = width;
			canvas.height = height;

			ctx.clearRect(0, 0, width, height);

			const { peaks: peakData, durationMs } = peaks;
			if (durationMs <= 0 || peakData.length === 0) return;

			// Use raw values for smooth zooming/panning (no snapping)
			const visibleStartMs = segmentStartMs ?? range.start;
			const visibleEndMs = segmentEndMs ?? range.end;
			const visibleDurationMs = visibleEndMs - visibleStartMs;
			const displayStart = displayStartMs ?? visibleStartMs;
			const displayEnd = displayEndMs ?? visibleEndMs;
			const pixelsPerDisplayMs = valueToPixels(1000) / 1000;

			if (visibleDurationMs <= 0) return;

			// Bottom-anchored one-sided wave: the waveform is symmetric, so we
			// render only the lower half growing up from the bottom edge.
			const baseY = height;
			const maxBarPx = height * 0.6;
			ctx.beginPath();

			for (let px = 0; px < width; px++) {
				const cssX = px / dpr;
				const t = resolveWaveformSourceTimeMs({
					cssX,
					segmentStartMs: visibleStartMs,
					segmentEndMs: visibleEndMs,
					displayStartMs: displayStart,
					displayEndMs: displayEnd,
					pixelsPerDisplayMs,
				});

				// If the timeline time is beyond the actual audio duration, we draw nothing (flat line)
				if (t < 0 || t > durationMs) continue;

				const exactIndex = (t / durationMs) * (peakData.length - 1);
				const leftIndex = Math.floor(exactIndex);
				const rightIndex = Math.min(peakData.length - 1, leftIndex + 1);
				const mix = exactIndex - leftIndex;

				let amplitude = peakData[leftIndex] * (1 - mix) + peakData[rightIndex] * mix;

				if (normalize) amplitude = Math.sqrt(Math.max(0, amplitude));
				amplitude = Math.max(0, Math.min(1, amplitude * gain));

				const barHeight = amplitude * maxBarPx * 0.9;

				ctx.moveTo(px, baseY);
				ctx.lineTo(px, baseY - barHeight);
			}

			// Inherit the clip container's text color so the waveform adapts to
			// the theme/variant (white on saturated fills in light mode, white on
			// deep fills in dark mode).
			const strokeColor = getComputedStyle(canvas).color || "rgba(255, 255, 255, 0.8)";
			ctx.strokeStyle = strokeColor;
			ctx.lineWidth = dpr;
			ctx.stroke();
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
		valueToPixels,
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

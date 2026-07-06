import { useTimelineContext } from "dnd-timeline";
import { memo, useMemo } from "react";
import { cn } from "@/lib/utils";
import type { AudioPeaksData } from "../../core/timelineTypes";

interface AudioWaveformProps {
	peaks: AudioPeaksData;
	segmentStartMs?: number;
	segmentEndMs?: number;
	gain?: number;
	normalize?: boolean;
	className?: string;
}

const MAX_BARS = 500;
const MIN_BARS = 4;
// Roughly how many CSS pixels one bar occupies. Used to derive the bar count
// from the clip's zoom level — bounded so we never render too many DOM nodes.
const BAR_PITCH_CSS = 2;

/**
 * Audio waveform rendered as plain DOM bars — NO canvas.
 *
 * This is intentionally dumb and stable: the bars are flex children of the
 * clip, so they scroll and zoom together with the clip in the SAME React
 * commit. There is no separate draw loop, no ResizeObserver, no rAF — so the
 * waveform can never drift out of sync with the clip block (which was happening
 * with the canvas approach, especially during zoom).
 *
 * Each bar keeps the maximum peak level that falls in its time slice — an
 * honest loudness histogram. The bar count adapts to the clip's rendered width
 * (zoom level), so detail improves as you zoom in.
 */
function AudioWaveformComponent({
	peaks,
	segmentStartMs,
	segmentEndMs,
	gain = 1,
	normalize = false,
	className,
}: AudioWaveformProps) {
	const { range, valueToPixels } = useTimelineContext();

	const segStart = segmentStartMs ?? range.start;
	const segEnd = segmentEndMs ?? range.end;
	const segDurationMs = Math.max(0, segEnd - segStart);

	const numBars = useMemo(() => {
		if (segDurationMs <= 0) return 0;
		const widthCss = valueToPixels(segDurationMs);
		return Math.max(MIN_BARS, Math.min(MAX_BARS, Math.round(widthCss / BAR_PITCH_CSS)));
	}, [segDurationMs, valueToPixels]);

	const bars = useMemo(() => {
		const { peaks: peakData, durationMs } = peaks;
		if (numBars === 0 || durationMs <= 0 || peakData.length === 0 || segDurationMs <= 0) {
			return [] as number[];
		}
		const n = peakData.length;
		const denom = Math.max(1, n - 1);
		const levels = new Array<number>(numBars).fill(0);
		for (let i = 0; i < n; i++) {
			const t = (i / denom) * durationMs;
			if (t < segStart || t > segEnd) continue;
			const frac = (t - segStart) / segDurationMs;
			const idx = Math.min(numBars - 1, Math.floor(frac * numBars));
			let amp = peakData[i];
			if (normalize) amp = Math.sqrt(Math.max(0, amp));
			amp = Math.max(0, Math.min(1, amp * gain));
			if (amp > levels[idx]) levels[idx] = amp;
		}
		return levels;
	}, [peaks, segStart, segEnd, segDurationMs, numBars, gain, normalize]);

	if (bars.length === 0) return null;

	return (
		<div className={cn(className, "flex items-end gap-px")}>
			{bars.map((level, i) => (
				<div
					key={i}
					className="flex-1 rounded-[1px]"
					style={{
						height: `${Math.round(level * 100)}%`,
						minHeight: level > 0 ? 1 : 0,
						backgroundColor: "currentColor",
					}}
				/>
			))}
		</div>
	);
}

export default memo(AudioWaveformComponent);

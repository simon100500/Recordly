import { useTimelineContext } from "dnd-timeline";
import { memo, useMemo } from "react";
import { cn } from "@/lib/utils";
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

const MAX_BARS = 500;
const MIN_BARS = 4;
// Roughly how many CSS pixels one bar occupies. Used to derive the bar count
// from the clip's zoom level — bounded so we never render too many DOM nodes.
const BAR_PITCH_CSS = 2;

/**
 * Audio waveform as plain DOM bars — NO canvas.
 *
 * The bars are flex children of the clip, so they move with it natively (same
 * React commit) — no separate draw loop to drift out of sync.
 *
 * IMPORTANT — zoom/pan correctness: when a clip is wider than the viewport,
 * dnd-timeline pins the clip's content box to the visible window (via padding).
 * So we must render bars only for the portion of the audio that is CURRENTLY
 * VISIBLE (the intersection of the clip with the timeline range, mapped to
 * source time). As the user pans, the visible window changes → the bars update
 * → the waveform scrolls. Rendering the whole segment would look static in that
 * pinned state. Each bar keeps the max peak level in its time slice.
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
	const { range, valueToPixels } = useTimelineContext();

	// Display span = where the clip sits on the timeline; segment span = which
	// part of the source audio it plays back.
	const dispStart = displayStartMs ?? segmentStartMs ?? range.start;
	const dispEnd = displayEndMs ?? segmentEndMs ?? range.end;
	const segStart = segmentStartMs ?? dispStart;
	const segEnd = segmentEndMs ?? dispEnd;
	const dispDur = Math.max(0, dispEnd - dispStart);
	const segDur = Math.max(0, segEnd - segStart);

	// Visible timeline window within this clip.
	const visTLStart = Math.max(dispStart, range.start);
	const visTLEnd = Math.min(dispEnd, range.end);
	const visTLDur = Math.max(0, visTLEnd - visTLStart);

	// Map the visible timeline window to source audio time.
	const toSrc = (tlMs: number) =>
		dispDur > 0 && segDur > 0 ? segStart + ((tlMs - dispStart) / dispDur) * segDur : tlMs;
	const visSrcStart = toSrc(visTLStart);
	const visSrcEnd = toSrc(visTLEnd);
	const visSrcDur = Math.max(0, visSrcEnd - visSrcStart);

	// Bar count follows the VISIBLE width (the pinned content box), not the
	// whole clip — so resolution stays high at every zoom level.
	const numBars = useMemo(() => {
		if (visTLDur <= 0) return 0;
		const widthCss = valueToPixels(visTLDur);
		return Math.max(MIN_BARS, Math.min(MAX_BARS, Math.round(widthCss / BAR_PITCH_CSS)));
	}, [visTLDur, valueToPixels]);

	const bars = useMemo(() => {
		const { peaks: peakData, durationMs } = peaks;
		if (numBars === 0 || durationMs <= 0 || peakData.length === 0 || visSrcDur <= 0) {
			return [] as number[];
		}
		const n = peakData.length;
		const denom = Math.max(1, n - 1);
		const levels = new Array<number>(numBars).fill(0);
		for (let i = 0; i < n; i++) {
			const t = (i / denom) * durationMs;
			if (t < visSrcStart || t > visSrcEnd) continue;
			const frac = (t - visSrcStart) / visSrcDur;
			const idx = Math.min(numBars - 1, Math.floor(frac * numBars));
			let amp = peakData[i];
			if (normalize) amp = Math.sqrt(Math.max(0, amp));
			amp = Math.max(0, Math.min(1, amp * gain));
			if (amp > levels[idx]) levels[idx] = amp;
		}
		return levels;
	}, [peaks, visSrcStart, visSrcEnd, visSrcDur, numBars, gain, normalize]);

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

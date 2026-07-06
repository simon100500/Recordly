import type { Span } from "dnd-timeline";
import { resolveClipSpanChange } from "../clipSpanChange";
import type { ClipRegion } from "../types";
import { getClipSourceEndMs } from "../types";

export interface ClipLiveResizePreview {
	span: Span;
	sourceSpan: Span;
}

export function resolveClipLiveResizePreview(
	clipRegions: ClipRegion[],
	id: string,
	span: Span,
): ClipLiveResizePreview | null {
	const resolved = resolveClipSpanChange({ clipRegions, id, span });
	if (!resolved) return null;

	const sourceStart = resolved.clip.sourceStartMs ?? resolved.clip.startMs;
	return {
		span: { start: resolved.clip.startMs, end: resolved.clip.endMs },
		sourceSpan: { start: sourceStart, end: getClipSourceEndMs(resolved.clip) },
	};
}

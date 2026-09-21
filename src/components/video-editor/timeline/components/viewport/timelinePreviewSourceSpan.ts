import type { TimelineRenderItem } from "../../core/timelineTypes";

export function resolvePreviewSourceSpan(
	item: TimelineRenderItem,
	previewSpan?: { start: number; end: number },
) {
	if (!item.sourceSpan || !previewSpan) return item.sourceSpan ?? item.span;

	const timelineDurationMs = item.span.end - item.span.start;
	const sourceDurationMs = item.sourceSpan.end - item.sourceSpan.start;
	const speed =
		timelineDurationMs > 0 && sourceDurationMs > 0 ? sourceDurationMs / timelineDurationMs : 1;
	const startDeltaMs = previewSpan.start - item.span.start;
	const endDeltaMs = previewSpan.end - item.span.end;
	const isBodyDrag = Math.abs(startDeltaMs - endDeltaMs) < 1 && Math.abs(startDeltaMs) > 0;

	if (isBodyDrag) return item.sourceSpan;

	const start = Math.max(0, Math.round(item.sourceSpan.start + startDeltaMs * speed));
	const end = Math.max(start, Math.round(item.sourceSpan.end + endDeltaMs * speed));
	return { start, end };
}

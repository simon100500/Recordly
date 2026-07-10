import type { CropRegion, FollowMargins, ZoomFocus } from "../types";
import { DEFAULT_FOLLOW_MARGINS } from "../types";

export interface CropPanOffset {
	x: number;
	y: number;
}

export interface CropPanStep {
	/** New smoothed offset to persist for the next frame */
	offset: CropPanOffset;
	/** Offset scaled by zoom strength — apply to the video sprite position */
	fade: CropPanOffset;
	/** Portion of the fade that moves the source crop and must remain in source bounds. */
	sourceCropFade: CropPanOffset;
	/** Canvas-only translation used when projecting cursor and overlay coordinates. */
	cursorViewportOffset: CropPanOffset;
	/** Camera focus (mask-relative). 0.5 on panned axes, safe-zone tracked on free axes */
	focus: ZoomFocus;
	/** Effective crop region (base crop + fade) — use as the overlay viewport sourceCrop */
	effectiveCrop: CropRegion;
}

const FOCUS_SAFE_ZONE_RATIO = 0.25;
/**
 * Keeps the cursor point this far inside the visible zoom band on panned
 * axes so the cursor sprite (and spring lag) never clips off-screen.
 * ~2.5 % of the mask dimension ≈ 48 px at 1920 px.
 */
const CURSOR_EDGE_BUFFER = 0.025;

function getVisibleHalfSpan(zoomScale: number) {
	return 1 / (2 * Math.max(1, zoomScale));
}

/**
 * Zoom-focus computation for a single axis.
 *
 * ``hasRoom = true`` (crop pan active): focus stays centred at 0.5 unless
 * the cursor would actually leave the visible zoom band — then it shifts
 * just enough to keep the cursor on-screen.
 *
 * ``hasRoom = false`` (no pan room): a lazy-camera safe zone lets the
 * cursor roam freely in the centre and only shifts once it approaches the
 * visible edge.
 *
 * ``minMargin`` / ``maxMargin`` let the visible range extend beyond the
 * source bounds, creating empty edge gaps (e.g. for subtitles).
 */
function computeAxisFocus(
	prevFocus: number,
	cursorEff: number,
	hasRoom: boolean,
	zoomScale: number,
	minMarginRatio: number,
	maxMarginRatio: number,
): number {
	const halfSpan = getVisibleHalfSpan(zoomScale);
	if (halfSpan >= 0.5) return 0.5;

	const visibleSpan = halfSpan * 2;
	const minGap = minMarginRatio * visibleSpan;
	const maxGap = maxMarginRatio * visibleSpan;
	const focusLo = halfSpan - minGap;
	const focusHi = 1 - halfSpan + maxGap;

	if (hasRoom) {
		// Trigger slightly before the cursor reaches the visible edge
		// and place it CURSOR_EDGE_BUFFER inside the band.
		const visLo = 0.5 - halfSpan + CURSOR_EDGE_BUFFER;
		const visHi = 0.5 + halfSpan - CURSOR_EDGE_BUFFER;
		if (cursorEff < visLo) {
			return Math.max(focusLo, cursorEff + halfSpan - CURSOR_EDGE_BUFFER);
		}
		if (cursorEff > visHi) {
			return Math.min(focusHi, cursorEff - halfSpan + CURSOR_EDGE_BUFFER);
		}
		return 0.5;
	}

	const safeMargin = halfSpan * (1 - 2 * FOCUS_SAFE_ZONE_RATIO);
	const safeMin = prevFocus - safeMargin;
	const safeMax = prevFocus + safeMargin;

	if (cursorEff < safeMin) {
		return Math.max(focusLo, cursorEff + safeMargin);
	}
	if (cursorEff > safeMax) {
		return Math.min(focusHi, cursorEff - safeMargin);
	}
	return Math.max(focusLo, Math.min(prevFocus, focusHi));
}

/**
 * Crop-panning "follow" camera.
 *
 * Pans the visible crop window so the cursor stays inside an edge safe zone.
 * On axes where the crop has no pan room, a lazy-camera safe zone lets the
 * cursor roam freely in the centre and only shifts the zoom focus once it
 * approaches the visible edge.
 *
 * ``margins`` controls per-edge gap: when the cursor pushes the focus to a
 * clamp limit, the visible range extends beyond the source bounds, creating
 * empty space (e.g. for subtitles).
 */
export function stepCropPanFollow(params: {
	cursor: ZoomFocus;
	crop: CropRegion;
	prevOffset: CropPanOffset;
	prevFocus: ZoomFocus;
	strength: number;
	zoomScale: number;
	/** Horizontal edge safe-zone margin; defaults to 25%. */
	deadZone?: number;
	/** Vertical edge safe-zone margin; defaults to 10%. */
	verticalDeadZone?: number;
	smoothFactor?: number;
	/** Per-edge gap ratios (0–0.15). 0 = no gap. */
	margins?: FollowMargins;
}): CropPanStep | null {
	const {
		cursor,
		crop,
		prevOffset,
		prevFocus,
		strength,
		zoomScale,
		deadZone: horizontalDeadZone = 0.25,
		verticalDeadZone = 0.1,
		smoothFactor = 0.12,
		margins = DEFAULT_FOLLOW_MARGINS,
	} = params;

	if (crop.width <= 0 || crop.height <= 0) return null;

	const effX = crop.x + prevOffset.x;
	const effY = crop.y + prevOffset.y;
	const relX = (cursor.cx - effX) / crop.width;
	const relY = (cursor.cy - effY) / crop.height;
	const hasRoomX = crop.x > 0 || crop.x + crop.width < 1;
	const hasRoomY = crop.y > 0 || crop.y + crop.height < 1;

	let targetOffsetX = prevOffset.x;
	let targetOffsetY = prevOffset.y;
	if (relX < horizontalDeadZone) {
		targetOffsetX -= (horizontalDeadZone - relX) * crop.width;
	} else if (relX > 1 - horizontalDeadZone) {
		targetOffsetX += (relX - (1 - horizontalDeadZone)) * crop.width;
	}
	if (relY < verticalDeadZone) {
		targetOffsetY -= (verticalDeadZone - relY) * crop.height;
	} else if (relY > 1 - verticalDeadZone) {
		targetOffsetY += (relY - (1 - verticalDeadZone)) * crop.height;
	}

	targetOffsetX = Math.max(-crop.x, Math.min(targetOffsetX, 1 - crop.x - crop.width));
	targetOffsetY = Math.max(-crop.y, Math.min(targetOffsetY, 1 - crop.y - crop.height));

	const offsetX = prevOffset.x + (targetOffsetX - prevOffset.x) * smoothFactor;
	const offsetY = prevOffset.y + (targetOffsetY - prevOffset.y) * smoothFactor;

	const fadeX = hasRoomX ? offsetX * strength : 0;
	const fadeY = hasRoomY ? offsetY * strength : 0;

	const cursorEffX = (cursor.cx - crop.x - fadeX) / crop.width;
	const cursorEffY = (cursor.cy - crop.y - fadeY) / crop.height;

	const focusX = computeAxisFocus(
		prevFocus.cx,
		cursorEffX,
		hasRoomX,
		zoomScale,
		margins.left,
		margins.right,
	);
	const focusY = computeAxisFocus(
		prevFocus.cy,
		cursorEffY,
		hasRoomY,
		zoomScale,
		margins.top,
		margins.bottom,
	);

	return {
		offset: { x: offsetX, y: offsetY },
		fade: { x: fadeX, y: fadeY },
		sourceCropFade: { x: fadeX, y: fadeY },
		cursorViewportOffset: { x: 0, y: 0 },
		focus: { cx: focusX, cy: focusY },
		effectiveCrop: {
			x: crop.x + fadeX,
			y: crop.y + fadeY,
			width: crop.width,
			height: crop.height,
		},
	};
}

export const DEFAULT_CROP_PAN_OFFSET: CropPanOffset = { x: 0, y: 0 };
export const DEFAULT_CROP_PAN_FOCUS: ZoomFocus = { cx: 0.5, cy: 0.5 };

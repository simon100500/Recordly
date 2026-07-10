import type { CropRegion, ZoomFocus } from "../types";

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
	/** Camera focus (mask-relative). 0.5 when any crop is active, cursor only on full-frame */
	focus: ZoomFocus;
	/** Effective crop region (base crop + fade) — use as the overlay viewport sourceCrop */
	effectiveCrop: CropRegion;
}

/**
 * Crop-panning "follow" camera.
 *
 * Pans the visible crop window so the cursor stays inside an edge safe zone.
 * On axes where the crop has no pan room, the cursor simply moves freely to
 * the screen edge — the zoom stays centered instead of dragging the canvas.
 * Only when there's no crop at all (full frame) does the zoom follow the
 * cursor directly.
 */
export function stepCropPanFollow(params: {
	cursor: ZoomFocus;
	crop: CropRegion;
	prevOffset: CropPanOffset;
	strength: number;
	/** Horizontal edge safe-zone margin; defaults to 25%. */
	deadZone?: number;
	/** Vertical edge safe-zone margin; defaults to 10%. */
	verticalDeadZone?: number;
	smoothFactor?: number;
}): CropPanStep | null {
	const {
		cursor,
		crop,
		prevOffset,
		strength,
		deadZone: horizontalDeadZone = 0.25,
		verticalDeadZone = 0.1,
		smoothFactor = 0.12,
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

	const isFullFrame = !hasRoomX && !hasRoomY;
	const focusX = isFullFrame ? (cursor.cx - crop.x) / crop.width : 0.5;
	const focusY = isFullFrame ? (cursor.cy - crop.y) / crop.height : 0.5;

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

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
	/** Camera focus (mask-relative). 0.5 on panned axes, cursor on full-frame axes */
	focus: ZoomFocus;
	/** Effective crop region (base crop + fade) — use as the overlay viewport sourceCrop */
	effectiveCrop: CropRegion;
}

/**
 * Crop-panning "follow" camera.
 *
 * Pans the visible crop window so the cursor stays inside an edge safe zone.
 * A full-height crop can translate the canvas vertically at the safe-zone
 * edges without moving the source crop outside its bounds.
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
	const isFullHeightCanvas = crop.y === 0 && crop.height === 1;

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
	if (!isFullHeightCanvas) {
		targetOffsetY = Math.max(-crop.y, Math.min(targetOffsetY, 1 - crop.y - crop.height));
	}

	const offsetX = prevOffset.x + (targetOffsetX - prevOffset.x) * smoothFactor;
	const offsetY = prevOffset.y + (targetOffsetY - prevOffset.y) * smoothFactor;

	const fadeX = hasRoomX ? offsetX * strength : 0;
	const fadeY = hasRoomY || isFullHeightCanvas ? offsetY * strength : 0;
	const sourceCropFadeX = hasRoomX ? fadeX : 0;
	const sourceCropFadeY = hasRoomY ? fadeY : 0;
	const cursorViewportOffsetY = isFullHeightCanvas ? fadeY : 0;

	const focusX = hasRoomX ? 0.5 : (cursor.cx - crop.x) / crop.width;
	const focusY = hasRoomY ? 0.5 : (cursor.cy - crop.y) / crop.height;

	return {
		offset: { x: offsetX, y: offsetY },
		fade: { x: fadeX, y: fadeY },
		sourceCropFade: { x: sourceCropFadeX, y: sourceCropFadeY },
		cursorViewportOffset: { x: 0, y: cursorViewportOffsetY },
		focus: { cx: focusX, cy: focusY },
		effectiveCrop: {
			x: crop.x + sourceCropFadeX,
			y: crop.y + sourceCropFadeY,
			width: crop.width,
			height: crop.height,
		},
	};
}

export const DEFAULT_CROP_PAN_OFFSET: CropPanOffset = { x: 0, y: 0 };

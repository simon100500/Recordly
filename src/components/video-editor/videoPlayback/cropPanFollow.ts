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
	/** Camera focus (mask-relative). 0.5 on panned axes, cursor on full-frame axes */
	focus: ZoomFocus;
	/** Effective crop region (base crop + fade) — use as the overlay viewport sourceCrop */
	effectiveCrop: CropRegion;
}

/**
 * Crop-panning "follow" camera.
 *
 * Pans the visible crop window so the cursor stays inside a central dead zone.
 * On axes where the crop has no room to pan (full-frame), the camera itself
 * follows the cursor instead — so following works on both axes regardless of
 * the crop dimensions.
 */
export function stepCropPanFollow(params: {
	cursor: ZoomFocus;
	crop: CropRegion;
	prevOffset: CropPanOffset;
	strength: number;
	deadZone?: number;
	smoothFactor?: number;
}): CropPanStep | null {
	const { cursor, crop, prevOffset, strength, deadZone = 0.25, smoothFactor = 0.12 } = params;

	if (crop.width <= 0 || crop.height <= 0) return null;

	const effX = crop.x + prevOffset.x;
	const effY = crop.y + prevOffset.y;
	const relX = (cursor.cx - effX) / crop.width;
	const relY = (cursor.cy - effY) / crop.height;

	let targetOffsetX = prevOffset.x;
	let targetOffsetY = prevOffset.y;
	if (relX < deadZone) {
		targetOffsetX -= (deadZone - relX) * crop.width;
	} else if (relX > 1 - deadZone) {
		targetOffsetX += (relX - (1 - deadZone)) * crop.width;
	}
	if (relY < deadZone) {
		targetOffsetY -= (deadZone - relY) * crop.height;
	} else if (relY > 1 - deadZone) {
		targetOffsetY += (relY - (1 - deadZone)) * crop.height;
	}

	targetOffsetX = Math.max(-crop.x, Math.min(targetOffsetX, 1 - crop.x - crop.width));
	targetOffsetY = Math.max(-crop.y, Math.min(targetOffsetY, 1 - crop.y - crop.height));

	const offsetX = prevOffset.x + (targetOffsetX - prevOffset.x) * smoothFactor;
	const offsetY = prevOffset.y + (targetOffsetY - prevOffset.y) * smoothFactor;

	const hasRoomX = crop.x > 0 || crop.x + crop.width < 1;
	const hasRoomY = crop.y > 0 || crop.y + crop.height < 1;

	const fadeX = hasRoomX ? offsetX * strength : 0;
	const fadeY = hasRoomY ? offsetY * strength : 0;

	const focusX = hasRoomX ? 0.5 : (cursor.cx - crop.x) / crop.width;
	const focusY = hasRoomY ? 0.5 : (cursor.cy - crop.y) / crop.height;

	return {
		offset: { x: offsetX, y: offsetY },
		fade: { x: fadeX, y: fadeY },
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

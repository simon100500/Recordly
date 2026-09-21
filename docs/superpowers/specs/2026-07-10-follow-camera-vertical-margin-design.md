# Follow Camera Vertical Margin Design

## Goal

Make cursor-follow zoom keep the cursor within 10% of the top or bottom of the visible area before vertically panning, avoiding the large vertical fields produced by the current 25% threshold.

## Behaviour

- Horizontal cursor follow is unchanged: its safe-zone inset remains 25% of the visible width on each side.
- Vertical cursor follow uses a 10% inset of the visible height at the top and bottom.
- When the cursor exits the relevant safe zone, the focus moves only enough to put it back on that axis's safe-zone boundary. It must not re-center the cursor.
- Existing focus clamping remains in effect, so follow never exposes content outside the allowed crop or stage bounds.

## Design

`cursorFollowCamera.ts` is the single shared calculation used by preview and exporter paths. Its configuration will distinguish horizontal and vertical safe-zone ratios rather than using one value for both axes. The default configuration will retain `0.25` horizontally and use `0.10` vertically. The recenter calculation will use the horizontal ratio for left/right limits and the vertical ratio for top/bottom limits.

The existing horizontal logic remains unchanged. For vertical movement, when the cursor passes the top or bottom safe-zone boundary, calculate the smallest new vertical focus whose corresponding top or bottom boundary is exactly at the cursor. This leaves a 10% visible-height margin on the approached edge instead of placing the cursor in the view's center.

## Validation

- Preserve the current test proving an in-zone horizontal cursor does not move the camera.
- Add a vertical boundary test showing a cursor inside the 10% vertical safe zone keeps focus unchanged.
- Add vertical top and bottom boundary tests showing a cursor outside the zone moves focus by the minimum amount and ends exactly at the 10% boundary.
- Run the focused Vitest file and the project TypeScript check after the change.

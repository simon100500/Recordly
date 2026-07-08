# Handoff: "Follow cursor" zoom mode — crop never exits boundaries

## What was implemented

### New zoom mode `"follow"` (ZoomMode = "auto" | "manual" | "follow")

When a zoom region has `mode: "follow"`, during playback the effective crop (visible area) should dynamically shift so the cursor NEVER exits the crop boundary. When the cursor approaches the edge, the crop window moves to keep the cursor comfortably inside.

### Files changed

| File | Change |
|------|--------|
| `src/components/video-editor/types.ts:8` | Added `"follow"` to `ZoomMode` |
| `src/components/video-editor/SettingsPanel.tsx:3349-3371` | UI button "Follow" in zoom mode selector |
| `src/components/video-editor/timeline/Item.tsx:20` | Updated `zoomMode` prop type to `ZoomMode` |
| `src/components/video-editor/VideoPlayback.tsx` | Core logic — see below |

### VideoPlayback.tsx changes

1. **`maskContainerRef`** (line ~599) — wraps `maskGraphics` in a PIXI Container so the mask can be shifted independently
2. **`cropFollowOffsetRef`** (line ~601) — stores smoothed offset for the crop shift
3. **`cropRegionRef`** (line ~597) — ref synced to `cropRegion` prop for use in rAF loop
4. **PIXI setup** (~line 2337) — `maskGraphics` is added to `maskContainer`, `videoContainer.mask = maskContainer`
5. **rAF loop** (~lines 2503-2590) — when `region.mode === "follow"`, computes crop offset and masks shift

### Current logic (rAF loop, ~line 2503)

```
relX = (cursorPos - (baseCrop.x + prevOffset.x)) / cropWidth
if (relX < 0.25) targetOffsetX -= (0.25 - relX) * cropWidth   // shift LEFT
if (relX > 0.75) targetOffsetX += (relX - 0.75) * cropWidth   // shift RIGHT

// Clamp to video bounds [0, 1]
targetOffsetX = clamp(targetOffsetX, -crop.x, 1 - crop.x - crop.width)

// Smooth
offsetX = prevOffset.x + (targetOffsetX - prevOffset.x) * 0.12

// Clamp focus to effective crop
effMinX = crop.x + offsetX
effMaxX = crop.x + crop.width + offsetX
focus.cx = clamp(focus.cx, effMinX, effMaxX)

// Shift mask
maskContainer.position.x = offsetX * (baseMaskRef.width / crop.width)
```

### The bug

The user reports: "холст улетает за границы" (canvas flies beyond boundaries). Despite multiple iterations, the offset/mask/camera alignment causes the visible area to shift incorrectly.

Likely causes (unconfirmed):
1. **Coordinate conversion mismatch** — `offset` is in video normalized [0,1], mask container is in pre-camera pixels, focus is clamped in [0,1]. These three spaces may not align during zoom (camera.scale affects mask rendering but focus conversion is handled by `computeZoomTransform`)
2. **First-frame jump** — when `prevOffset = {0,0}` (first frame of follow mode) and cursor is far from crop center, the focus gets clamped to the effective crop edge, causing a sudden camera shift that looks like "canvas flies away"
3. **Spring physics interference** — the camera's spring animation smooths focus changes, but the mask container is set directly (not through springs), causing desync between camera and mask during transitions
4. **Sign errors in offset direction** — despite multiple fixes, the direction of crop shift may still be wrong for some edge cases

### Where to investigate next

1. **`computeZoomTransform`** (`src/components/video-editor/videoPlayback/zoomTransform.ts`) — understand how focus [0,1] converts to camera container stage position, especially under zoomScale > 1

2. **Test with no zoom (scale=1)** — if the issue disappears without zoom, the problem is in the focus→camera conversion or mask container scaling

3. **Alternative approach: modify the cropRegion used by `layoutVideoContent`** — instead of shifting the mask container, change the actual `cropRegion` prop (or a render-time equivalent) and trigger `layoutVideoContent` on every frame. This is more expensive but guarantees correct alignment

4. **Alternative approach: camera-only** — instead of shifting the mask, shift the camera container by the offset (add to transform.x/y after `applyZoomTransform`). The mask stays fixed, the camera pans

### Files to read for context

- `src/components/video-editor/VideoPlayback.tsx` — rAF loop (~line 2500-2600), PIXI setup (~line 2330-2345), refs (~line 597-601)
- `src/components/video-editor/videoPlayback/focusUtils.ts` — `clampFocusToScale`, `getFocusBoundsForScale`
- `src/components/video-editor/videoPlayback/cursorFollowCamera.ts` — `computeCursorFollowFocus`
- `src/components/video-editor/videoPlayback/zoomTransform.ts` — `computeZoomTransform`, `applyZoomTransform`
- `src/components/video-editor/videoPlayback/layoutUtils.ts` — mask/sprite position computation

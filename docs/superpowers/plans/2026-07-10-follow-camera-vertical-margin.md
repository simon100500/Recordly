# Follow Camera Vertical Margin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the cursor-follow camera 10% from the top or bottom of the visible area when it must pan vertically, without changing horizontal follow behavior.

**Architecture:** Update the shared `cursorFollowCamera.ts` calculation, which is used by playback and all exporter paths. Keep the existing horizontal re-centering calculation unchanged; add a distinct vertical margin and calculate only the focus delta required to place the cursor on the corresponding vertical safe-zone edge.

**Tech Stack:** TypeScript, Vitest, React/Electron rendering pipeline.

---

### Task 1: Specify the vertical-edge behavior with failing tests

**Files:**
- Modify: `src/components/video-editor/videoPlayback/cursorFollowCamera.test.ts`
- Test: `src/components/video-editor/videoPlayback/cursorFollowCamera.test.ts`

- [ ] **Step 1: Add the two failing vertical boundary tests**

Add these tests inside the existing `describe("computeCursorFollowFocus", ...)` block:

```ts
it("keeps the cursor 10% from the bottom when it leaves the vertical safe zone", () => {
	const state = createCursorFollowCameraState();
	const cursorSamples = [
		{ timeMs: 0, cx: 0.5, cy: 0.5, interactionType: "move" as const },
		{ timeMs: 100, cx: 0.5, cy: 0.71, interactionType: "move" as const },
	];

	computeCursorFollowFocus(state, cursorSamples, 0, 2, 1, { cx: 0.5, cy: 0.5 });
	const shiftedFocus = computeCursorFollowFocus(
		state,
		cursorSamples,
		100,
		2,
		1,
		{ cx: 0.5, cy: 0.5 },
	);

	expect(shiftedFocus.cx).toBeCloseTo(0.5, 6);
	expect(shiftedFocus.cy).toBeCloseTo(0.51, 6);
});

it("keeps the cursor 10% from the top when it leaves the vertical safe zone", () => {
	const state = createCursorFollowCameraState();
	const cursorSamples = [
		{ timeMs: 0, cx: 0.5, cy: 0.5, interactionType: "move" as const },
		{ timeMs: 100, cx: 0.5, cy: 0.29, interactionType: "move" as const },
	];

	computeCursorFollowFocus(state, cursorSamples, 0, 2, 1, { cx: 0.5, cy: 0.5 });
	const shiftedFocus = computeCursorFollowFocus(
		state,
		cursorSamples,
		100,
		2,
		1,
		{ cx: 0.5, cy: 0.5 },
	);

	expect(shiftedFocus.cx).toBeCloseTo(0.5, 6);
	expect(shiftedFocus.cy).toBeCloseTo(0.49, 6);
});
```

- [ ] **Step 2: Verify the tests fail for the current center-repositioning behavior**

Run: `npm test -- src/components/video-editor/videoPlayback/cursorFollowCamera.test.ts`

Expected: FAIL. The new assertions expect `cy` values `0.51` and `0.49`; current code returns the cursor values (`0.71` and `0.29`).

- [ ] **Step 3: Commit the failing test**

```bash
git add src/components/video-editor/videoPlayback/cursorFollowCamera.test.ts
git commit -m "test: cover follow camera vertical edge margins"
```

### Task 2: Apply a 10% vertical margin with minimal pan

**Files:**
- Modify: `src/components/video-editor/videoPlayback/cursorFollowCamera.ts:12-46, 85-123, 190-199`
- Test: `src/components/video-editor/videoPlayback/cursorFollowCamera.test.ts`

- [ ] **Step 1: Add a vertical default ratio and configuration fallback**

Keep `snapToEdgesRatio` as the horizontal ratio so existing preview/exporter call sites remain unchanged. Add a vertical constant and optional override:

```ts
export const SNAP_TO_EDGES_RATIO_VERTICAL = 0.1;

export interface CursorFollowConfig {
	/** Horizontal safe-zone inset ratio. */
	snapToEdgesRatio: number;
	/** Vertical safe-zone inset ratio; defaults to 10%. */
	verticalSnapToEdgesRatio?: number;
}

export const DEFAULT_CURSOR_FOLLOW_CONFIG: CursorFollowConfig = {
	snapToEdgesRatio: SNAP_TO_EDGES_RATIO_AUTO,
	verticalSnapToEdgesRatio: SNAP_TO_EDGES_RATIO_VERTICAL,
};
```

- [ ] **Step 2: Use axis-specific insets and minimal vertical focus shifts**

Change `recenterFocusWhenCursorLeavesSafeZone` to accept both ratios, compute independent `safeZoneInsetX` and `safeZoneInsetY`, and keep the existing left/right assignments. Replace vertical assignments with:

```ts
if (cursorFocus.cy < safeTop) {
	nextFocusY = cursorFocus.cy + halfSpan - safeZoneInsetY;
} else if (cursorFocus.cy > safeBottom) {
	nextFocusY = cursorFocus.cy - halfSpan + safeZoneInsetY;
}
```

Call it with:

```ts
config.snapToEdgesRatio,
config.verticalSnapToEdgesRatio ?? SNAP_TO_EDGES_RATIO_VERTICAL,
cropRegion,
```

Retain the existing final `clampFocusToScale` call so stage and crop boundaries remain enforced.

- [ ] **Step 3: Verify the focused test file passes**

Run: `npm test -- src/components/video-editor/videoPlayback/cursorFollowCamera.test.ts`

Expected: PASS. The existing horizontal tests pass unchanged and both new vertical edge tests pass.

- [ ] **Step 4: Run type checking and the full test suite**

Run: `npx tsc --noEmit; npm test`

Expected: both commands exit with code `0`.

- [ ] **Step 5: Commit the implementation**

```bash
git add src/components/video-editor/videoPlayback/cursorFollowCamera.ts src/components/video-editor/videoPlayback/cursorFollowCamera.test.ts
git commit -m "fix: keep follow cursor near vertical edges"
```

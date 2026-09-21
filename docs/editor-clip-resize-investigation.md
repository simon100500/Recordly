# Editor Clip Resize Investigation

Audience: an internal engineer continuing the clip-editor refactor.

Post-read action: fix and verify left-edge clip resize behavior without reintroducing the old "hidden trims in one continuous source" model.

## Context

The editor is being moved to a modern clip model:

- each visible segment is an independent clip segment;
- stretching a clip edge reveals source media in the direction of the drag;
- trimming a clip edge removes source media from the dragged side;
- expanding a clip must preserve a gapless timeline by ripple-shifting later clips to the right;
- waveform drawing must behave like a source-backed underlay, not like a stretched bitmap.

The current implementation already has pieces of this model: clip regions carry their own timeline span and source start, playback maps through clip segments, and the timeline range no longer needs to stretch to the full recording after duration changes.

Two known defects remain around left-edge resizing.

## Known Defect 1: Left Edge Expansion Does Not Ripple

Scenario:

```text
[================][drag left edge left ==================][================]
```

Observed behavior:

- dragging the second clip's left edge left can visually result in no effective change;
- following clips are not shifted right when the active clip grows.

Expected behavior:

- the active clip grows by the amount revealed on the left;
- its right edge moves right by that growth amount;
- every following clip shifts right by the same amount;
- following clips keep their original source ranges.

Root cause:

- the clip span resolver treats any left-edge resize as "attach the left side to the previous clip";
- when expanding left, it snaps `newStart` to the previous clip end and leaves `newEnd` unchanged;
- if the active clip was already adjacent to the previous clip, this cancels the requested expansion.

Where to fix:

- the clip span-change resolver, not the playback mapper;
- the logic should distinguish left-edge trim from left-edge expansion:
  - left trim: keep timeline attached at the previous boundary, reduce active duration, shift following clips left;
  - left expansion: keep active clip attached to the previous boundary, extend active right edge by the revealed duration, shift following clips right.

Suggested invariant test:

```text
left:  0-4000 source 0
clip:  4000-7000 source 4000
right: 7000-9000 source 7000

drag clip left edge to 3000

expected:
left:  0-4000 source 0
clip:  4000-8000 source 3000
right: 8000-10000 source 7000
```

The active clip remains gapless after the previous clip, but its sourceStart moves left and its timeline duration grows.

## Known Defect 2: Left Edge Trim Waveform Preview Anchors Wrong

Scenario:

```text
[===========][--->==================][=============]
```

The user drags the left boundary of the middle clip to the right.

Observed behavior:

- waveform appears anchored on the left;
- it visually runs left and shortens on the right.

Expected behavior:

- the opposite edge must be visually anchored;
- for a left-edge trim, the right edge is the anchor;
- the waveform should drop the left part of the source and keep the right side visually stable.

Root cause:

- live resize preview receives raw DnD geometry;
- the raw resize span is not the same as the resolved gapless clip span used after commit;
- waveform source-span preview therefore samples against the wrong display span/anchor.

Where to fix:

- publish live resize preview through the same clip semantics as final clip resize;
- do not use raw DnD resize span directly for clip waveform preview when left-edge trimming;
- derive both:
  - preview timeline span;
  - preview source span;
  from the resolved clip span-change result.

Suggested invariant test:

```text
clip item span:   4000-7000
clip source span: 4000-7000
preview raw drag: 4500-7000

expected waveform preview:
display span: 4000-6500
source span:  4500-7000
```

This keeps the right edge anchored while removing the left source portion.

## Current Modules To Inspect

- Clip span-change resolver: decides final clip span, sourceStart, removed segments, and ripple delta.
- Timeline wrapper: receives DnD drag/resize events and publishes live preview spans.
- Timeline canvas: renders clip rows and source-audio rows using preview spans and waveform source spans.
- Waveform mapping: maps canvas x-position from display span to source span.
- Playback event handlers: map playback through clip source segments; likely not the source of these two defects.

## Fix Order

1. Add failing tests for left-edge expansion ripple in the clip span-change resolver.
2. Fix left-edge expansion so it increases active duration and ripple-pushes subsequent clips right.
3. Add a failing test for left-edge trim preview math.
4. Route clip resize preview through resolved clip semantics instead of raw DnD geometry.
5. Run focused tests for clip span-change, timeline wrapper/canvas preview, waveform mapping, playback mapping, and timeline range.
6. Run TypeScript and full test suite.
7. Manually verify with a real recording if the Electron UI is available:
   - left edge drag left grows the active clip and shifts later clips right;
   - left edge drag right keeps the right visual edge anchored and trims source from the left;
   - right edge drag right still grows to the right and pushes later clips right;
   - waveform remains source-backed, not stretched.

## Do Not Regress

- Do not return to continuous-source hidden-trim semantics.
- Do not change following clips' sourceStart when ripple-shifting them.
- Do not let playback choose the wrong duplicate source segment when source ranges overlap.
- Do not make zoom reset to full width when timeline duration changes.
- Do not treat passing pure unit tests as proof of the visual waveform behavior; runtime/editor verification is still required when available.

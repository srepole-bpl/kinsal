# Phase 7: Polish + security

## Status: ✅ Complete

## Overview

Harden CORS to approved origins only, fix Pixiset iframe sizing via `postMessage`, improve loading/offline UX, and responsive polish for category badges on mobile.

## Prerequisites

- Core features stable (Phases 1–5 minimum)
- Pixiset embed URL known (add to CORS allowlist)

## Planned Changes

- [x] Update `supabase/functions/_shared/cors.ts`: allowlist `https://srepole-bpl.github.io` (+ localhost)
- [x] Reject requests with foreign `Origin` header on browser-facing edge functions (403)
- [x] Add iframe resize: `postMessage({ type: 'kinsal-resize', height })` on DOM/resize/load
- [x] Document Pixiset parent snippet (below)
- [x] Global loading spinner on async edge actions (book, cancel, save settings)
- [x] Offline / fetch failure banner when Supabase unreachable
- [x] Mobile CSS: day tabs + tab bar scroll, booking rows stack, touch targets ≥44px
- [ ] Optional: category badge colors per resource type (skipped — existing badges sufficient)

## Target Implementation Shape

**cors.ts**

```typescript
const ALLOWED_ORIGINS = [
  "https://srepole-bpl.github.io",
  "https://YOUR.pixiset.com", // fill when known
];
export function corsHeaders(req: Request) {
  const origin = req.headers.get("Origin") ?? "";
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return { "Access-Control-Allow-Origin": allow, ... };
}
```

**iframe resize (index.html)**

```javascript
function notifyParentHeight() {
  const h = document.documentElement.scrollHeight;
  window.parent.postMessage({ type: 'kinsal-resize', height: h }, '*');
  // tighten targetOrigin when Pixiset parent origin known
}
new ResizeObserver(notifyParentHeight).observe(document.body);
```

## Files Touched

- `supabase/functions/_shared/cors.ts`
- All edge function entrypoints (ensure shared cors used)
- `index.html` (CSS + postMessage + loading states)

## Verification Checklist

- [x] curl with foreign Origin → `403 forbidden origin`, Allow-Origin not echoed
- [x] curl with `https://srepole-bpl.github.io` Origin → passes, Allow-Origin reflected
- [ ] Book flow works from GitHub Pages embed (manual, after push)
- [ ] Book flow works from Pixiset iframe (manual, after push)
- [ ] Iframe height adjusts without double scrollbars in Pixiset preview (manual)
- [ ] 375px viewport: day tabs usable, reserve buttons tappable (manual)
- [x] Blocked request shows offline banner, no silent failure (edgeCall returns status 0 + banner)

## Implementation Notes

- **CORS insight:** fetches run from the GitHub Pages iframe's own origin, so the
  allowlist only needs `https://srepole-bpl.github.io` (+ localhost). The Pixiset
  parent origin is irrelevant to CORS — it only matters for `postMessage` targeting.
- `_shared/cors.ts` now exposes `isAllowedOrigin`, origin-aware `json(body,status,origin)`
  / `preflight(origin)`, and `rejectForeignOrigin(req)` (403 when Origin present + not allowed).
- Browser-facing functions (`admin-action`, `manage-booking`, `verify-pin`) call
  `rejectForeignOrigin` and pass the request Origin to `preflight`. Cron functions
  (`send-reminders`, `release-noshows`) are secret-gated and send no Origin, so they
  pass through unchanged.
- `index.html`: global busy spinner driven by `edgeCall`, offline banner via fetch
  failure + `online`/`offline` events, restored the previously missing `.spinner` style,
  mobile media queries (≤480px scroll tabs / stacked rows) and `pointer:coarse` touch targets.
- `edgeCall` now returns `{status:0,data:{success:false,error:'offline…'}}` on network
  failure instead of throwing, so every caller degrades gracefully.

### Pixiset parent snippet (optional, to remove nested scrollbar)

```html
<script>
window.addEventListener('message', function (e) {
  if (e.data && e.data.type === 'kinsal-resize') {
    var f = document.querySelector('iframe[src*="srepole-bpl.github.io"]');
    if (f) f.style.height = e.data.height + 'px';
  }
});
</script>
```

## Navigation

← [06-communications.md](./06-communications.md) · ↑ [00-index.md](./00-index.md)

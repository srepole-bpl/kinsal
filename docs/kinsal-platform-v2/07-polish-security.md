# Phase 7: Polish + security

## Status: Pending

## Overview

Harden CORS to approved origins only, fix Pixiset iframe sizing via `postMessage`, improve loading/offline UX, and responsive polish for category badges on mobile.

## Prerequisites

- Core features stable (Phases 1–5 minimum)
- Pixiset embed URL known (add to CORS allowlist)

## Planned Changes

- [ ] Update `supabase/functions/_shared/cors.ts`: allow `https://srepole-bpl.github.io` + Pixiset origin(s)
- [ ] Reject requests with unknown `Origin` header on all edge functions
- [ ] Add iframe resize: `postMessage({ type: 'kinsal-resize', height })` to parent on content/DOM changes
- [ ] Document Pixiset parent snippet if custom listener needed
- [ ] Global loading state on async actions (book, cancel, save settings)
- [ ] Offline / fetch failure banner when Supabase unreachable
- [ ] Mobile CSS: day tabs scroll, resource rows stack, touch-friendly buttons (min 44px)
- [ ] Optional: category badge colors per resource type

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

- [ ] curl with foreign Origin → CORS header not set to foreign origin (or 403)
- [ ] Book flow works from GitHub Pages embed
- [ ] Book flow works from Pixiset iframe
- [ ] Iframe height adjusts without double scrollbars in Pixiset preview
- [ ] 375px viewport: day tabs usable, reserve buttons tappable
- [ ] Airplane mode / blocked request shows offline banner, no silent failure

## Implementation Notes

<!-- Filled during implementation -->

## Navigation

← [06-communications.md](./06-communications.md) · ↑ [00-index.md](./00-index.md)

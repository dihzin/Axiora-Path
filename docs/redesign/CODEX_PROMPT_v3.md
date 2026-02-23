# 🤖 Codex Prompt — Learning Trail v3 Fixes

Paste this into Codex after uploading the 5 component files.

---

## Context

I have a Next.js 15 + TypeScript + Tailwind CSS + shadcn/ui app.
I'm building a Duolingo-style learning trail screen.
The component files are attached. Apply ALL fixes below exactly as described.

---

## Fix 1 — 3D pedestal on LOCKED nodes (LessonNode.tsx)

The `locked` node config currently has no visible base layer.
Make sure `config.locked.base` is `'bg-[#A0A0A0]'` and the pedestal
`<span>` with `translateY(5px)` is rendered for ALL node types, including locked.
The face should be `'bg-[#CECECE]'`.

## Fix 2 — Pulse ring uses pure CSS, not Tailwind animate-ping (LessonNode.tsx)

Replace any `animate-ping` Tailwind class with an inline `style` animation
using the `pulseRing` keyframe defined in the `<style>` tag inside the component.
This avoids Tailwind purging the class in production.

```css
@keyframes pulseRing {
  0%   { transform: scale(1);   opacity: 0.5; }
  100% { transform: scale(1.7); opacity: 0;   }
}
```

Apply it as:
```tsx
style={{ animation: 'pulseRing 1.4s ease-out infinite' }}
```

## Fix 3 — SVG trail never clips (TrailPath.tsx)

On the `<svg>` element set:
```tsx
style={{ height: totalH, overflow: 'visible' }}
```
And increase `PAD_TOP` to `80` so the first node always clears the banner.

## Fix 4 — UnitBanner z-index (UnitBanner.tsx)

Set `zIndex: 10` on the banner wrapper so trail nodes (z-index default = auto)
are never hidden behind the banner card.
The `TopStatsBar` should remain at `z-30`.

## Fix 5 — BottomNav inactive icons (BottomNav.tsx)

Remove `grayscale` Tailwind class from inactive icons.
Instead apply via inline style:
```tsx
style={active ? {} : { filter: 'saturate(0.3)', opacity: 0.65 }}
```
This matches Duolingo: inactive icons keep their hue but are desaturated + dimmed,
NOT fully greyscale.

---

## File map

| File | Location | C:\DEV\Axiora Path\docs\redesign
|---|---|
| LessonNode.tsx | apps/web/components/trail/LessonNode.tsx |
| TrailPath.tsx  | apps/web/components/trail/TrailPath.tsx  |
| UnitBanner.tsx | apps/web/components/trail/UnitBanner.tsx |
| BottomNav.tsx  | apps/web/components/trail/BottomNav.tsx  |
| TopStatsBar.tsx| apps/web/components/trail/TopStatsBar.tsx|
| TrailScreen.tsx| apps/web/components/trail/TrailScreen.tsx|

## After applying

Run:
```bash
rm -rf apps/web/.next && npm run dev --workspace=apps/web
```

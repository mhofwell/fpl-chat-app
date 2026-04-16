# ChatFPL UI Polish — Design Spec

**Date:** 2026-04-16
**Scope:** Full UI sweep (auth + landing + chat + nav) — tighten + elevate
**Theme:** Existing EPL purple + green tokens, Inter + Outfit fonts — no changes

## 1. Brand unification

Canonical product name: **ChatFPL** (one word, camelCase).

Update in all locations:
- Nav bar link text (`layout.tsx`)
- Landing page hero title (`page.tsx`)
- HTML `<title>` / metadata (`layout.tsx` metadata export)
- Chat page empty state title if it references the product name

## 2. Auth pages (sign-in, sign-up, forgot-password)

### Layout fix

Replace `(auth-pages)/layout.tsx` to center children both vertically and horizontally:
```
flex items-center justify-center min-h-[calc(100vh-4rem)]
```
The `4rem` accounts for the fixed nav bar height (h-16). This replaces the current `items-start` which causes the form to drift left.

### Card container

Wrap each auth form in a visual card:
- `bg-card` background with `border border-border` and `shadow-lg`
- `rounded-xl` corners, `p-8` padding
- `w-full max-w-sm` width constraint
- Consistent across sign-in, sign-up, and forgot-password

### Sign-up: remove SmtpMessage

- Delete the `<SmtpMessage />` render from `sign-up/page.tsx`
- Replace with a muted note below the submit button:
  `"Check your email to confirm your account"`
- Styled as `text-xs text-muted-foreground text-center mt-4`

### Typography hierarchy

Within each card:
- `h1`: `text-2xl font-bold` (currently `font-medium` — bump to `font-bold`)
- Subtitle (e.g. "Already have an account?"): `text-sm text-muted-foreground`
- Labels: `text-sm font-medium` (already correct)
- Inputs: existing styles are fine

### Sign-in page

- Add `max-w-sm mx-auto` to the form (currently unconstrained via `flex-1 min-w-64`)
- Wrap in the same card container
- No other structural changes

### Forgot-password page

- Same card treatment as sign-in/sign-up
- Review and align to the same layout pattern

## 3. Landing page

### Hero section

- Larger title: `text-5xl sm:text-6xl font-bold font-header`
- Title text: "ChatFPL"
- Subtitle: existing copy is good, keep it
- FPL assistant logo: larger (`h-20 w-20`), with a glow ring treatment:
  `ring-4 ring-primary/30 shadow-[0_0_30px_rgba(56,0,60,0.3)]`
  (dark mode: `shadow-[0_0_30px_rgba(0,255,135,0.15)]`)
- CTA buttons: keep existing layout (primary + outline)

### Feature preview

Below the hero, add a section showing 3-4 sample question cards:
- Reuse the `SAMPLE_QUESTIONS` array (import or duplicate from `/protected`)
- Each question displayed in a card/chip:
  `bg-card border border-border rounded-lg px-4 py-3 text-sm text-muted-foreground`
- Grid layout: `grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl mx-auto`
- Section introduced with a muted label like "Ask about..." or no label — just the cards
- Cards are non-interactive (no click handlers, no links)
- Adds visual weight and communicates the product's capability before sign-in

## 4. Nav bar

- Update link text from "Chat FPL" to "ChatFPL"
- No structural changes to the nav layout

## 5. Chat page (`/protected`)

- No pre-planned structural changes
- During implementation, visually assess the composing view and conversation view
- Fix any spacing, typography, or color inconsistencies found during the dev pass
- If the empty state title references the product name, update to "ChatFPL"

## 6. Root layout

### Main element fix

Current `<main>` has:
```
className="flex flex-col overflow-hidden pt-16 h-screen [&>*]:h-full"
```

The `[&>*]:h-full` forces all direct children to fill viewport height, which fights auth pages that want to be content-sized within a centered container. Options:
- Keep `[&>*]:h-full` since the chat page (`/protected`) needs it for the full-viewport layout
- Auth pages layout overrides with its own height behavior via the centered flex container

The auth layout's `min-h-[calc(100vh-4rem)]` will override correctly inside a flex column with `h-full`, so no change needed to root layout.

## 7. Metadata

```ts
export const metadata = {
    title: 'ChatFPL',
    description: 'AI-powered Fantasy Premier League assistant — transfers, captaincy, fixtures, covered.',
};
```

## Out of scope

- Supabase Auth Site URL redirect fix (separate config task in Supabase dashboard)
- New animations/motion beyond Tailwind defaults
- Mobile-specific responsive audit (sensible defaults via existing breakpoints)
- `smtp-message.tsx` file deletion (can stay as dead code or be cleaned up separately)

# ChatFPL UI Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Full UI sweep — fix broken auth layouts, unify brand to "ChatFPL", elevate landing page with hero + feature preview, ensure visual consistency across all screens.

**Architecture:** Pure frontend changes to Next.js app. No backend changes. All modifications use existing EPL purple/green CSS custom properties and Tailwind theme tokens. No new dependencies.

**Tech Stack:** Next.js 16, React 19, Tailwind CSS, Framer Motion (already installed), shadcn/ui components

**Testing:** Frontend has no test suite (portfolio trade-off per CLAUDE.md). Each task is verified visually via `bun run dev` at `http://localhost:3000`. Run `bun run build` after all tasks to confirm no type errors.

**Design spec:** `docs/specs/2026-04-16-ui-polish-design.md`

---

### Task 1: Brand unification — metadata + nav

**Files:**
- Modify: `apps/web/app/layout.tsx`

- [ ] **Step 1: Update metadata**

In `apps/web/app/layout.tsx`, change the metadata export:

```tsx
export const metadata = {
    metadataBase: new URL(defaultUrl),
    title: 'ChatFPL',
    description:
        'AI-powered Fantasy Premier League assistant — transfers, captaincy, fixtures, covered.',
};
```

- [ ] **Step 2: Update nav bar brand text**

In the same file, find the nav link text and change "Chat FPL" to "ChatFPL":

```tsx
<Link
    href="/"
    className="text-xl font-bold font-header hover:text-muted-foreground transition-colors"
>
    ChatFPL
</Link>
```

- [ ] **Step 3: Verify in browser**

Run: `cd apps/web && bun run dev`

Check:
- Browser tab title shows "ChatFPL"
- Nav bar shows "ChatFPL" (one word)
- Both light and dark mode render correctly

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/layout.tsx
git commit -m "feat(web): unify brand to ChatFPL in metadata and nav"
```

---

### Task 2: Fix auth pages layout — centered card container

**Files:**
- Modify: `apps/web/app/(auth-pages)/layout.tsx`

- [ ] **Step 1: Replace auth layout with centered container**

Replace the entire content of `apps/web/app/(auth-pages)/layout.tsx`:

```tsx
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-4rem)] px-4">
      <div className="w-full max-w-sm bg-card border border-border shadow-lg rounded-xl p-8">
        {children}
      </div>
    </div>
  );
}
```

This:
- Centers children vertically and horizontally (fixes the drift-left bug)
- Wraps in a card with `bg-card`, border, shadow, rounded corners
- `min-h-[calc(100vh-4rem)]` accounts for the 64px fixed nav
- `max-w-sm` constrains width consistently across all auth pages

- [ ] **Step 2: Verify in browser**

Navigate to `http://localhost:3000/sign-in`, `/sign-up`, and `/forgot-password`.

Check:
- Form is centered both vertically and horizontally
- Card has visible border and shadow
- Works in both light and dark mode
- Content doesn't overflow the card on mobile widths (resize to 375px)

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/\(auth-pages\)/layout.tsx
git commit -m "fix(web): center auth pages in card container"
```

---

### Task 3: Polish sign-up page

**Files:**
- Modify: `apps/web/app/(auth-pages)/sign-up/page.tsx`

- [ ] **Step 1: Remove SmtpMessage, add confirmation note, fix typography**

Replace the entire content of `apps/web/app/(auth-pages)/sign-up/page.tsx`:

```tsx
import { signUpAction } from "@/app/actions";
import { FormMessage, FormMessage as FormMessageType } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";

export default async function Signup(props: {
  searchParams: Promise<FormMessageType>;
}) {
  const searchParams = await props.searchParams;
  if ("message" in searchParams) {
    return (
      <div className="flex items-center justify-center gap-2 py-4">
        <FormMessage message={searchParams} />
      </div>
    );
  }

  return (
    <form className="flex flex-col">
      <h1 className="text-2xl font-bold">Sign up</h1>
      <p className="text-sm text-muted-foreground mt-1">
        Already have an account?{" "}
        <Link className="text-primary font-medium underline" href="/sign-in">
          Sign in
        </Link>
      </p>
      <div className="flex flex-col gap-2 [&>input]:mb-3 mt-8">
        <Label htmlFor="email">Email</Label>
        <Input name="email" placeholder="you@example.com" required />
        <Label htmlFor="password">Password</Label>
        <Input
          type="password"
          name="password"
          placeholder="Your password"
          minLength={6}
          required
        />
        <SubmitButton formAction={signUpAction} pendingText="Signing up...">
          Sign up
        </SubmitButton>
        <FormMessage message={searchParams} />
      </div>
      <p className="text-xs text-muted-foreground text-center mt-4">
        Check your email to confirm your account
      </p>
    </form>
  );
}
```

Changes from original:
- Removed `<SmtpMessage />` import and render
- Removed `mx-auto`, `min-w-64`, `max-w-64` from form (card container handles width)
- Changed `font-medium` → `font-bold` on h1
- Changed subtitle to `text-muted-foreground` for consistent hierarchy
- Removed wrapping `<>...</>` fragment (no SmtpMessage sibling)
- Simplified the message-only branch (removed `h-screen`, `sm:max-w-md`)
- Added email confirmation note at bottom

- [ ] **Step 2: Verify in browser**

Navigate to `http://localhost:3000/sign-up`.

Check:
- No "Note: Emails are rate limited" message
- "Check your email to confirm your account" appears below submit button
- Form fills the card naturally
- Title "Sign up" is bold
- Light and dark mode both look correct

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/\(auth-pages\)/sign-up/page.tsx
git commit -m "feat(web): polish sign-up page, replace SMTP note with user-facing message"
```

---

### Task 4: Polish sign-in page

**Files:**
- Modify: `apps/web/app/(auth-pages)/sign-in/page.tsx`

- [ ] **Step 1: Fix form sizing and typography**

Replace the entire content of `apps/web/app/(auth-pages)/sign-in/page.tsx`:

```tsx
import { signInAction } from "@/app/actions";
import { FormMessage, FormMessage as FormMessageType } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";

export default async function Login(props: { searchParams: Promise<FormMessageType> }) {
  const searchParams = await props.searchParams;
  return (
    <form className="flex flex-col">
      <h1 className="text-2xl font-bold">Sign in</h1>
      <p className="text-sm text-muted-foreground mt-1">
        Don't have an account?{" "}
        <Link className="text-primary font-medium underline" href="/sign-up">
          Sign up
        </Link>
      </p>
      <div className="flex flex-col gap-2 [&>input]:mb-3 mt-8">
        <Label htmlFor="email">Email</Label>
        <Input name="email" placeholder="you@example.com" required />
        <div className="flex justify-between items-center">
          <Label htmlFor="password">Password</Label>
          <Link
            className="text-xs text-muted-foreground underline"
            href="/forgot-password"
          >
            Forgot Password?
          </Link>
        </div>
        <Input
          type="password"
          name="password"
          placeholder="Your password"
          required
        />
        <SubmitButton pendingText="Signing In..." formAction={signInAction}>
          Sign in
        </SubmitButton>
        <FormMessage message={searchParams} />
      </div>
    </form>
  );
}
```

Changes from original:
- Removed `flex-1`, `min-w-64` (card container handles sizing)
- Changed `font-medium` → `font-bold` on h1
- Changed subtitle to `text-muted-foreground`
- Changed "Forgot Password?" link to `text-muted-foreground` (was `text-foreground`)
- Changed "Sign up" link to `text-primary` (was `text-foreground`)

- [ ] **Step 2: Verify in browser**

Navigate to `http://localhost:3000/sign-in`.

Check:
- Form fills card naturally, no horizontal overflow
- Title is bold
- "Forgot Password?" link is visible but deemphasized
- Light and dark mode both correct

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/\(auth-pages\)/sign-in/page.tsx
git commit -m "feat(web): polish sign-in page typography and layout"
```

---

### Task 5: Polish forgot-password page

**Files:**
- Modify: `apps/web/app/(auth-pages)/forgot-password/page.tsx`

- [ ] **Step 1: Remove SmtpMessage, fix typography**

Replace the entire content of `apps/web/app/(auth-pages)/forgot-password/page.tsx`:

```tsx
import { forgotPasswordAction } from "@/app/actions";
import { FormMessage, FormMessage as FormMessageType } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";

export default async function ForgotPassword(props: {
  searchParams: Promise<FormMessageType>;
}) {
  const searchParams = await props.searchParams;
  return (
    <form className="flex flex-col">
      <h1 className="text-2xl font-bold">Reset Password</h1>
      <p className="text-sm text-muted-foreground mt-1">
        Remember your password?{" "}
        <Link className="text-primary font-medium underline" href="/sign-in">
          Sign in
        </Link>
      </p>
      <div className="flex flex-col gap-2 [&>input]:mb-3 mt-8">
        <Label htmlFor="email">Email</Label>
        <Input name="email" placeholder="you@example.com" required />
        <SubmitButton formAction={forgotPasswordAction}>
          Reset Password
        </SubmitButton>
        <FormMessage message={searchParams} />
      </div>
      <p className="text-xs text-muted-foreground text-center mt-4">
        Check your email for a reset link
      </p>
    </form>
  );
}
```

Changes from original:
- Removed `<SmtpMessage />` import and render
- Removed `flex-1`, `w-full`, `min-w-64`, `max-w-64`, `mx-auto`, `[&>input]:mb-6` (card handles sizing)
- Changed `font-medium` → `font-bold` on h1
- Changed subtitle text to "Remember your password?" and used `text-muted-foreground`
- Changed link to `text-primary` (was `text-primary` — keeping, but subtitle was `text-secondary-foreground`)
- Added reset confirmation note at bottom
- Removed wrapping `<>...</>` fragment

- [ ] **Step 2: Verify in browser**

Navigate to `http://localhost:3000/forgot-password`.

Check:
- No "Note: Emails are rate limited" message
- "Check your email for a reset link" appears below submit
- Card styling matches sign-in and sign-up pages
- Light and dark mode both correct

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/\(auth-pages\)/forgot-password/page.tsx
git commit -m "feat(web): polish forgot-password page, remove SMTP note"
```

---

### Task 6: Elevate landing page — hero + feature preview

**Files:**
- Modify: `apps/web/app/page.tsx`

- [ ] **Step 1: Rewrite landing page with hero and sample questions**

Replace the entire content of `apps/web/app/page.tsx`:

```tsx
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import { Button } from '@/components/ui/button';

const SAMPLE_QUESTIONS = [
    'Who is the top scorer in the Premier League this season?',
    "Tell me about Manchester City's upcoming fixtures",
    'How is Erling Haaland performing in the last few gameweeks?',
    'Which defenders have the most clean sheets?',
];

export default async function HomePage() {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (user) {
        redirect('/protected');
    }

    return (
        <div className="flex flex-col items-center justify-center px-6 gap-16 py-16">
            {/* Hero */}
            <div className="flex flex-col items-center gap-6 text-center max-w-2xl">
                <div className="h-20 w-20 rounded-full bg-secondary ring-4 ring-primary/30 shadow-[0_0_40px_rgba(0,255,135,0.15)] flex items-center justify-center p-3">
                    <img
                        src="/fpl-assistant.png"
                        alt="ChatFPL"
                        className="h-full w-full object-contain"
                    />
                </div>
                <h1 className="text-5xl sm:text-6xl font-bold font-header tracking-tight">
                    ChatFPL
                </h1>
                <p className="text-lg text-muted-foreground max-w-xl">
                    An AI-powered Fantasy Premier League assistant that grounds
                    every answer in live FPL data. Transfers, captaincy,
                    fixtures — covered.
                </p>
                <div className="flex gap-3 mt-2">
                    <Button asChild size="lg">
                        <Link href="/sign-in">Sign in</Link>
                    </Button>
                    <Button asChild size="lg" variant="outline">
                        <Link href="/sign-up">Create account</Link>
                    </Button>
                </div>
            </div>

            {/* Feature preview — sample questions */}
            <div className="w-full max-w-xl">
                <p className="text-sm text-muted-foreground text-center mb-4">
                    Ask about...
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {SAMPLE_QUESTIONS.map((question) => (
                        <div
                            key={question}
                            className="p-3 rounded-lg border border-border bg-card text-sm text-muted-foreground"
                        >
                            {question}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
```

Changes from original:
- Title: "FPL Coach" → "ChatFPL", much larger (`text-5xl sm:text-6xl`)
- Added FPL assistant logo above title with glow ring treatment
- Description copy updated to match metadata
- Added "Ask about..." section with 4 sample question cards (non-interactive)
- Removed `min-h-[70vh]` — natural content flow with `py-16` padding
- Cards use `bg-card border-border` for visual consistency

- [ ] **Step 2: Verify in browser**

Navigate to `http://localhost:3000` (logged out).

Check:
- Logo renders with green glow ring
- "ChatFPL" title is large and uses Outfit font
- Sample question cards display in 2-column grid on desktop, 1-column on mobile
- CTA buttons work (navigate to sign-in / sign-up)
- Light and dark mode — glow effect visible in dark, subtle in light
- No horizontal scroll at any viewport width

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/page.tsx
git commit -m "feat(web): elevate landing page with hero and feature preview"
```

---

### Task 7: Chat page brand consistency + visual assessment

**Files:**
- Modify: `apps/web/components/chat/composing-view.tsx` (if needed)

- [ ] **Step 1: Update composing view title default**

In `apps/web/components/chat/composing-view.tsx`, the default title prop is `"Let's make some picks"`. This is fine — it's a tagline, not the brand name. No change needed to the default.

Check the actual rendering at `http://localhost:3000/protected` (requires signing in). Visually assess:

- Title renders in Outfit font with the soccer emoji
- Sample question cards match the landing page styling (they already use `border-primary/20 bg-surface` — close enough to the landing cards)
- "Powered by Claude" text is visible
- Conversation view (send a test message if the agent-server is running locally) — check message bubbles, streaming indicator, spacing

- [ ] **Step 2: Document any issues**

If issues are found during the visual assessment, note them here. Otherwise mark as clean.

- [ ] **Step 3: Commit (only if changes were made)**

```bash
# Only if files were modified:
git add apps/web/components/chat/composing-view.tsx
git commit -m "fix(web): chat page visual consistency adjustments"
```

---

### Task 8: Final verification — build + visual pass

**Files:** None (verification only)

- [ ] **Step 1: Run production build**

```bash
cd apps/web && bun run build
```

Expected: Build succeeds with no type errors. Warnings about unused imports are acceptable but should be fixed.

- [ ] **Step 2: Fix any build errors**

If the build fails, fix the issue in the relevant file. Common issues:
- Unused imports (e.g., `SmtpMessage` if not fully cleaned up)
- Type mismatches from changed props

- [ ] **Step 3: Full visual pass in dev mode**

Run `bun run dev` and navigate through all screens in order:

1. `http://localhost:3000` — landing page (logged out)
2. `http://localhost:3000/sign-up` — sign-up card
3. `http://localhost:3000/sign-in` — sign-in card
4. `http://localhost:3000/forgot-password` — forgot-password card
5. `http://localhost:3000/protected` — chat page (requires auth)

For each screen, toggle between light and dark mode using the theme switcher.

Check:
- "ChatFPL" appears in nav and landing
- All auth forms are centered in cards
- No SmtpMessage visible anywhere
- Landing has logo + hero + sample cards
- No layout overflow or misalignment at 375px, 768px, 1440px widths

- [ ] **Step 4: Commit any fixes from the visual pass**

```bash
git add -u
git commit -m "fix(web): final visual pass adjustments"
```

- [ ] **Step 5: Push to main**

```bash
git push origin main
```

Railway auto-deploys on push. After deploy completes, verify at `https://web-production-20ff6.up.railway.app`.

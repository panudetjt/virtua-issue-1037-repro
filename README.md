# Virtua Issue #1037 — Throwaway Reproduction Project

> **Notice:** This is a throwaway minimal reproduction repository specifically created for [inokawa/virtua#1037](https://github.com/inokawa/virtua/issues/1037) and [inokawa/virtua#1038](https://github.com/inokawa/virtua/pull/1038).

A standalone minimal reproduction project demonstrating the **Blank Viewport during Scroll Restoration** bug in `virtua` (`WindowVirtualizer`), alongside a direct side-by-side comparison with `@tanstack/react-virtual` (`useWindowVirtualizer`).

---

## Related Upstream References

- **Upstream Bug Report:** [inokawa/virtua#1037](https://github.com/inokawa/virtua/issues/1037)
- **Upstream Pull Request:** [inokawa/virtua#1038](https://github.com/inokawa/virtua/pull/1038)
- **Related Upstream Issue (Container scroll):** [inokawa/virtua#1007](https://github.com/inokawa/virtua/issues/1007)

---

## The Real-World Production Scenario

This bug impacts common list-to-detail navigation in modern web applications (Next.js App Router / Pages Router, Remix, React Router, Vite SPA with scroll restoration):

1. **User Browse:** User scrolls down a feed, search results, or catalog to Item #20 (~`1600px`).
2. **Navigate to Detail:** User clicks Item #20 to open its detail page (`/product/20`).
3. **Browser Back:** User clicks the **Browser Back button** (or app "Back to List" button).
4. **Router Restores Scroll:** The router/browser history restores `window.scrollY = 1600px` before/during page mount.
5. **The Bug (Blank Viewport):** The screen is completely blank:
   - `window.scrollY` is restored at `1600px`.
   - `WindowVirtualizer` initializes internal `scrollOffset` to `0`, rendering items `#0..#12` at the top (`0px`–`960px`, far above the user's viewport).
   - The visible viewport (`1600px`–`2400px`) contains **no rendered DOM nodes**.
   - Because the restored scroll position is static, the browser dispatches no subsequent `scroll` event.
6. **Pop-in on Wheel:** Moving the mouse wheel or touching the screen by even 1px dispatches a `scroll` event, causing items `#18..#31` to abruptly snap into view.

---

## Quick Start

```bash
git clone https://github.com/panudetjt/virtua-issue-1037-repro.git
cd virtua-issue-1037-repro
npm install
npm run dev
```

Open your browser at: `http://localhost:5173/`

---

## Reproduction Methods in This App

### Method 1: Real User Back Navigation Flow
1. Scroll down to Item #20 (~`1600px`).
2. Click on Item #20 to open the Detail page (window scroll resets to `0px`).
3. Click the **`← Back to List (Restores Scroll)`** button (or the browser's Back button).
4. **Observe:** The red banner 🔴 `✗ BUG: BLANK VIEWPORT!` appears immediately, and the viewport is completely blank.
   - `window.scrollY` is at `1600px`.
   - Virtua rendered items `#0..#12` at `0px`–`960px` (outside visible screen).
5. Move the mouse wheel by 1px or click **`Scroll +1px`**:
   - A `scroll` event fires, Virtua renders items `#15..#30`, and the banner turns green 🟢.

### Method 2: Shortcut Button `⚡ Remount at 1600px`
- Click **`⚡ Remount at 1600px`** in the top header.
- Simulates remounting when `window.scrollY` is non-zero (client-side route transition / tab switch).
- The blank viewport bug reproduces instantly.

### Method 3: Automated Test `→ Run Auto-Repro Test`
- Click **`→ Run Auto-Repro Test`** to run the complete sequence automatically (Scroll 1600px $\rightarrow$ Detail $\rightarrow$ Back).

### Comparison with TanStack Virtual
1. Click **`Switch to TanStack`** in the top header.
2. Repeat Method 1 or 2.
3. Notice that `@tanstack/react-virtual` renders items `#18..#31` immediately without any blank flash because it reads `initialOffset: () => window.scrollY`.

---

## Empirical Verification in Chromium

When mounting or restoring back navigation at `window.scrollY = 1600px`:

| Virtualizer | Rendered Count | Rendered Indices | In Viewport? | Visual Result |
| :--- | :---: | :---: | :---: | :--- |
| **`virtua` (`WindowVirtualizer`)** | **`13`** | **`#0 .. #12`** (offscreen, 0–960px) | 🔴 **`false`** | **Completely Blank Viewport** |
| **`@tanstack/react-virtual`** | **`14`** | **`#18 .. #31`** (in viewport, 1440–2480px) | 🟢 **`true`** | **Rendered immediately before paint** |

---

## Root Cause & Fix Summary

- **Cause:** In `createWindowDriver` (`src/core/driver.ts`), `$observe` attaches the scroll listener to `window`, but never calls `scrollObserver._sync()` or reads the initial `window.scrollY` and viewport dimensions on mount.
- **Fix:** In `createWindowDriver.$observe`, synchronously call `onViewportResize()` and `scrollObserver._sync()` on mount. In `createContainerDriver.$observe`, initialize `isViewportDisplayed = false` and synchronize immediately if the viewport has dimensions.
- **Resolved in PR:** [inokawa/virtua#1038](https://github.com/inokawa/virtua/pull/1038)

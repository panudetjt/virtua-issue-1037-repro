# PR: Fix blank viewport when mounted with non-zero scroll position (scroll restoration)

## Related Issue

Fixes #[ISSUE_NUMBER]

## Summary

Fixes an issue where mounting `WindowVirtualizer` (or `Virtualizer`/`VList`) in a window or container that already has a non-zero scroll position (such as browser back navigation, page refresh with scroll restoration, or client-side routing) leaves the viewport blank until the user manually triggers a `scroll` event.

```diff
 createWindowDriver.$observe(container)
   resizeObserver._observe(viewport)
   scrollObserver = createScrollObserver(...)
+  onViewportResize()       // Sync initial viewport dimensions
+  scrollObserver._sync()   // Sync baseOffset and current scrollOffset (window.scrollY)
   initialized[1](true)
```

### Root Cause

1. `VirtualStore` initializes internal `scrollOffset` to `0`.
2. When a component mounts after navigation (or in a tab/route switch), the browser or client-side router has already restored the scroll position (e.g. `window.scrollY = 1600` or `element.scrollTop = 500`). Because the scroll position is static, the browser dispatches no subsequent `scroll` event.
3. In `createWindowDriver` and `createContainerDriver`, `$observe` attached the scroll listener but never called `scrollObserver._sync()` or read the existing scroll position on mount.
4. Consequently, `VirtualStore` remained with `scrollOffset = 0` and rendered items 0..9 (positioned at `0px`–`800px`), while the viewport was scrolled down to `1600px`–`2400px` where no DOM nodes existed (blank viewport).
5. Only when the user moved the mouse wheel or scrolled manually by 1px did `onScroll` fire and update the virtualizer.

### Solution

- In `createWindowDriver.$observe`:
  - Call `onViewportResize()` synchronously to register the initial viewport dimensions (`ACTION_VIEWPORT_RESIZE`).
  - Call `scrollObserver._sync()` to calculate `baseOffset` and dispatch `ACTION_SCROLL` with the current `scrollOffset`.
- In `createContainerDriver.$observe`:
  - If the viewport has dimensions, update `ACTION_VIEWPORT_RESIZE` and call `scrollObserver._sync()`.
- This triggers `UPDATE_VIRTUAL_STATE` with `shouldSync = true`, causing React to synchronously flush the re-render (`flushSync(rerender)`) during `useIsomorphicLayoutEffect` before browser paint.

## Evidence

- **Before:**
  - Mounting at `window.scrollY = 1600px`: Virtua renders items `#0..#12` at top (`0px`–`960px`).
  - Items inside viewport (`1600px`–`2400px`): `0` items (query for `[data-testid="item-20"]` returns `null`).
  - Result: 🔴 Viewport is completely blank until manual user scroll.
- **After:**
  - Mounting at `window.scrollY = 1600px`: Virtua immediately reads `window.scrollY` during `$observe`, dispatches `ACTION_SCROLL`, and re-renders items `#18..#25` at `1440px`–`2000px` before the first paint.
  - Items inside viewport: populated (`[data-testid="item-20"]` is present in DOM).
  - Result: 🟢 Visible items rendered immediately without blank flash.

## Merge Danger

**Door:** two-way

Rollback is trivial; the change only adds synchronous initialization calls on mount without altering any existing scroll listener mechanics or API signatures.

**Blast Radius:** contained

Changes are strictly limited to `createWindowDriver.$observe` and `createContainerDriver.$observe` in `src/core/driver.ts`.

## Git Patch

```diff
diff --git a/src/core/driver.ts b/src/core/driver.ts
index e234abc..f567def 100644
--- a/src/core/driver.ts
+++ b/src/core/driver.ts
@@ -432,6 +432,15 @@ export const createContainerDriver = (
         },
       );

+      if (viewport.clientWidth || viewport.clientHeight) {
+        store.$update(
+          ACTION_VIEWPORT_RESIZE,
+          isHorizontal ? viewport.clientWidth : viewport.clientHeight,
+        );
+        scrollObserver._sync();
+      }
+
       initialized[1](true);
     },
     $dispose() {
@@ -512,6 +521,10 @@ export const createWindowDriver = (
         baseOffset,
       );

+      // Sync initial viewport dimensions and scroll offset on mount
+      onViewportResize();
+      scrollObserver._sync();
+
       initialized[1](true);
     },
     $dispose() {
```

---

## Test Spec

Add the following regression test to the test suite (e.g. in `spec/react/WindowVirtualizer.spec.tsx`):

```tsx
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import React from "react";
import { WindowVirtualizer } from "virtua";

describe("WindowVirtualizer scroll restoration", () => {
  it("renders visible items immediately when mounted at non-zero window.scrollY", async () => {
    document.documentElement.style.height = "10000px";
    document.body.style.height = "10000px";
    const items = Array.from({ length: 100 }, (_, i) => ({ id: i }));

    // 1. Mount first time
    const first = render(
      <WindowVirtualizer data={items} itemSize={80}>
        {(item) => (
          <div data-testid={`item-${item.id}`} style={{ height: 80 }}>
            item-{item.id}
          </div>
        )}
      </WindowVirtualizer>
    );

    // 2. Scroll to 1600px and unmount
    window.scrollTo(0, 1600);
    first.unmount();

    expect(window.scrollY).toBe(1600);

    // 3. Remount while scrollY is 1600px (simulating back navigation)
    const second = render(
      <WindowVirtualizer data={items} itemSize={80}>
        {(item) => (
          <div data-testid={`item-${item.id}`} style={{ height: 80 }}>
            item-{item.id}
          </div>
        )}
      </WindowVirtualizer>
    );

    // 4. Assert items around 1600px are rendered, and item 0 is NOT rendered
    const topItem = second.container.querySelector('[data-testid="item-0"]');
    const visibleItem = second.container.querySelector(
      '[data-testid="item-20"]'
    );

    expect(topItem).toBeNull();
    expect(visibleItem).not.toBeNull();

    second.unmount();
    window.scrollTo(0, 0);
  });
});
```

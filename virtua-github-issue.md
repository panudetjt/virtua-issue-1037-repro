# [Bug]: WindowVirtualizer renders blank viewport during scroll restoration until manual scroll event

## Description

When navigating back to a page containing a `WindowVirtualizer` (e.g. browser back navigation or client-side router restoration) where the scroll position is non-zero (e.g. `window.scrollY = 1600`), the viewport remains completely blank even when a valid `cache` is passed.

Items are only rendered once the user manually performs a scroll event (e.g. moving the mouse wheel by 1px).

## Environment

- `virtua`: `^0.53.5` (also reproducible in earlier versions `^0.43.0`–`^0.52.0`)
- Framework: React (React 18 / 19, Next.js App Router / Pages Router, or vanilla SPA)
- Browser: All browsers (Chromium, Firefox, Safari)

## Steps to Reproduce

1. Render a list of 100 items using `WindowVirtualizer` with `itemSize={80}` on a tall window.
2. Scroll down to `window.scrollY = 1600px`.
3. Unmount the virtualizer (simulate navigating to another page).
4. Remount the virtualizer while `window.scrollY` remains at `1600px` (simulate browser back navigation where `window.scrollY` is restored).
5. Observe the rendered items in the DOM.

### Expected Behavior

Items corresponding to the restored scroll position (around offset `1600px`, e.g. items 18–25) should be rendered immediately upon mount / layout effect.

### Actual Behavior

- The DOM container height is correctly set from `cache`, and the browser scrollbar position is at `1600px`.
- However, `WindowVirtualizer` initially renders items at index `0` (offset `0px`–`800px`), which is far above the user's viewport.
- The visible viewport (`1600px`–`2400px`) is empty / blank.
- The moment the user moves the mouse wheel or touches the screen by 1px, a `scroll` event fires on `window`, and the correct items suddenly pop in.

---

## Minimal Reproduction Code

A self-contained React component demonstrating the issue.
Note: The wrapper container preserves `minHeight: "8200px"` so the document scroll position is not clamped to `0` while the list is unmounted.

```tsx
import React, { useState } from "react";
import { WindowVirtualizer } from "virtua";

const items = Array.from({ length: 100 }, (_, i) => ({
  id: i,
  title: `Item #${i} (${i * 80}px - ${(i + 1) * 80}px)`,
}));

export function App() {
  const [mounted, setMounted] = useState(true);

  return (
    <div style={{ minHeight: "8200px", padding: "16px" }}>
      <div style={{ position: "sticky", top: 10, zIndex: 99, background: "#fff", padding: "12px", border: "1px solid #ccc" }}>
        <p>Current window.scrollY: {typeof window !== "undefined" ? window.scrollY : 0}px</p>
        <button
          onClick={() => {
            // 1. Scroll window to 1600px
            window.scrollTo(0, 1600);
            // 2. Unmount list and remount after a brief tick (simulating route change / tab switch / back navigation)
            setMounted(false);
            setTimeout(() => {
              window.scrollTo(0, 1600);
              setMounted(true);
            }, 50);
          }}
        >
          Simulate Navigation & Restore at 1600px
        </button>
        <button onClick={() => window.scrollBy(0, 1)} style={{ marginLeft: 8 }}>
          Scroll +1px (triggers pop-in)
        </button>
      </div>

      {mounted && (
        <WindowVirtualizer data={items} itemSize={80}>
          {(item) => (
            <div
              key={item.id}
              data-testid={`item-${item.id}`}
              style={{ height: 80, borderBottom: "1px solid #eee", display: "flex", alignItems: "center" }}
            >
              {item.title}
            </div>
          )}
        </WindowVirtualizer>
      )}
    </div>
  );
}
```

### Automated Vitest / Playwright test case proving the bug

```tsx
it("renders visible items immediately on mount at non-zero window.scrollY", async () => {
  document.documentElement.style.height = "10000px";
  document.body.style.height = "10000px";
  const items = Array.from({ length: 100 }, (_, i) => i);

  // 1. Initial mount and scroll down
  const first = render(
    <WindowVirtualizer data={items} itemSize={80}>
      {(i) => (
        <div data-testid={`item-${i}`} style={{ height: 80 }}>
          Item {i}
        </div>
      )}
    </WindowVirtualizer>
  );
  window.scrollTo(0, 1600);
  first.unmount();

  // window.scrollY is still 1600px
  expect(window.scrollY).toBe(1600);

  // 2. Remount (simulating back navigation)
  const second = render(
    <WindowVirtualizer data={items} itemSize={80}>
      {(i) => (
        <div data-testid={`item-${i}`} style={{ height: 80 }}>
          Item {i}
        </div>
      )}
    </WindowVirtualizer>
  );

  // Check items in viewport (at 1600px, items 18..24 should be visible)
  const visibleItem = second.container.querySelector('[data-testid="item-20"]');
  const topItem = second.container.querySelector('[data-testid="item-0"]');

  // BUG: visibleItem is null, topItem is rendered instead!
  expect(visibleItem).not.toBeNull();
  expect(topItem).toBeNull();
});
```

---

## Root Cause Analysis

### 1. `createVirtualStore` initializes `scrollOffset = 0`

In `src/core/store.ts`:

```ts
let scrollOffset = 0;
```

`VirtualStore` holds internal `scrollOffset` initialized to `0`.

### 2. `createWindowDriver` does not sync existing scroll offset on mount

In `src/core/driver.ts` inside `createWindowDriver`:

```ts
export const createWindowDriver = (
  store: VirtualStore,
  layout: Layout,
  isHorizontal: boolean,
): Driver => {
  ...
  return {
    $observe(container) {
      ...
      const onWindowResize = (onViewportResize = () => {
        store.$update(
          ACTION_VIEWPORT_RESIZE,
          viewport[isHorizontal ? "clientWidth" : "clientHeight"],
        );
      });
      window.addEventListener("resize", onWindowResize);
      resizeObserver._observe(viewport);

      scrollObserver = createScrollObserver(
        store,
        layout,
        window,
        viewport,
        isHorizontal,
        isRtl,
        NULL,
        baseOffset,
      );

      initialized[1](true);
    }
  }
}
```

Notice:

1. `scrollObserver` attaches `viewport.addEventListener("scroll", onScroll)`.
2. However, when navigating back, the browser restored `window.scrollY = 1600` **before** or **during** mount. The browser does **not** dispatch a synthetic `scroll` event.
3. `createWindowDriver.$observe` never calls `scrollObserver._sync()` or reads the initial scroll offset!
4. Consequently:
   - `store.$getScrollOffset()` stays `0`.
   - `store.$getRange()` computes the item range starting from offset `0` (e.g. items 0–9).
   - Items 0–9 are positioned at `0px`–`800px`.
   - The user's screen is viewing `1600px`–`2400px`, which has NO DOM elements rendered $\rightarrow$ **Blank Viewport**.
5. When the user scrolls by 1px, `onScroll` finally fires, dispatching `ACTION_SCROLL` with `1601px`, and `store` updates to the correct range.

---

## Suggested Fix

In `src/core/driver.ts`, inside `createWindowDriver.$observe` (and similarly in `createContainerDriver`):
Synchronize the initial viewport size and scroll offset immediately upon observation:

```diff
--- a/src/core/driver.ts
+++ b/src/core/driver.ts
@@ -512,6 +512,10 @@ export const createWindowDriver = (
         baseOffset,
       );

+      // Synchronize initial viewport size and scroll offset on mount
+      onViewportResize();
+      scrollObserver._sync();
+
       initialized[1](true);
     },
```

And in `createContainerDriver`:

```diff
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
```

Calling `onViewportResize()` and `scrollObserver._sync()` during `$observe`:

1. Measures the viewport and updates `ACTION_VIEWPORT_RESIZE`.
2. Computes `baseOffset()` and updates `ACTION_START_OFFSET_CHANGE`.
3. Reads the current `scrollTop` / `scrollY` and dispatches `ACTION_SCROLL`.
4. Triggers `UPDATE_VIRTUAL_STATE` with `shouldSync = true`, causing React to synchronously flush the rerender (`flushSync(rerender)` in layout effect).
5. Items at the restored scroll position are rendered immediately before the first browser paint.

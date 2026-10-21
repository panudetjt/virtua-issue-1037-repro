import { useState, useEffect, useMemo, useRef } from 'react';
import { WindowVirtualizer, type CacheSnapshot } from 'virtua';
import { useWindowVirtualizer, type VirtualItem } from '@tanstack/react-virtual';

const ITEM_COUNT = 100;
const ITEM_HEIGHT = 80;

type Item = {
  id: number;
  title: string;
  color: string;
};

const items: Item[] = Array.from({ length: ITEM_COUNT }, (_, i) => ({
  id: i,
  title: `Item #${i} (${i * ITEM_HEIGHT}px - ${(i + 1) * ITEM_HEIGHT}px)`,
  color: i % 2 === 0 ? '#ffffff' : '#f1f5f9',
}));

// In-memory cache store mimicking production scroll restoration
const virtuaCacheStore = new Map<string, CacheSnapshot>();
const tanstackCacheStore = new Map<string, VirtualItem[]>();

// -------------------------------------------------------------
// Virtua Implementation (WindowVirtualizer)
// -------------------------------------------------------------
function VirtuaList({ onSelect }: { onSelect: (id: number) => void }) {
  const [cache] = useState(() => virtuaCacheStore.get('repro-list'));
  const virtualizerRef = useRef<any>(null);

  useEffect(() => {
    // Trigger viewport resize event so WindowVirtualizer driver measures viewport dimensions on mount
    window.dispatchEvent(new Event('resize'));
    return () => {
      if (virtualizerRef.current?.cache) {
        virtuaCacheStore.set('repro-list', virtualizerRef.current.cache);
      }
    };
  }, []);

  return (
    <WindowVirtualizer
      ref={virtualizerRef}
      data={items}
      itemSize={ITEM_HEIGHT}
      cache={cache}
    >
      {(item) => (
        <div
          key={item.id}
          data-item-id={item.id}
          onClick={() => onSelect(item.id)}
          style={{
            height: ITEM_HEIGHT,
            background: item.color,
            borderBottom: '1px solid #cbd5e1',
            display: 'flex',
            alignItems: 'center',
            padding: '0 24px',
            fontSize: 16,
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'background 0.2s',
          }}
        >
          <span style={{ width: 80, color: '#64748b' }}>#{item.id}</span>
          <span style={{ flex: 1 }}>{item.title}</span>
          <span style={{ fontSize: 13, color: '#0284c7' }}>Click to view detail &rarr;</span>
        </div>
      )}
    </WindowVirtualizer>
  );
}

// -------------------------------------------------------------
// TanStack Virtual Implementation (useWindowVirtualizer)
// -------------------------------------------------------------
function TanstackList({ onSelect }: { onSelect: (id: number) => void }) {
  const initialMeasurementsCache = useMemo(() => tanstackCacheStore.get('repro-list'), []);

  const virtualizer = useWindowVirtualizer({
    count: items.length,
    estimateSize: () => ITEM_HEIGHT,
    overscan: 2,
    initialMeasurementsCache,
    initialRect: {
      width: typeof window !== 'undefined' ? window.innerWidth : 0,
      height: typeof window !== 'undefined' ? window.innerHeight : 0,
    },
    initialOffset: () => (typeof window !== 'undefined' ? window.scrollY : 0),
  });
  useEffect(() => {
    return () => {
      tanstackCacheStore.set('repro-list', virtualizer.measurementsCache);
    };
  }, [virtualizer]);

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: `${virtualizer.getTotalSize()}px`,
      }}
    >
      {virtualItems.map((vItem) => {
        const item = items[vItem.index];
        return (
          <div
            key={vItem.key}
            data-item-id={item.id}
            onClick={() => onSelect(item.id)}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: `${vItem.size}px`,
              transform: `translateY(${vItem.start}px)`,
              background: item.color,
              borderBottom: '1px solid #cbd5e1',
              display: 'flex',
              alignItems: 'center',
              padding: '0 24px',
              fontSize: 16,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            <span style={{ width: 80, color: '#64748b' }}>#{item.id}</span>
            <span style={{ flex: 1 }}>{item.title}</span>
            <span style={{ fontSize: 13, color: '#0284c7' }}>Click to view detail &rarr;</span>
          </div>
        );
      })}
    </div>
  );
}

// -------------------------------------------------------------
// Main App Component with Route Simulation and Live Inspector
// -------------------------------------------------------------
export default function App() {
  const [lib, setLib] = useState<'virtua' | 'tanstack'>('virtua');
  const [view, setView] = useState<'list' | 'detail'>('list');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const savedScrollRef = useRef<number>(1600);
  const [scrollY, setScrollY] = useState(() => (typeof window !== 'undefined' ? window.scrollY : 0));
  const [domRenderedStats, setDomRenderedStats] = useState<{ count: number; min: number; max: number; inViewport: boolean }>({
    count: 0,
    min: 0,
    max: 0,
    inViewport: true,
  });

  // Track scroll position
  useEffect(() => {
    const handleScroll = () => {
      setScrollY(window.scrollY);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Enable manual scroll restoration to match real routers (Next.js, React Router, etc.)
  useEffect(() => {
    if (typeof window !== 'undefined' && 'scrollRestoration' in history) {
      history.scrollRestoration = 'manual';
    }
  }, []);
  // Inspect DOM items every 100ms
  useEffect(() => {
    const checkDom = () => {
      setScrollY(window.scrollY);
      if (view !== 'list') return;
      const elements = Array.from(document.querySelectorAll<HTMLElement>('[data-item-id]'));
      if (elements.length === 0) {
        setDomRenderedStats({ count: 0, min: -1, max: -1, inViewport: false });
        return;
      }

      const ids = elements.map((el) => parseInt(el.getAttribute('data-item-id') || '0', 10));
      const min = Math.min(...ids);
      const max = Math.max(...ids);

      // Check if at least one item overlaps with viewport
      const anyInViewport = elements.some((el) => {
        const rect = el.getBoundingClientRect();
        return rect.bottom > 0 && rect.top < window.innerHeight;
      });

      setDomRenderedStats({
        count: ids.length,
        min,
        max,
        inViewport: anyInViewport,
      });
    };
    const interval = setInterval(checkDom, 100);
    return () => clearInterval(interval);
  }, [view]);

  // Navigate to detail
  const handleSelect = (id: number) => {
    const currentScroll = window.scrollY;
    savedScrollRef.current = currentScroll;
    setSelectedId(id);
    history.replaceState({ scrollY: currentScroll }, '');
    history.pushState({ view: 'detail' }, '', '#detail');
    setView('detail');
    // When entering detail, user view is at top
    window.scrollTo(0, 0);
  };

  // Back navigation
  const handleBack = () => {
    history.back();
  };

  // Listen to popstate (browser back)
  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      if (window.location.hash !== '#detail') {
        const targetScroll = e.state?.scrollY ?? savedScrollRef.current;
        // 1. Router restores scroll position first (models real router scroll restoration)
        window.scrollTo(0, targetScroll);

        // 2. Component mounts on the restored page (models real router route transition / async mount)
        // The scroll event from scrollTo finishes before WindowVirtualizer mounts,
        // reproducing the exact production condition where WindowVirtualizer mounts into an already-scrolled window.
        setTimeout(() => {
          setView('list');
        }, 50);
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // Automated Reproduction Sequence
  // Quick direct remount at 1600px (simulating client-side tab switch or route transition)
  const remountAt1600 = () => {
    savedScrollRef.current = 1600;
    window.scrollTo(0, 1600);
    setView('detail');
    setTimeout(() => {
      window.scrollTo(0, 1600);
      setView('list');
    }, 50);
  };

  const runAutoRepro = async () => {
    const sleep = (ms: number) => {
      const { promise, resolve } = Promise.withResolvers<void>();
      setTimeout(resolve, ms);
      return promise;
    };

    // 1. Scroll down to 1600px
    window.scrollTo(0, 1600);
    await sleep(200);

    // 2. Click item to navigate to detail
    handleSelect(20);
    await sleep(400);

    // 3. Navigate back
    handleBack();
  };

  return (
    <div style={{ minHeight: `${ITEM_COUNT * ITEM_HEIGHT + 200}px`, paddingBottom: 200 }}>
      {/* Sticky Inspector HUD */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 9999,
          background: 'rgba(15, 23, 42, 0.95)',
          color: '#ffffff',
          padding: '14px 24px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span>Virtua Scroll Restoration Repro</span>
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: 4,
                background: lib === 'virtua' ? '#ef4444' : '#10b981',
              }}
            >
              Using: {lib === 'virtua' ? 'virtua (WindowVirtualizer)' : '@tanstack/react-virtual'}
            </span>
          </div>
          <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 4 }}>
            window.scrollY: <b style={{ color: '#38bdf8' }}>{Math.round(scrollY)}px</b> | DOM items: {domRenderedStats.count} (
            #{domRenderedStats.min}..#{domRenderedStats.max})
          </div>
        </div>

        {/* Viewport Status Indicator */}
        <div
          style={{
            padding: '8px 14px',
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 600,
            background: domRenderedStats.inViewport ? '#065f46' : '#7f1d1d',
            color: domRenderedStats.inViewport ? '#34d399' : '#fca5a5',
            border: `1px solid ${domRenderedStats.inViewport ? '#059669' : '#dc2626'}`,
          }}
        >
          {domRenderedStats.inViewport ? (
            <span>&check; Viewport Populated (Items in view)</span>
          ) : (
            <span>&cross; BUG: BLANK VIEWPORT! (Items rendered outside screen)</span>
          )}
        </div>

        {/* Control Buttons */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={() => {
              setLib(lib === 'virtua' ? 'tanstack' : 'virtua');
              window.scrollTo(0, 0);
            }}
            style={{
              padding: '6px 12px',
              borderRadius: 6,
              background: '#334155',
              color: '#fff',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            Switch to {lib === 'virtua' ? 'TanStack' : 'Virtua'}
          </button>

          <button
            onClick={runAutoRepro}
            style={{
              padding: '6px 14px',
              borderRadius: 6,
              background: '#2563eb',
              color: '#fff',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            &rarr; Run Auto-Repro Test
          </button>

          <button
            onClick={remountAt1600}
            style={{
              padding: '6px 14px',
              borderRadius: 6,
              background: '#7c3aed',
              color: '#fff',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            &#9889; Remount at 1600px
          </button>
          <button
            onClick={() => {
              window.scrollBy(0, 1);
              window.dispatchEvent(new Event('scroll'));
            }}
            style={{
              borderRadius: 6,
              background: '#475569',
              color: '#fff',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            Scroll +1px (Watch pop-in)
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main style={{ maxWidth: 840, margin: '24px auto', padding: '0 16px' }}>
        {view === 'detail' ? (
          <div
            style={{
              background: '#fff',
              padding: 32,
              borderRadius: 12,
              boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
            }}
          >
            <button
              onClick={handleBack}
              style={{
                marginBottom: 20,
                padding: '8px 16px',
                background: '#0f172a',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              &larr; Back to List (Restores Scroll)
            </button>
            <h1 style={{ marginTop: 0 }}>Detail for Item #{selectedId}</h1>
            <p style={{ color: '#64748b', lineHeight: 1.6 }}>
              You navigated to this page from a scroll position of around <b>{Math.round(savedScrollRef.current)}px</b>.
              <br />
              When you click the button above (or your browser's Back button), the router will restore the scroll
              position back to <b>{Math.round(savedScrollRef.current)}px</b>.
            </p>
          </div>
        ) : (
          <div
            style={{
              background: '#fff',
              borderRadius: 12,
              overflow: 'hidden',
              boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
            }}
          >
            {lib === 'virtua' ? (
              <VirtuaList onSelect={handleSelect} />
            ) : (
              <TanstackList onSelect={handleSelect} />
            )}
          </div>
        )}
      </main>
    </div>
  );
}

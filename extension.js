(function (root, factory) {
  const extension = factory();
  if (typeof module === 'object' && module.exports) module.exports = extension;
  else extension.start({ window: root, document: root.document, marinara: typeof marinara !== 'undefined' ? marinara : null });
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const KEY = '__gfStoryGlass';
  const TAG = 'MARINARA-CAPABILITY-GACHA-FORGE';
  const css = `
    /* Remove the dark scrims over story artwork, including the one behind the box. */
    .vn-scene::before, .vn-scene::after {
      content: none !important;
      display: none !important;
    }
    /* 40% transparent = 60% background opacity. Never fade the text or controls. */
    .vn .vn-box {
      background: rgba(6, 10, 16, 0.6) !important;
      background: color-mix(in srgb, var(--ink, #060a10) 60%, transparent) !important;
      -webkit-backdrop-filter: none !important;
      backdrop-filter: none !important;
      box-shadow: none !important;
    }
    .hm-screen .hm-scrim, .hm-screen .hm-art::after {
      display: none !important;
    }
    .hm-screen .hm-tile, .hm-screen .hm-side, .hm-screen .hm-cta,
    .hm-screen .hm-next, .hm-screen .hm-warn, .hm-screen .hm-slot-bg,
    .hm-screen .hm-chat,
    .gf-stage:has(> .gf-view .hm-screen) > .gf-bar,
    .gf-stage:has(> .gf-view .hm-screen) > .gf-bar :is(.currency, .command, .icon-button, .gf-guide-q) {
      background: rgba(6, 10, 16, 0.5) !important;
      background: color-mix(in srgb, var(--ink-2, #060a10) 50%, transparent) !important;
      -webkit-backdrop-filter: none !important;
      backdrop-filter: none !important;
      box-shadow: none !important;
    }
    .gf-stage:has(> .gf-view .hm-screen) > .gf-bar .command {
      color: var(--text) !important;
    }
    .hm-screen :is(.hm-tile, .hm-side, .hm-cta, .hm-next, .hm-warn, .hm-slot-bg, .hm-chat):focus-visible,
    .gf-stage:has(> .gf-view .hm-screen) > .gf-bar :is(.icon-button, button.currency, .gf-guide-q):focus-visible {
      box-shadow: inset 0 0 0 2px var(--coral, #e8c87a) !important;
    }
    /* Home popups veil only the view below the bar. Match that veil over the bar too. */
    .gf-stage:has(> .gf-view .hm-screen):has(> .gf-view .hm-pk-wrap) > .gf-bar::after {
      content: "";
      position: absolute;
      inset: 0;
      z-index: 100;
      pointer-events: none;
      background: color-mix(in srgb, var(--ink, #060a10) 90%, transparent);
      -webkit-backdrop-filter: blur(5px) saturate(0.75);
      backdrop-filter: blur(5px) saturate(0.75);
    }
    /* Let only the home background reach behind the in-flow header. Controls do not move. */
    .gf-stage:has(> .gf-view .hm-screen) > .gf-view .root:has(> .hm-screen) {
      overflow: visible !important;
    }
    .hm-screen > .hm-bg {
      top: calc(0px - var(--gf-story-glass-bar-height, 0px)) !important;
      bottom: auto !important;
      height: calc(100% + var(--gf-story-glass-bar-height, 0px)) !important;
    }
    .hm-screen > .hm-ground {
      top: calc(0px - var(--gf-story-glass-bar-height, 0px)) !important;
    }
    /* Fullscreen: the arena is capped at 100dvh, which on iPad is shorter than the fullscreen host,
       so the uncovered strip and the bottom glow showed through. Fill the host and paint the
       letterbox in the stage's own ink so the 16:9 stage reads as one surface. */
    :host(:fullscreen) {
      background: #000 !important;
      color-scheme: dark;
    }
    :host(:fullscreen) .gf-arena {
      height: 100% !important;
      max-height: none !important;
      background: var(--ink, #0e1420) !important;
    }
    :host(:fullscreen) .gf-stage {
      box-shadow: none !important;
    }
    /* v2: a screen you already saw comes back in place. The screen still slides in, but its
       lists, side blocks and picture captions no longer deal in piece by piece again. */
    .gf-view[data-gsg-calm] [data-deal] > *,
    .gf-view[data-gsg-calm] [data-in],
    .gf-view[data-gsg-calm] [data-changed],
    .gf-view[data-gsg-calm] [data-still] ~ *,
    .gf-view[data-gsg-calm] [data-grid] > [data-grid-in],
    .gf-view[data-gsg-calm] [data-farm-deck][data-day-in] > * {
      animation: none !important;
    }
    /* v2.1: a button or tab on the SAME screen repaints it. The game re-dealt the lists and slid
       the changed parts in again, which read as a page refresh. The new content now stays put;
       the old copy still fades out on top in 100ms, so the change is soft but visible. */
    .gf-view[data-shift] [data-deal] > *,
    .gf-view:is([data-swap], [data-shift]) [data-changed] {
      animation: none !important;
    }
  `;

  const SEEN_KEY = 'gfStoryGlass.seenScreens';
  function loadSeen(win) {
    const shared = win.__gfStoryGlassSeen instanceof Set ? win.__gfStoryGlassSeen : new Set();
    try {
      const saved = JSON.parse(win.sessionStorage?.getItem(SEEN_KEY) || '[]');
      if (Array.isArray(saved)) for (const key of saved) if (typeof key === 'string') shared.add(key);
    } catch { /* Storage blocked: remember for this page only. */ }
    win.__gfStoryGlassSeen = shared;
    return shared;
  }
  function saveSeen(win, seen) {
    try { win.sessionStorage?.setItem(SEEN_KEY, JSON.stringify([...seen].slice(-200))); } catch { /* ignore */ }
  }
  function screenKey(view) {
    const named = view.querySelector('[data-screen]');
    if (named) return 's:' + named.getAttribute('data-screen');
    const screen = view.querySelector('[class*="-screen"]');
    const cls = screen && [...screen.classList].find(name => /-screen$/.test(name));
    if (cls) return 'c:' + cls;
    const first = view.firstElementChild?.firstElementChild || view.firstElementChild;
    return first && typeof first.className === 'string' && first.className ? 'e:' + first.className.trim() : '';
  }

  /* Remembers which screens were already dealt in this browser session. Each visit decides once,
     on its first frame, so a repaint in the middle of a first visit never cuts that deal short. */
  function attachCalmEntries(root, win) {
    if (typeof root.querySelector !== 'function') return () => {};
    const seen = loadSeen(win);
    let active = true, lastKey = '', lastCalm = false, marked = null;
    function apply() {
      if (!active) return;
      const view = root.querySelector('.gf-stage > .gf-view');
      if (!view || typeof view.querySelector !== 'function' || view.querySelector('[data-loading]')) return;
      const key = screenKey(view);
      if (!key) return;
      if (key !== lastKey) {
        lastKey = key;
        lastCalm = seen.has(key);
        if (!lastCalm) { seen.add(key); saveSeen(win, seen); }
      }
      if (marked && marked !== view) marked.removeAttribute('data-gsg-calm');
      if (lastCalm && view.hasAttribute('data-enter')) {
        if (!view.hasAttribute('data-gsg-calm')) view.setAttribute('data-gsg-calm', '');
        marked = view;
      } else if (view.hasAttribute('data-gsg-calm')) {
        view.removeAttribute('data-gsg-calm');
        marked = null;
      }
    }
    // A MutationObserver callback runs before the next paint, so the mark lands before the first frame.
    const observer = new win.MutationObserver(apply);
    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-enter'] });
    apply();
    return () => {
      if (!active) return;
      active = false;observer.disconnect();
      marked?.removeAttribute('data-gsg-calm');marked = null;
    };
  }

  function attachHomeBackdrop(root, win) {
    if (typeof root.querySelector !== 'function') return () => {};
    const property = '--gf-story-glass-bar-height';
    let active = true, pending = false, stage = null, bar = null, previous = '', priority = '';
    let homeHeight = '';
    const resize = win.ResizeObserver ? new win.ResizeObserver(measure) : null;
    function restore() {
      if (!stage) return;
      if (previous) stage.style.setProperty(property, previous, priority);
      else stage.style.removeProperty(property);
    }
    function measure() {
      if (!active || !stage) return;
      // The outgoing home is still visible in a transition shadow root. Keep its
      // last offset until home returns; the destination may have a shorter bar.
      if (root.querySelector('.hm-screen') && bar?.offsetHeight) homeHeight = bar.offsetHeight + 'px';
      const value = homeHeight;
      if (!value) return;
      if (stage.style.getPropertyValue(property) !== value) stage.style.setProperty(property,value);
    }
    function sync() {
      if (!active) return;
      const nextStage = root.querySelector('.gf-stage');
      const nextBar = nextStage?.querySelector(':scope > .gf-bar') || null;
      if (stage !== nextStage || bar !== nextBar) {
        resize?.disconnect();
        if (stage !== nextStage) {
          restore();stage = nextStage;
          previous = stage?.style.getPropertyValue(property) || '';
          priority = stage?.style.getPropertyPriority(property) || '';
        }
        bar = nextBar;
        if (bar) resize?.observe(bar);
      }
      measure();
    }
    function schedule() {
      if (!active || pending) return;
      pending = true;Promise.resolve().then(() => { pending = false;sync(); });
    }
    const observer = new win.MutationObserver(records => {
      // Ignore text, counters and third-party buttons. Only discover a replaced home/header.
      const relevant = node => node.nodeType === 1 && (node.matches?.('.hm-screen, .gf-stage, .gf-bar') || node.querySelector?.('.hm-screen, .gf-bar'));
      if (records.some(record => record.target === root || [...record.addedNodes,...record.removedNodes].some(relevant))) schedule();
    });
    observer.observe(root,{childList:true,subtree:true});
    if (!resize) {
      win.addEventListener?.('resize',schedule);
      root.ownerDocument?.addEventListener?.('fullscreenchange',schedule);
    }
    sync();
    return () => {
      if (!active) return;
      active = false;observer.disconnect();resize?.disconnect();restore();
      if (!resize) {
        win.removeEventListener?.('resize',schedule);
        root.ownerDocument?.removeEventListener?.('fullscreenchange',schedule);
      }
    };
  }

  // Transition copies live in their own shadow roots. Parent styles do not
  // cross that boundary, even though the header-height variable is inherited.
  function attachTransitionStyles(root, win) {
    const text = css + '\n.root:has(> .hm-screen) { overflow: visible !important; }';
    let sheet = null, active = true;
    try { sheet = new win.CSSStyleSheet(); sheet.replaceSync(text); } catch {}
    const mounted = new Map();
    function remove(layer, entry) {
      if (sheet) entry.root.adoptedStyleSheets = entry.root.adoptedStyleSheets.filter(s => s !== sheet);
      else entry.node?.remove();
      mounted.delete(layer);
    }
    function sync() {
      if (!active) return;
      for (const [layer, entry] of mounted) if (!layer.isConnected) remove(layer, entry);
      for (const layer of root.querySelectorAll('.gf-leave, .gf-hold')) {
        const sr = layer.shadowRoot;
        if (!sr) continue;
        if (sheet) {
          if (!sr.adoptedStyleSheets.includes(sheet)) sr.adoptedStyleSheets = [...sr.adoptedStyleSheets, sheet];
          mounted.set(layer, {root: sr});
        } else {
          let entry = mounted.get(layer);
          if (!entry) {
            const node = root.ownerDocument.createElement('style');
            node.textContent = text;
            entry = {root: sr, node}; mounted.set(layer, entry);
          }
          if (!sr.contains(entry.node)) sr.appendChild(entry.node);
        }
      }
    }
    const observer = new win.MutationObserver(sync);
    observer.observe(root, {childList: true, subtree: true});
    sync();
    return () => {
      active = false; observer.disconnect();
      for (const [layer, entry] of mounted) remove(layer, entry);
    };
  }

  function start({ window: win, document: doc, marinara: api }) {
    if (!api?.onCleanup) throw new Error('스토리 투명화 확장을 전체 페이지 접근 권한으로 실행하세요.');
    win[KEY]?.dispose();
    let disposed = false, sheet = null;
    const mounted = new Map(), watchers = new Map();
    try { sheet = new win.CSSStyleSheet(); sheet.replaceSync(css); } catch { sheet = null; }

    function mount(host) {
      const root = host.shadowRoot;
      if (!root || mounted.has(host)) return;
      const stopBackdrop = attachHomeBackdrop(root,win), stopCalm = attachCalmEntries(root,win);
      const stopTransitions = attachTransitionStyles(root,win);
      const cleanupBackdrop = () => { stopTransitions();stopBackdrop();stopCalm(); };
      if (sheet && 'adoptedStyleSheets' in root) {
        try {
          root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
          mounted.set(host, () => { cleanupBackdrop();root.adoptedStyleSheets = root.adoptedStyleSheets.filter(item => item !== sheet); });
          return;
        } catch { /* Older engines fall back to a scoped style node. */ }
      }
      const style = doc.createElement('style');
      style.setAttribute('data-gf-story-glass', '');
      style.textContent = css;
      let active = true;
      const restore = () => { if (!disposed && active && !root.contains(style)) root.appendChild(style); };
      const observer = new win.MutationObserver(restore);
      observer.observe(root, { childList: true });
      restore();
      mounted.set(host, () => { active = false; observer.disconnect(); style.remove();cleanupBackdrop(); });
    }

    function prune() {
      for (const [host, cleanup] of mounted) if (!host.isConnected) { cleanup(); mounted.delete(host); }
      for (const [scope, observer] of watchers) if (scope.host && !scope.host.isConnected) { observer.disconnect(); watchers.delete(scope); }
    }
    function watch(scope) {
      if (watchers.has(scope)) return;
      const observer = new win.MutationObserver(records => {
        if (disposed) return;
        for (const record of records) for (const node of record.addedNodes) if (node.nodeType === 1) visit(node);
        prune();
      });
      observer.observe(scope, { childList: true, subtree: true });
      watchers.set(scope, observer);
    }
    function visit(node) {
      if (node.tagName === TAG) { mount(node); return; }
      if (node.shadowRoot) { watch(node.shadowRoot); visit(node.shadowRoot); }
      for (const child of node.children || []) visit(child);
    }
    function dispose() {
      if (disposed) return;
      disposed = true;
      for (const observer of watchers.values()) observer.disconnect();
      watchers.clear();
      for (const cleanup of mounted.values()) cleanup();
      mounted.clear();
      if (win[KEY]?.dispose === dispose) delete win[KEY];
    }
    win[KEY] = { dispose };
    api.onCleanup(dispose);
    watch(doc);
    visit(doc);
    win.customElements?.whenDefined(TAG.toLowerCase()).then(() => { if (!disposed) visit(doc); });
    return dispose;
  }
  return { start, css, attachHomeBackdrop, attachCalmEntries, attachTransitionStyles, screenKey };
});

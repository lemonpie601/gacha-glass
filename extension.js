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
      background: rgba(6, 10, 16, 0.7) !important;
      background: color-mix(in srgb, var(--ink-2, #060a10) 70%, transparent) !important;
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
  `;

  function attachHomeBackdrop(root, win) {
    if (typeof root.querySelector !== 'function') return () => {};
    const property = '--gf-story-glass-bar-height';
    let active = true, pending = false, stage = null, bar = null, previous = '', priority = '';
    const resize = win.ResizeObserver ? new win.ResizeObserver(measure) : null;
    function restore() {
      if (!stage) return;
      if (previous) stage.style.setProperty(property, previous, priority);
      else stage.style.removeProperty(property);
    }
    function measure() {
      if (!active || !stage) return;
      const value = (bar?.offsetHeight || 0) + 'px';
      if (stage.style.getPropertyValue(property) !== value) stage.style.setProperty(property,value);
    }
    function sync() {
      if (!active) return;
      const nextStage = root.querySelector('.hm-screen')?.closest('.gf-stage') || null;
      const nextBar = nextStage?.querySelector(':scope > .gf-bar') || null;
      if (stage !== nextStage || bar !== nextBar) {
        resize?.disconnect();restore();stage = nextStage;bar = nextBar;
        previous = stage?.style.getPropertyValue(property) || '';
        priority = stage?.style.getPropertyPriority(property) || '';
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

  function start({ window: win, document: doc, marinara: api }) {
    if (!api?.onCleanup) throw new Error('스토리 투명화 확장을 전체 페이지 접근 권한으로 실행하세요.');
    win[KEY]?.dispose();
    let disposed = false, sheet = null;
    const mounted = new Map(), watchers = new Map();
    try { sheet = new win.CSSStyleSheet(); sheet.replaceSync(css); } catch { sheet = null; }

    function mount(host) {
      const root = host.shadowRoot;
      if (!root || mounted.has(host)) return;
      const cleanupBackdrop = attachHomeBackdrop(root,win);
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
  return { start, css, attachHomeBackdrop };
});

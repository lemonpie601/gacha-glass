const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=path.resolve(__dirname,'../extension.js');
const extension=fs.existsSync(source)?require(source):{};
function fixture({constructable=true}={}) {
  const observers=[];const cleanups=[];
  class Observer {constructor(callback){this.callback=callback;observers.push(this);}observe(target){this.target=target;}disconnect(){this.disconnected=true;}}
  const doc={nodeType:9,children:[],createElement:tag=>element(tag)};
  const element=tag=>({nodeType:1,tagName:tag.toUpperCase(),children:[],ownerDocument:doc,isConnected:true,attrs:{},setAttribute(name,value){this.attrs[name]=value;},appendChild(child){this.children.push(child);child.parentNode=this;return child;},contains(child){return this.children.includes(child);},remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(node=>node!==this);this.parentNode=null;}});
  const shadow=host=>({nodeType:11,host,children:[],ownerDocument:doc,...(constructable?{adoptedStyleSheets:[]}:{}),appendChild(child){this.children.push(child);child.parentNode=this;return child;},contains(child){return this.children.includes(child);}});
  const host=element('marinara-capability-gacha-forge');host.shadowRoot=shadow(host);doc.children=[host];
  const win={MutationObserver:Observer,...(constructable?{CSSStyleSheet:class {replaceSync(css){this.css=css;}}}:{})};
  const api={onCleanup:fn=>cleanups.push(fn)};
  return {doc,win,api,host,element,shadow,observers,cleanups};
}
function start(f){assert.equal(typeof extension.start,'function');return extension.start({document:f.doc,window:f.win,marinara:f.api});}
test('installs only on Gacha Forge and preserves existing adopted sheets',()=>{
  const f=fixture(),native={};f.host.shadowRoot.adoptedStyleSheets=[native];const other=f.element('other-game');other.shadowRoot=f.shadow(other);f.doc.children.push(other);
  const dispose=start(f);assert.equal(f.host.shadowRoot.adoptedStyleSheets.length,2);assert.equal(other.shadowRoot.adoptedStyleSheets.length,0);
  dispose();assert.deepEqual(f.host.shadowRoot.adoptedStyleSheets,[native]);
});
test('style survives story rerenders and fullscreen because it stays on the game shadow root',()=>{
  const f=fixture();const dispose=start(f);const own=f.host.shadowRoot.adoptedStyleSheets[0];f.host.shadowRoot.children=[];
  assert.equal(f.host.shadowRoot.adoptedStyleSheets[0],own);assert.match(own.css,/\.vn-scene::before/);assert.match(own.css,/\.vn-scene::after/);dispose();
});
test('a second activation replaces its own instance without duplicate styles',()=>{
  const f=fixture();const old=start(f),current=start(f);assert.equal(f.host.shadowRoot.adoptedStyleSheets.length,1);
  old();assert.equal(f.host.shadowRoot.adoptedStyleSheets.length,1);current();assert.equal(f.host.shadowRoot.adoptedStyleSheets.length,0);
});
test('discovers a later game mount inside another open shadow root',()=>{
  const f=fixture();f.doc.children=[];const dispose=start(f),outer=f.element('app-shell');outer.shadowRoot=f.shadow(outer);outer.shadowRoot.children=[f.host];
  f.observers[0].callback([{addedNodes:[outer]}]);assert.equal(f.host.shadowRoot.adoptedStyleSheets.length,1);dispose();assert.ok(f.observers.every(observer=>observer.disconnected));
});
test('handles a game tag upgraded after the extension starts',async()=>{
  const f=fixture();delete f.host.shadowRoot;let define;
  f.win.customElements={whenDefined:()=>new Promise(resolve=>{define=resolve;})};
  const dispose=start(f);f.host.shadowRoot=f.shadow(f.host);define();await Promise.resolve();
  assert.equal(f.host.shadowRoot.adoptedStyleSheets.length,1);dispose();
});
test('unmounting the game releases its styles and cleanup prevents later reattachment',()=>{
  const f=fixture();const dispose=start(f);f.host.isConnected=false;f.observers[0].callback([{addedNodes:[]}]);
  assert.equal(f.host.shadowRoot.adoptedStyleSheets.length,0);dispose();f.host.isConnected=true;f.observers[0].callback([{addedNodes:[f.host]}]);
  assert.equal(f.host.shadowRoot.adoptedStyleSheets.length,0);
});
test('fallback style is restored after a game rerender and removed on extension cleanup',()=>{
  const f=fixture({constructable:false});start(f);const root=f.host.shadowRoot;assert.equal(root.children.length,1);const style=root.children[0];
  root.children=[];style.parentNode=null;const observer=f.observers.find(observer=>observer.target===root);observer.callback([{addedNodes:[]}]);assert.equal(root.children[0],style);
  f.cleanups[0]();assert.equal(root.children.length,0);observer.callback([{addedNodes:[]}]);assert.equal(root.children.length,0);
});
test('background is 40% transparent while text, controls and images are not faded',()=>{
  assert.equal(typeof extension.css,'string');assert.match(extension.css,/var\(--ink[^)]*\)\s+60%/);assert.doesNotMatch(extension.css,/(?:^|[;{\s])opacity\s*:/);
  assert.doesNotMatch(extension.css,/\.vn-(?:text|tool|who|bg)\s*\{/);
});
test('home styling removes scrims and scopes translucent home controls and header to the home screen',()=>{
  assert.match(extension.css,/\.hm-screen\s+\.hm-scrim/);assert.match(extension.css,/\.hm-screen\s+\.hm-art::after/);
  for(const selector of ['.hm-tile','.hm-side','.hm-cta','.hm-slot-bg','.hm-chat'])assert.ok(extension.css.includes('.hm-screen '+selector),selector);
  assert.match(extension.css,/\.gf-stage:has\(> \.gf-view \.hm-screen\) > \.gf-bar/);
  assert.doesNotMatch(extension.css,/(?:^|[;}])\s*(?:button|\.gf-bar)\s*\{/,'must not change all buttons or headers across views');
});
test('header styling targets native controls without selecting arbitrary extension buttons',()=>{
  assert.doesNotMatch(extension.css,/:is\(button\s*,/);
  assert.doesNotMatch(extension.css,/>\s*\.gf-bar\s+button:focus-visible/);
  assert.match(extension.css,/:is\(\.currency, \.command, \.icon-button, \.gf-guide-q\)/);
});
test('resize observations reuse the current bar and unrelated button insertion triggers no layout scan',async()=>{
  const f=fixture();let queries=0;const callbacks=[],values=new Map(),listeners=[];
  const stage={style:{getPropertyValue:name=>values.get(name)||'',getPropertyPriority:()=>'',setProperty:(name,value)=>values.set(name,value),removeProperty:name=>values.delete(name)},querySelector:()=>bar};
  const bar={offsetHeight:70},home={closest:()=>stage},root={ownerDocument:{addEventListener:type=>listeners.push(type)},querySelector:()=>{queries++;return home;}};
  f.win.addEventListener=type=>listeners.push(type);
  f.win.ResizeObserver=class {constructor(callback){callbacks.push(callback);}observe(){}disconnect(){}};
  const cleanup=extension.attachHomeBackdrop(root,f.win);const initial=queries;
  callbacks[0]();callbacks[0]();assert.equal(queries,initial,'bar resize must not rediscover the screen');assert.deepEqual(listeners,[],'ResizeObserver replaces global resize listeners');
  const widgetButton={nodeType:1,matches:()=>false,querySelector:()=>null};
  f.observers[0].callback([{target:{},addedNodes:[widgetButton],removedNodes:[]}]);await Promise.resolve();assert.equal(queries,initial,'unrelated widget buttons must not scan layout');
  const newScreen={nodeType:1,matches:()=>true};f.observers[0].callback([{target:{},addedNodes:[newScreen],removedNodes:[]}]);await Promise.resolve();assert.equal(queries,initial+1);
  cleanup();
});
test('home backdrop follows the measured header without moving controls and restores its own variable',()=>{
  assert.equal(typeof extension.attachHomeBackdrop,'function');
  const f=fixture();let height=72;const values=new Map(),bar={get offsetHeight(){return height;}},observers=[];
  const stage={style:{getPropertyValue:name=>values.get(name)||'',getPropertyPriority:()=>'',setProperty:(name,value)=>values.set(name,value),removeProperty:name=>values.delete(name)},querySelector:()=>bar};
  const home={closest:()=>stage},root={ownerDocument:{},querySelector:()=>home};
  f.win.ResizeObserver=class {constructor(callback){this.callback=callback;observers.push(this);}observe(target){this.target=target;}disconnect(){this.disconnected=true;}};
  const cleanup=extension.attachHomeBackdrop(root,f.win);
  assert.equal(values.get('--gf-story-glass-bar-height'),'72px');height=108;observers[0].callback();assert.equal(values.get('--gf-story-glass-bar-height'),'108px');
  cleanup();assert.equal(values.has('--gf-story-glass-bar-height'),false);assert.ok(observers[0].disconnected);assert.ok(f.observers.every(observer=>observer.disconnected));
});
test('leaving home restores the previous variable and queued measurements stop after disable',async()=>{
  const f=fixture();let atHome=true;const property='--gf-story-glass-bar-height',values=new Map([[property,'23px']]);
  const bar={offsetHeight:80},stage={style:{getPropertyValue:name=>values.get(name)||'',getPropertyPriority:()=>'',setProperty:(name,value)=>values.set(name,value),removeProperty:name=>values.delete(name)},querySelector:()=>bar};
  const home={closest:()=>stage},root=f.host.shadowRoot;root.querySelector=()=>atHome?home:null;
  const dispose=start(f),observer=f.observers.find(item=>item.target===root);assert.equal(values.get(property),'80px');
  atHome=false;observer.callback([{target:root,addedNodes:[],removedNodes:[]}]);await Promise.resolve();assert.equal(values.get(property),'23px');
  atHome=true;observer.callback([{target:root,addedNodes:[],removedNodes:[]}]);dispose();await Promise.resolve();assert.equal(values.get(property),'23px');
  assert.equal(root.adoptedStyleSheets.length,0);assert.ok(f.observers.every(item=>item.disconnected));
});

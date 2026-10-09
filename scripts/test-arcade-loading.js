const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const moduleUrl=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');

// Event, frame and timer queues run on the CPU. No browser/renderer/server is used.
class Surface {
  constructor(){this.listeners=new Map();this.attrs=new Map();this.classes=new Set();this.children=[];this.hidden=false;this.dataset={};this.style={};this.textContent='';
    this.style.setProperty=(name,value)=>{this.style[name]=value;};
    this.classList={add:(...items)=>items.forEach(i=>this.classes.add(i)),remove:(...items)=>items.forEach(i=>this.classes.delete(i)),
      contains:i=>this.classes.has(i),toggle:(i,on)=>{if(on)this.classes.add(i);else this.classes.delete(i);}};}
  addEventListener(type,fn){if(!this.listeners.has(type))this.listeners.set(type,new Set());this.listeners.get(type).add(fn);}
  removeEventListener(type,fn){this.listeners.get(type)?.delete(fn);}
  emit(type,values={}){const e={type,target:this,currentTarget:this,button:0,defaultPrevented:false,preventDefault(){this.defaultPrevented=true;},stopImmediatePropagation(){},...values};for(const fn of this.listeners.get(type)||[])fn(e);return e;}
  setAttribute(name,value){this.attrs.set(name,String(value));}removeAttribute(name){this.attrs.delete(name);}
  append(...children){this.children.push(...children);children.forEach(c=>{c.parent=this;});}remove(){if(this.parent)this.parent.children=this.parent.children.filter(c=>c!==this);}focus(){this.focused=true;}setPointerCapture(){}
  querySelector(selector){return selector==='canvas'?this.canvas:null;}
  getBoundingClientRect(){return this.rect||{bottom:80};}
}
function scheduler(reduced=false){
  let next=1;const frames=new Map(),timers=new Map();
  return {frames,timers,options:{requestFrame:fn=>{const id=next++;frames.set(id,fn);return id;},cancelFrame:id=>frames.delete(id),
    setTimer:(fn,ms)=>{const id=next++;timers.set(id,{fn,ms});return id;},clearTimer:id=>timers.delete(id),reducedMotion:()=>reduced},
    async flush(){for(let i=0;i<8;i++)await Promise.resolve();},
    async frame(){await this.flush();const queued=[...frames.values()];frames.clear();queued.forEach(fn=>fn(100));await this.flush();},
    expire(){const queued=[...timers.values()];timers.clear();queued.forEach(({fn})=>fn());},
    async until(check){for(let i=0;i<40;i++){await this.flush();if(check())return;await this.frame();}assert.fail('CPU loading queue did not reach expected state');},
  };
}
async function run(){
  const {createLoadingScreen}=await import(moduleUrl(fs.readFileSync(path.join(root,'assets/arcade-loading.js'),'utf8')));
  for(const reduced of [false,true]){
    const q=scheduler(reduced),rootNode=new Surface(),status=new Surface(),steps=Array.from({length:4},()=>new Surface());
    const screen=createLoadingScreen({root:rootNode,status,steps},q.options);screen.begin();
    const waiting=screen.stage(1,'Building scene');await q.frame();screen.cancel();assert.equal(await waiting,false);assert.equal(q.frames.size,0);
    screen.begin();const stage=screen.stage(2,'Preparing graphics');await q.frame();assert.equal(steps[2].classList.contains('is-current'),true);await q.frame();assert.equal(await stage,true);
    screen.finish();assert.equal(status.textContent,'Ready');assert.equal(rootNode.hidden,reduced);
    if(!reduced){assert.equal(q.timers.size,1);screen.begin();assert.equal(q.timers.size,0);q.expire();assert.equal(rootNode.hidden,false,'Old fade timer cannot hide a fresh load');}
    screen.dispose();assert.equal(q.frames.size,0);assert.equal(q.timers.size,0);
  }
  const {catalog,navigation}=await require('./load-arcade-modules')();
  const {createCabinetGame,placeCabinetScreen}=await import(moduleUrl(fs.readFileSync(path.join(root,'assets/arcade-cabinet.js'),'utf8')));
  const {createCabinetSession}=await import(moduleUrl(fs.readFileSync(path.join(root,'assets/arcade-session.js'),'utf8')));
  const {screenProjection}=await import(moduleUrl(fs.readFileSync(path.join(root,'assets/arcade-screen-projection.js'),'utf8')));
  const codex=require('../codex-link-contract');
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  assert(!/id="(?:welcome|explore)"/.test(html),'Entry has no welcome panel or mandatory Explore button');
  assert(/id="load-status"[^>]*role="status"[^>]*aria-live="polite"/.test(html));
  assert(/id="scene-container" aria-busy="true"/.test(html));
  const original=fs.readFileSync(process.env.ARCADE_APP_SOURCE||path.join(root,'assets/arcade-app.js'),'utf8');
  const source=original.replace(/^import .*;\s*$/gm,'')
    .replace("import('./vendor/three.module.js')",'__loadEngine()')
    .replace("import('./arcade-scene.js')",'Promise.resolve({createArcadeScene:__createScene})')
    .replace("import('./arcade-controller.js')",'Promise.resolve({createArcadeController:__createController})')+
    '\nwindow.testApp={initialize,navigate,dispose,openDirectory,showHelp,startExplore,inspect,playCabinet,returnToScene,get state(){return {mode,failed,pending:!!pending,hasController:!!controller,controllerActive:!!controller?.active,selected,playing:cabinetGame.active};}};';
  function harness({failure=null,holdEngine=false,reduced=false,handoff=false}={}){
    const q=scheduler(reduced),nodes=new Map(),steps=Array.from({length:4},()=>new Surface()),win=new Surface(),doc=new Surface();
    for(const match of html.matchAll(/\bid="([^"]+)"/g))nodes.set(match[1],new Surface());
    const get=id=>nodes.get(id),stats={engines:0,renderers:0,worlds:0,compiles:0,controllers:0,resumes:0,captures:0,worldDisposals:0,rendererDisposals:0,contextLosses:0,controllerDisposals:0,reloads:0,navigations:[],stages:[],handoffReady:0,handoffFails:0,restoredCabinets:0};
    const values=new Map(),storage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
    const location={hostname:'pazneria.github.io',href:'https://pazneria.github.io/arcade/',assign(destination){stats.navigations.push({destination,state:win.testApp.state,frames:q.frames.size,timers:q.timers.size,canvas:!!get('scene-container').canvas});},reload(){stats.reloads++;}};
    const focus=el=>{el.focus=()=>{el.focused=true;doc.activeElement=el;};return el;};nodes.forEach(focus);win.scrollTo=(x,y)=>{stats.scroll=[x,y];};
    Object.assign(doc,{hidden:false,body:new Surface(),documentElement:new Surface(),hasFocus:()=>true,getElementById:get,createElement:type=>{const el=focus(new Surface());if(type==='iframe')el.contentWindow=new Surface();return el;},querySelectorAll:selector=>selector==='.loading-steps li'?steps:[]});
    win.ArcadeCodexLinks=codex;
    const observers=new Set(),navigationObservers=new Set();let handoffActive=handoff,fade=0;
    class Observer {constructor(callback){this.callback=callback;}observe(){observers.add(this);}disconnect(){observers.delete(this);}}
    class NavigationObserver {constructor(callback){this.callback=callback;}observe(){navigationObservers.add(this);}disconnect(){navigationObservers.delete(this);}}
    const finishHandoff=()=>{handoffActive=false;q.options.clearTimer(fade);fade=0;for(const observer of [...observers])observer.callback();};
    if(handoff)win.pazneriaRoomHandoff={room:'arcade',camera:'default-entry-v1',get active(){return handoffActive;},
      ready(){stats.handoffReady++;assert.equal(stats.compiles,1);assert.equal(stats.controllers,1);assert.equal(stats.resumes,0,'First matching frame precedes input');assert.equal(stats.restoredCabinets,0,'Matching frame keeps default camera');if(reduced)finishHandoff();else fade=q.options.setTimer(finishHandoff,160);},
      fail(){stats.handoffFails++;finishHandoff();}};
    let resolveEngine;const held=new Promise(resolve=>{resolveEngine=resolve;});
    class Renderer {
      constructor(){if(failure==='renderer')throw Error('Injected renderer failure');stats.renderers++;this.domElement=new Surface();this.disposed=false;}
      initTexture(){assert.equal(get('load-status').textContent,'Preparing graphics');}
      compile(){stats.compiles++;if(failure==='compile')throw Error('Injected compile failure');}
      dispose(){if(!this.disposed){stats.rendererDisposals++;this.disposed=true;}}forceContextLoss(){stats.contextLosses++;}
    }
    const engine={WebGLRenderer:Renderer};
    const context={window:win,document:doc,location,sessionStorage:storage,innerWidth:1280,matchMedia:()=>({matches:false}),console:{warn(){}},
      buildArcadeCatalog:catalog.buildArcadeCatalog,...navigation,
      createCabinetGame:options=>createCabinetGame({...options,document:doc},q.options),placeCabinetScreen,createCabinetSession,screenProjection,
      createCabinetMenu:()=>({enabled:false,mount(){},update(){},dispose(){},cancel(){},focus(){},ready(){},error(){}}),createTokenEntry:()=>{throw Error('Fixture has no token geometry');},
      createLoadingScreen:elements=>createLoadingScreen(elements,q.options),
      __loadEngine:()=>{stats.engines++;if(failure==='import')return Promise.reject(Error('Injected import failure'));return holdEngine?held:Promise.resolve(engine);},
      __createScene(renderer){assert.equal(get('load-status').textContent,'Building scene');stats.worlds++;let disposed=false;return {scene:{},camera:{},textures:[{}],dispose(){if(!disposed){stats.worldDisposals++;disposed=true;}}};},
      __createController(THREE,renderer,world,options){stats.controllers++;let disposed=false;const canvas=renderer.domElement;get('scene-container').canvas=canvas;
        canvas.focus=()=>{canvas.focused=true;if(!doc.hidden)doc.hasFocus=()=>true;};
        const c={active:false,resume(options){if(doc.hidden||!doc.hasFocus())return;this.active=true;stats.resumes++;if(options)stats.freeLook=options.freeLook;},pause(){this.active=false;},capture(){stats.captures++;},focusGame(){stats.restoredCabinets++;this.pause();},returnToAisle(){stats.aisleReturns=(stats.aisleReturns||0)+1;},
          dispose(){if(disposed)return;disposed=true;this.pause();stats.controllerDisposals++;world.dispose();renderer.dispose();renderer.forceContextLoss();get('scene-container').canvas=null;}};
        if(failure==='first-render'){c.dispose();throw Error('Injected first-render failure');}return c;
      },MutationObserver:Observer,ResizeObserver:NavigationObserver};
    vm.runInNewContext(source,context,{filename:'arcade-app-cpu-fixture.js'});
    return {q,get,stats,win,doc,storage,app:win.testApp,observers,navigationObservers,finishHandoff,releaseEngine:()=>resolveEngine(engine),resize:width=>{context.innerWidth=width;win.emit('resize');},
      async ready(){await q.until(()=>this.app.state.mode==='explore'||this.app.state.mode==='inspect'||this.app.state.failed);},
      async stage(label){await q.until(()=>get('load-status').textContent===label);},};
  }
  {
    const h=harness();await h.ready();h.app.inspect(0);assert.equal(h.doc.activeElement,h.get('cabinet-play'),'Initial inspection still puts the primary action in reach');
    const next=h.get('cabinet-next');next.focus();
    for(let i=1;i<=6;i++){next.emit('click');assert.equal(h.app.state.selected,i%6);assert.equal(h.doc.activeElement,next,'Repeated keyboard activation keeps browsing instead of landing on Play');assert.equal(h.app.state.mode,'inspect');}
    const previous=h.get('cabinet-previous');previous.focus();previous.emit('click');assert.equal(h.app.state.selected,5);assert.equal(h.doc.activeElement,previous);
    assert(/id="cabinet-title"[^>]*aria-live="polite"/.test(html),'The newly selected game is announced without stealing button focus');
  }
  {
    const h=harness();await h.ready();h.app.inspect(0);h.app.playCabinet();assert.match(h.get('game-load-message').textContent,/Opening RaceGPT/);assert.equal(h.get('game-opening').hidden,false);assert.equal(h.get('game-retry').hidden,true);
    const opening=h.get('game-frame').children[0];assert.equal(h.doc.activeElement,h.get('game-back'),'Opening keeps an immediate keyboard escape in the host');assert.equal(opening.inert,true);h.q.expire();assert.match(h.get('game-load-message').textContent,/taking longer/);assert.equal(h.get('game-retry').hidden,false);assert.equal(h.get('game-frame').attrs.get('aria-busy'),'true');
    h.get('game-retry').emit('click');const retry=h.get('game-frame').children[0];assert.notEqual(retry,opening);assert.equal(opening.src,'about:blank');assert.equal(h.get('game-frame').children.length,1);assert.equal(retry.src,'https://pazneria.github.io/racegpt/');
    retry.emit('load');await h.q.flush();assert.equal(h.get('game-opening').hidden,true);assert.equal(h.get('game-frame').attrs.get('aria-busy'),'false');assert.equal(h.q.timers.size,0);assert.equal(h.doc.activeElement,retry);assert.equal(retry.inert,false);
    h.app.returnToScene();assert.equal(h.get('game-frame').children.length,0);assert.equal(h.get('game-opening').hidden,true);assert.equal(h.q.timers.size,0);assert.equal(h.app.state.controllerActive,true);
    h.app.inspect(0);h.app.playCabinet();const another=h.get('game-frame').children[0];h.get('game-full-page').focus();another.emit('load');await h.q.flush();assert.equal(h.doc.activeElement,h.get('game-full-page'),'A late load cannot steal focus from another control');
    h.app.returnToScene();h.app.inspect(0);h.app.playCabinet();const canceled=h.get('game-frame').children[0];h.win.emit('keydown',{code:'Escape'});assert.equal(h.get('game-frame').children.length,0);assert.equal(h.q.timers.size,0);canceled.emit('load');assert.equal(h.app.state.mode,'explore','Late load cannot undo an early Escape');
  }
  {
    const h=harness();await h.ready();assert.equal(h.navigationObservers.size,1);h.get('site-nav').rect={bottom:164};h.navigationObservers.forEach(observer=>observer.callback());assert.equal(h.doc.documentElement.style['--site-nav-bottom'],'164px');
    h.app.openDirectory();assert.deepEqual(h.stats.scroll,[0,0]);assert.equal(h.doc.activeElement,h.get('directory-title'));
    const cards=h.get('fallback-grid').children;assert.equal(cards.length,6);const view=cards[2].children[2].children[0];assert.equal(view.hidden,false);assert.equal(view.attrs.get('aria-label'),'View Sword Guys cabinet');
    view.emit('click');assert.equal(h.app.state.mode,'inspect');assert.equal(h.app.state.selected,2);assert.equal(h.doc.activeElement,h.get('cabinet-play'));assert.equal(h.stats.navigations.length,0,'Directory selection stays in the host');
    const launch=cards[2].children[2].children[1];assert.equal(launch.target,'_blank');assert.equal(launch.rel,'noopener');assert.equal(launch.href,'https://pazneria.github.io/sword-guys/');
    h.win.emit('pagehide');assert.equal(h.navigationObservers.size,0);h.win.emit('pageshow',{persisted:true});await h.ready();assert.equal(h.navigationObservers.size,1,'Back restores one observer');await h.app.navigate('/');assert.equal(h.navigationObservers.size,0);
  }
  {
    const h=harness();await h.ready();assert.equal(h.app.state.mode,'explore');assert.equal(h.stats.resumes,1);assert.equal(h.stats.captures,0,'Automatic entry never requests pointer lock');
    assert.equal(h.get('scene-container').attrs.get('aria-busy'),'false');assert.equal(h.get('load-status').textContent,'Ready');
    h.get('open-controls').emit('click');assert.equal(h.app.state.mode,'help');assert.equal(h.get('controls').hidden,false);assert.equal(h.q.timers.size,0,'Help cancels a pending loading fade');
    h.win.emit('keydown',{code:'Escape',repeat:true});assert.equal(h.app.state.mode,'help','Held Escape cannot repeatedly close and reopen help');
    const escape=h.win.emit('keydown',{code:'Escape'});assert(escape.defaultPrevented);assert.equal(h.app.state.mode,'explore');assert.equal(h.stats.captures,0);
    h.get('open-games').emit('click');assert.equal(h.app.state.mode,'directory');h.get('return-to-3d').emit('click');assert.equal(h.app.state.mode,'explore');assert.equal(h.stats.controllers,1);
    await h.app.navigate('/');assert.equal(h.stats.navigations[0].destination,'/');assert.equal(h.stats.navigations[0].canvas,false);assert.equal(h.stats.navigations[0].frames,0);assert.equal(h.stats.navigations[0].timers,0);
    assert.equal(h.get('scene-loading').hidden,false,'Navigation covers the released canvas');assert.equal(h.stats.controllerDisposals,1);
  }
  for(const failure of ['import','renderer','compile','first-render']){
    const h=harness({failure});await h.ready();assert.equal(h.app.state.failed,true);assert.equal(h.app.state.mode,'directory');assert.equal(h.app.state.pending,false);assert.equal(h.app.state.hasController,false);
    assert.equal(h.get('retry-loading').hidden,false);assert.match(h.get('directory-message').textContent,/Retry/);assert.equal(h.q.frames.size,0);assert.equal(h.q.timers.size,0);
    if(['compile','first-render'].includes(failure)){assert.equal(h.stats.worldDisposals,1);assert.equal(h.stats.rendererDisposals,1);assert.equal(h.stats.contextLosses,1);}
    h.get('retry-loading').emit('click');assert.equal(h.stats.reloads,1);assert.equal(h.get('scene-loading').hidden,false);assert.equal(h.app.state.hasController,false);
  }
  {
    const h=harness({holdEngine:true});await h.q.until(()=>h.stats.engines===1);h.win.emit('pagehide');h.releaseEngine();for(let i=0;i<6;i++)await h.q.frame();
    assert.equal(h.stats.renderers,0,'Cancelled imports cannot create resources after leaving');assert.equal(h.q.frames.size,0);
  }
  {
    const h=harness();await h.stage('Preparing graphics');await h.app.navigate('/library/');for(let i=0;i<8;i++)await h.q.frame();
    assert.equal(h.stats.compiles,0);assert.equal(h.stats.controllers,0);assert.equal(h.stats.worldDisposals,1);assert.equal(h.stats.rendererDisposals,1);assert.equal(h.stats.contextLosses,1);
  }
  {
    const h=harness();await h.stage('Opening Arcade');h.get('open-games').emit('click');assert.equal(h.stats.controllerDisposals,1);assert.equal(h.app.state.mode,'directory');assert.equal(h.q.frames.size,0);
    h.get('return-to-3d').emit('click');await h.ready();assert.equal(h.stats.controllers,2);assert.equal(h.stats.resumes,1);assert.equal(h.app.state.mode,'explore');
  }
  {
    const h=harness({holdEngine:true,reduced:true});await h.q.until(()=>h.stats.engines===1);h.win.emit('pagehide');h.win.emit('pageshow',{persisted:true});h.releaseEngine();await h.ready();
    assert.equal(h.stats.controllers,1,'Restored page constructs one fresh controller');assert.equal(h.get('scene-loading').hidden,true);assert.equal(h.q.timers.size,0);
  }
  {
    const h=harness();h.storage.setItem('arcade:return-state:v1',JSON.stringify({cabinetIndex:2,savedAt:Date.now()}));await h.ready();
    assert.equal(h.app.state.mode,'inspect');assert.equal(h.app.state.selected,2);assert.equal(h.stats.resumes,0,'Game Back retains its cabinet selection');
  }
  for(const reduced of [false,true]){
    const h=harness({handoff:true,reduced});const remembered=JSON.stringify({cabinetIndex:2,savedAt:Date.now()});
    h.storage.setItem('arcade:return-state:v1',remembered);h.storage.setItem('arcade:preferences','unchanged');
    await h.q.until(()=>h.stats.handoffReady===1);
    assert.equal(h.get('scene-loading').hidden,true,'Handoff reveals no normal loading indicator');
    if(!reduced){assert.equal(h.app.state.mode,'loading');assert.equal(h.stats.resumes,0);assert.equal(h.get('scene-container').inert,true);h.win.emit('focus');assert.equal(h.stats.resumes,0);h.q.expire();}
    await h.ready();assert.equal(h.app.state.mode,'explore');assert.equal(h.stats.restoredCabinets,0);assert.equal(h.stats.captures,0);
    assert.equal(h.get('scene-container').canvas.focused,true,'Scene receives focus only after cover removal');assert.equal(h.get('site-nav').inert,false);assert.equal(h.observers.size,0);
    assert.equal(h.storage.getItem('arcade:return-state:v1'),remembered);assert.equal(h.storage.getItem('arcade:preferences'),'unchanged');
    h.win.emit('pagehide');h.win.emit('pageshow',{persisted:true});await h.ready();assert.equal(h.app.state.mode,'inspect');assert.equal(h.stats.handoffReady,1,'Back cannot replay the one-shot handoff');
  }
  for(const failure of ['import','renderer','compile','first-render']){
    const h=harness({handoff:true,failure});await h.ready();assert.equal(h.stats.handoffReady,0);assert.equal(h.stats.handoffFails,1);assert.equal(h.get('site-nav').inert,false);assert.equal(h.get('retry-loading').hidden,false);assert.equal(h.observers.size,0);
  }
  {
    const h=harness({handoff:true,holdEngine:true});await h.q.until(()=>h.stats.engines===1);h.win.emit('pagehide');h.releaseEngine();for(let i=0;i<6;i++)await h.q.frame();
    assert.equal(h.stats.handoffFails,1);assert.equal(h.stats.renderers,0);assert.equal(h.observers.size,0);assert.equal(h.get('site-nav').inert,false);
  }
  {
    const h=harness({handoff:true});await h.q.until(()=>h.stats.handoffReady===1);await h.app.navigate('/');await h.q.flush();
    assert.equal(h.stats.resumes,0,'A cancelled fade cannot resume disposed controls');assert.equal(h.stats.controllerDisposals,1);assert.equal(h.q.timers.size,0);assert.equal(h.observers.size,0);
  }
  {
    const h=harness({handoff:true});await h.q.until(()=>h.stats.handoffReady===1);h.doc.hidden=true;h.doc.hasFocus=()=>false;h.q.expire();await h.q.flush();
    assert.equal(h.app.state.mode,'paused');assert.equal(h.app.state.controllerActive,false);assert.equal(h.get('scene-container').canvas.focused,undefined,'Hidden reveal defers focus');
    h.doc.hidden=false;h.doc.emit('visibilitychange');assert.equal(h.app.state.mode,'paused','An unfocused visible page waits for focus');
    h.doc.hasFocus=()=>true;h.win.emit('focus');await h.ready();assert.equal(h.app.state.controllerActive,true);assert.equal(h.stats.resumes,1);assert.equal(h.get('scene-container').canvas.focused,true);assert.equal(h.stats.captures,0);
  }
  {
    const h=harness({handoff:true,holdEngine:true});await h.q.until(()=>h.stats.engines===1);h.finishHandoff();assert.equal(h.get('site-nav').inert,false);h.releaseEngine();await h.ready();assert.equal(h.stats.resumes,1);assert.equal(h.stats.handoffReady,0,'Accessibility removal does not reveal a second cover');
  }
  {
    const h=harness();await h.ready();h.app.inspect(0);h.get('cabinet-play').emit('click');
    assert.equal(h.app.state.mode,'inserting');assert.equal(h.app.state.controllerActive,false);assert.equal(h.app.state.playing,true);assert.equal(h.get('game-frame').children.length,1);assert.equal(h.stats.navigations.length,0);
    const frame=h.get('game-frame').children[0];frame.emit('load');await h.q.flush();assert.equal(h.app.state.mode,'play');frame.contentWindow.emit('keydown',{code:'Escape'});
    assert.equal(h.app.state.mode,'explore');assert.equal(h.get('game-frame').children.length,0);assert.equal(h.stats.freeLook,true);assert.equal(h.stats.captures,0,'Escape restores window mouse look without trapping the pointer');
    h.app.inspect(2);h.app.playCabinet();h.get('game-back').emit('click',{isTrusted:true});assert.equal(h.stats.captures,1,'Explicit trusted Back requests lock in its gesture');assert.equal(h.app.state.controllerActive,true);assert.equal(h.stats.aisleReturns,2);
    for(const change of ['help','directory','hidden','pagehide']) {
      h.app.inspect(1);h.app.playCabinet();assert.equal(h.get('game-frame').children.length,1);
      if(change==='help')h.app.showHelp();if(change==='directory')h.app.openDirectory();if(change==='hidden'){h.doc.hidden=true;h.doc.emit('visibilitychange');}if(change==='pagehide')h.win.emit('pagehide');
      assert.equal(h.get('game-frame').children.length,0,`${change} removes the unused game document`);h.doc.hidden=false;
    }
  }
  {
    const h=harness();await h.ready();h.app.inspect(0);h.app.playCabinet();const frame=h.get('game-frame').children[0];frame.emit('load');await h.q.flush();
    const remove=frame.remove.bind(frame);frame.remove=()=>{remove();h.doc.hasFocus=()=>false;};
    frame.contentWindow.emit('keydown',{code:'Escape'});
    assert.equal(h.app.state.mode,'explore','Removing a focused game restores canvas focus before the controller resumes');assert.equal(h.app.state.controllerActive,true);assert.equal(h.doc.hasFocus(),true);assert.equal(h.stats.captures,0);
    h.app.inspect(0);h.app.playCabinet();h.doc.hidden=true;h.doc.hasFocus=()=>false;h.app.returnToScene();assert.equal(h.app.state.mode,'paused');assert.equal(h.app.state.controllerActive,false,'A hidden return cannot restart rendering');
  }
  {
    const h=harness();await h.ready();h.app.inspect(1);h.app.playCabinet();const frame=h.get('game-frame').children[0];frame.emit('load');await h.q.flush();
    h.storage.setItem('game-owned-save','keep');assert.equal(h.doc.body.dataset.gameExpanded,'true','Ready opens the deliberate playable viewport without moving the camera');h.get('game-expand').emit('click');h.get('game-expand').emit('click');
    assert.equal(h.doc.body.dataset.gameExpanded,'true');assert.equal(h.get('game-expand').textContent,'Fit to cabinet');assert.equal(h.get('game-expand').attrs.get('aria-pressed'),'true');
    assert.equal(h.get('game-frame').children[0],frame,'Expansion retains the exact current game document');assert.equal(h.app.state.controllerActive,false);assert.equal(h.storage.getItem('game-owned-save'),'keep');
    h.get('game-expand').emit('click');assert.equal(h.doc.body.dataset.gameExpanded,'false');assert.equal(h.get('game-frame').children[0],frame);
    h.get('game-expand').emit('click');h.resize(390);assert.equal(h.get('game-expand').hidden,false);assert.equal(h.doc.body.dataset.gameExpanded,'true');assert.equal(h.get('game-frame').children[0],frame,'Narrow resizing preserves a playable viewport and the existing game');
    h.resize(1280);assert.equal(h.get('game-expand').hidden,false);h.get('game-expand').emit('click');h.app.returnToScene();assert.equal(h.doc.body.dataset.gameExpanded,'false');assert.equal(h.get('game-frame').children.length,0);
  }
  {
    const h=harness();await h.ready();h.app.inspect(0);const event=h.get('cabinet-play').emit('click',{ctrlKey:true});assert.equal(event.defaultPrevented,false);assert.equal(h.app.state.playing,false,'Modified Play preserves normal full-page links');
    h.app.playCabinet();await h.app.navigate('https://pazneria.github.io/racegpt/',0);assert.equal(h.get('game-frame').children.length,0);assert.equal(h.stats.navigations[0].canvas,false);assert.equal(h.stats.controllerDisposals,1,'Full page disposes the paused Arcade before navigation');
  }
  console.log('Arcade CPU loading, handoff/input gating, cabinet play/return/cleanup, fallback/retry and navigation ownership checks passed.');
}
if(require.main===module)run().catch(error=>{console.error(error);process.exitCode=1;});

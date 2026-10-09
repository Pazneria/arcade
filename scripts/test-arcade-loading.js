const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const moduleUrl=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');

// Event, frame and timer queues run on the CPU. No browser/renderer/server is used.
class Surface {
  constructor(){this.listeners=new Map();this.attrs=new Map();this.classes=new Set();this.children=[];this.hidden=false;this.dataset={};this.textContent='';
    this.classList={add:(...items)=>items.forEach(i=>this.classes.add(i)),remove:(...items)=>items.forEach(i=>this.classes.delete(i)),
      contains:i=>this.classes.has(i),toggle:(i,on)=>{if(on)this.classes.add(i);else this.classes.delete(i);}};}
  addEventListener(type,fn){if(!this.listeners.has(type))this.listeners.set(type,new Set());this.listeners.get(type).add(fn);}
  removeEventListener(type,fn){this.listeners.get(type)?.delete(fn);}
  emit(type,values={}){const e={target:this,currentTarget:this,button:0,defaultPrevented:false,preventDefault(){this.defaultPrevented=true;},...values};for(const fn of this.listeners.get(type)||[])fn(e);return e;}
  setAttribute(name,value){this.attrs.set(name,String(value));}removeAttribute(name){this.attrs.delete(name);}
  append(...children){this.children.push(...children);}focus(){this.focused=true;}setPointerCapture(){}
  querySelector(selector){return selector==='canvas'?this.canvas:null;}
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
  const codex=require('../codex-link-contract');
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  assert(!/id="(?:welcome|explore)"/.test(html),'Entry has no welcome panel or mandatory Explore button');
  assert(/id="load-status"[^>]*role="status"[^>]*aria-live="polite"/.test(html));
  assert(/id="scene-container" aria-busy="true"/.test(html));
  const original=fs.readFileSync(path.join(root,'assets/arcade-app.js'),'utf8');
  const source=original.replace(/^import .*;\s*$/gm,'')
    .replace("import('./vendor/three.module.js')",'__loadEngine()')
    .replace("import('./arcade-scene.js')",'Promise.resolve({createArcadeScene:__createScene})')
    .replace("import('./arcade-controller.js')",'Promise.resolve({createArcadeController:__createController})')+
    '\nwindow.testApp={initialize,navigate,dispose,openDirectory,showHelp,startExplore,get state(){return {mode,failed,pending:!!pending,hasController:!!controller,selected};}};';
  function harness({failure=null,holdEngine=false,reduced=false}={}){
    const q=scheduler(reduced),nodes=new Map(),steps=Array.from({length:4},()=>new Surface()),win=new Surface(),doc=new Surface();
    for(const match of html.matchAll(/\bid="([^"]+)"/g))nodes.set(match[1],new Surface());
    const get=id=>nodes.get(id),stats={engines:0,renderers:0,worlds:0,compiles:0,controllers:0,resumes:0,captures:0,worldDisposals:0,rendererDisposals:0,contextLosses:0,controllerDisposals:0,reloads:0,navigations:[],stages:[]};
    const values=new Map(),storage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
    const location={hostname:'pazneria.github.io',href:'https://pazneria.github.io/arcade/',assign(destination){stats.navigations.push({destination,state:win.testApp.state,frames:q.frames.size,timers:q.timers.size,canvas:!!get('scene-container').canvas});},reload(){stats.reloads++;}};
    Object.assign(doc,{hidden:false,body:new Surface(),hasFocus:()=>true,getElementById:get,createElement:()=>new Surface(),querySelectorAll:selector=>selector==='.loading-steps li'?steps:[]});
    win.ArcadeCodexLinks=codex;
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
      createLoadingScreen:elements=>createLoadingScreen(elements,q.options),
      __loadEngine:()=>{stats.engines++;if(failure==='import')return Promise.reject(Error('Injected import failure'));return holdEngine?held:Promise.resolve(engine);},
      __createScene(renderer){assert.equal(get('load-status').textContent,'Building scene');stats.worlds++;let disposed=false;return {scene:{},camera:{},textures:[{}],dispose(){if(!disposed){stats.worldDisposals++;disposed=true;}}};},
      __createController(THREE,renderer,world,options){stats.controllers++;let disposed=false;const canvas=renderer.domElement;get('scene-container').canvas=canvas;
        const c={active:false,resume(){this.active=true;stats.resumes++;},pause(){this.active=false;},capture(){stats.captures++;},focusGame(){this.pause();},
          dispose(){if(disposed)return;disposed=true;this.pause();stats.controllerDisposals++;world.dispose();renderer.dispose();renderer.forceContextLoss();get('scene-container').canvas=null;}};
        if(failure==='first-render'){c.dispose();throw Error('Injected first-render failure');}return c;
      },};
    vm.runInNewContext(source,context,{filename:'arcade-app-cpu-fixture.js'});
    return {q,get,stats,win,doc,storage,app:win.testApp,releaseEngine:()=>resolveEngine(engine),
      async ready(){await q.until(()=>this.app.state.mode==='explore'||this.app.state.mode==='inspect'||this.app.state.failed);},
      async stage(label){await q.until(()=>get('load-status').textContent===label);},};
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
  console.log('Arcade CPU loading stages, direct entry, fallback/retry, fade cancellation and navigation ownership checks passed.');
}
if(require.main===module)run().catch(error=>{console.error(error);process.exitCode=1;});

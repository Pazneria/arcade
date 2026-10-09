const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
class Surface {
  constructor(){this.listeners=new Map();this.attrs={};this.children=[];this.style={};this.dataset={};}
  addEventListener(type,fn){if(!this.listeners.has(type))this.listeners.set(type,new Set());this.listeners.get(type).add(fn);}
  removeEventListener(type,fn){this.listeners.get(type)?.delete(fn);}
  emit(type,event={}){for(const fn of [...(this.listeners.get(type)||[])])fn(event);}
  setAttribute(key,value){this.attrs[key]=value;}
  append(child){child.parent=this;this.children.push(child);}
  remove(){this.parent.children=this.parent.children.filter(child=>child!==this);}
  focus(){this.focused=true;}
  get count(){return [...this.listeners.values()].reduce((count,set)=>count+set.size,0);}
}
(async()=>{
  const {createCabinetGame,placeCabinetScreen}=await import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync(path.join(root,'assets/arcade-cabinet.js'),'utf8')).toString('base64'));
  const host=new Surface(),created=[];let escapes=0;
  const doc={baseURI:'https://pazneria.github.io/arcade/',createElement(type){assert.equal(type,'iframe');const frame=new Surface();frame.contentWindow=new Surface();created.push(frame);return frame;}};
  const game=createCabinetGame({host,document:doc,onEscape:()=>{escapes++;game.stop();}});
  assert.equal(game.start({comingSoon:true}),false);assert.equal(game.start({url:'javascript:alert(1)'}),false);assert.equal(host.children.length,0);
  assert(game.start({name:'RaceGPT',url:'https://pazneria.github.io/racegpt/'}));
  const first=created[0];assert.equal(first.src,'https://pazneria.github.io/racegpt/');assert.equal(first.title,'RaceGPT game');assert.equal(first.focused,undefined);assert.equal(first.inert,true,'An opening frame cannot take input behind the cover');
  assert.deepEqual(first.attrs,{allow:'fullscreen',allowfullscreen:''},'No camera/microphone/storage-changing sandbox or credential grants');
  first.emit('load');assert.equal(first.focused,true);assert.equal(first.inert,false);assert.equal(first.contentWindow.count,2);first.emit('load');assert.equal(first.contentWindow.count,2,'Repeated loads replace both child listeners');
  let prevented=0,stopped=0;const escape={code:'Escape',preventDefault(){prevented++;},stopImmediatePropagation(){stopped++;}};
  first.contentWindow.emit('keydown',{...escape,repeat:true});assert.equal(escapes,0);
  first.contentWindow.emit('keydown',escape);assert.equal(escapes,1);assert.equal(prevented,2);assert.equal(stopped,2);assert.equal(host.children.length,0);assert.equal(first.contentWindow.count,0);assert.equal(first.count,0);assert.equal(first.src,'about:blank');
  game.stop();assert.equal(game.active,false);
  game.start({name:'Sword Guys',url:'http://localhost:5179/'});const second=created[1];
  Object.defineProperty(second,'contentWindow',{get(){throw Error('Cross origin');}});assert.doesNotThrow(()=>second.emit('load'));
  game.start({name:'OSRS Clone',url:'https://pazneria.github.io/osrs-clone/'});assert.equal(host.children.length,1,'Switching games removes the old document');assert.equal(second.src,'about:blank');
  game.stop();assert.equal(host.children.length,0);assert(created.every(frame=>frame.count===0));
  game.start({name:'Redirecting owned game',url:'https://pazneria.github.io/racegpt/'});
  const redirecting=created.at(-1),child=redirecting.contentWindow;redirecting.emit('load');assert.equal(child.count,2);
  child.removeEventListener=()=>{throw Error('WindowProxy became cross-origin');};
  Object.defineProperty(redirecting,'contentWindow',{get(){throw Error('Cross origin');}});
  assert.doesNotThrow(()=>redirecting.emit('load'),'A redirect cannot abort load cleanup');
  assert.doesNotThrow(()=>game.stop());assert.equal(game.active,false);assert.equal(host.children.length,0);
  game.start({name:'Another redirect',url:'https://pazneria.github.io/racegpt/'});const final=created.at(-1);final.emit('load');
  final.contentWindow.removeEventListener=()=>{throw Error('Cross origin on Back');};assert.doesNotThrow(()=>game.stop(),'Back still removes the frame if child-listener removal fails');assert.equal(final.src,'about:blank');assert.equal(host.children.length,0);
  game.start({name:'Game consuming Escape keydown',url:'https://pazneria.github.io/racegpt/'});const consuming=created.at(-1);consuming.emit('load');
  consuming.contentWindow.emit('keyup',escape);assert.equal(escapes,2,'Escape release returns even when a game consumed keydown');assert.equal(host.children.length,0);assert.equal(consuming.contentWindow.count,0);
  const timers=new Map(),states=[];let nextTimer=0;
  const recovery=createCabinetGame({host,document:doc,onEscape(){},onState:phase=>states.push(phase)},{setTimer(fn,ms){const id=++nextTimer;timers.set(id,{fn,ms});return id;},clearTimer:id=>timers.delete(id)});
  recovery.start({name:'Slow game',url:'https://pazneria.github.io/racegpt/'});const slow=created.at(-1);
  assert.equal(recovery.phase,'opening');assert.equal(timers.size,1);assert.equal([...timers.values()][0].ms,10000,'Recovery threshold is bounded; not a fake progress clock');
  const firstWait=[...timers.values()][0].fn;timers.clear();firstWait();assert.equal(recovery.phase,'delayed');assert.equal(host.children.length,1,'A slow opening can keep waiting without restarting');
  slow.emit('load');assert.equal(recovery.phase,'loaded');assert.equal(timers.size,0);
  recovery.start({name:'Error game',url:'https://pazneria.github.io/sword-guys/'});const broken=created.at(-1),oldWait=[...timers.values()][0].fn;
  broken.emit('error');assert.equal(recovery.phase,'error');assert.equal(timers.size,0);
  recovery.start({name:'Retried game',url:'https://pazneria.github.io/sword-guys/'});const retried=created.at(-1);assert.equal(broken.src,'about:blank');assert.equal(broken.count,0);assert.equal(host.children.length,1);
  oldWait();assert.equal(recovery.phase,'opening','An old timeout cannot change a replacement frame');assert.equal(timers.size,1);
  retried.emit('load');assert.equal(recovery.phase,'loaded');assert.equal(timers.size,0);recovery.stop();assert.equal(recovery.phase,'idle');assert.equal(host.children.length,0);
  assert.deepEqual(states,['opening','delayed','loaded','idle','opening','error','idle','opening','loaded','idle']);
  const element=new Surface();placeCabinetScreen(element,{left:10,top:90,width:320,height:400});assert.equal(element.dataset.screenAligned,'true');assert.equal(element.style.width,'320px');
  placeCabinetScreen(element,{left:NaN,top:0,width:320,height:400});assert.equal(element.dataset.screenAligned,'false');assert.equal(element.style.width,'');
  console.log('Arcade CPU cabinet game lifecycle, child Escape, unchanged URLs and screen layout checks passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});

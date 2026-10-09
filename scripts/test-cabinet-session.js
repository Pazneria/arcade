const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const load=file=>import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync(path.join(root,file),'utf8')).toString('base64'));
class Surface {
  constructor(){this.listeners=new Map();this.children=[];this.attrs={};this.style={};this.dataset={};}
  addEventListener(type,fn){if(!this.listeners.has(type))this.listeners.set(type,new Set());this.listeners.get(type).add(fn);}
  removeEventListener(type,fn){this.listeners.get(type)?.delete(fn);}
  emit(type,event={}){for(const fn of [...this.listeners.get(type)||[]])fn({currentTarget:this,...event});}
  append(child){this.children.push(child);child.parent=this;}
  remove(){this.parent.children=this.parent.children.filter(c=>c!==this);}
  setAttribute(name,value){this.attrs[name]=value;}
  focus(){this.doc.activeElement=this;}
}
async function run(){
  const {createCabinetGame,placeCabinetScreen}=await load('assets/arcade-cabinet.js');
  const {createCabinetSession}=await load('assets/arcade-session.js');
  const {createEntrySession}=await load('assets/token-entry/entry-session.js');
  const {screenProjection}=await load('assets/arcade-screen-projection.js');
  const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
  const url={name:'RaceGPT',url:'https://pazneria.github.io/racegpt/?track=technical-bowl'};
  function fixture(){
    const view=new Surface(),host=new Surface(),back=new Surface(),doc={defaultView:view,baseURI:'https://pazneria.github.io/arcade/',hidden:false,hasFocus:()=>true,activeElement:null};
    doc.createElement=()=>{const frame=new Surface();frame.doc=doc;frame.contentWindow=new Surface();frame.messages=[];frame.contentWindow.postMessage=(data,origin)=>frame.messages.push({data,origin});return frame;};back.doc=doc;
    const timers=new Map(),states=[],events=[];let timer=0;
    const game=createCabinetGame({host,document:doc,onState:s=>states.push(s),onEscape(){}},{setTimer:fn=>{timers.set(++timer,fn);return timer;},clearTimer:id=>timers.delete(id)});
    const token=createEntrySession();
    const session=createCabinetSession({game,tokenFor:()=>token,onStart:()=>{events.push('start');back.focus();},onReady:()=>events.push('ready'),onError:()=>events.push('error')});
    return {host,back,doc,view,game,token,session,states,events,timers};
  }
  for(const order of ['document-first','token-first']){
    const h=fixture(),launch=h.session.start(url),frame=h.host.children[0];
    assert.equal(h.session.start(url),launch,'Repeated Start shares one current launch');assert.equal(h.host.children.length,1);assert(frame.inert);
    if(order==='document-first'){frame.emit('load');await flush();assert(frame.inert);assert.equal(h.game.phase,'prepared');h.token.update(.92);}
    else{h.token.update(.92);await flush();assert(frame.inert);assert.equal(h.token.state.phase,'waiting');frame.emit('load');}
    assert.equal(await launch,true);assert.equal(h.game.phase,'loaded');assert.equal(frame.inert,false);assert.equal(h.doc.activeElement,frame);assert.deepEqual(h.events,['start','ready']);
    h.session.cancel();assert.equal(h.host.children.length,0);assert.equal(h.timers.size,0);
  }
  {
    const h=fixture(),signal=new AbortController(),launch=h.session.start(url,{signal:signal.signal});const old=h.host.children[0];
    signal.abort();old.emit('load');h.token.update(1);assert.equal(await launch,false);assert.deepEqual(h.events,['start']);assert.equal(h.host.children.length,0);
    const fresh=h.session.start(url),frame=h.host.children[0];old.emit('load');frame.emit('load');h.token.update(.92);assert.equal(await fresh,true);assert.equal(frame.src,url.url);h.session.cancel();
  }
  {
    const h=fixture(),launch=h.session.start(url);h.host.children[0].emit('error');assert.equal(await launch,false);assert.deepEqual(h.events,['start','error']);assert.equal(h.host.children.length,0);assert.equal(h.timers.size,0);
    const retry=h.session.start(url),frame=h.host.children[0];frame.emit('load');h.token.update(.92);assert.equal(await retry,true);h.session.cancel();
  }
  {
    const h=fixture(),launch=h.session.start(url),frame=h.host.children[0];const other=new Surface();other.doc=h.doc;other.focus();
    frame.emit('load');h.token.update(.92);await launch;assert.equal(h.doc.activeElement,other,'Late completion preserves explicit focus movement');h.session.cancel();
  }
  const bridged={...url,nativeBridge:'racegpt-v1'};
  function reply(h,frame,type,overrides={}){
    const query=new URL(frame.src).searchParams;
    h.view.emit('message',{origin:'https://pazneria.github.io',source:frame.contentWindow,data:{type:'racegpt:cabinet:'+type,version:1,session:query.get('arcadeSession'),trackId:query.get('track')},...overrides});
  }
  for(const order of ['native-first','document-first']){
    const h=fixture(),launch=h.session.start(bridged),frame=h.host.children[0],query=new URL(frame.src).searchParams;
    assert.equal(query.get('arcadeStart'),'1');assert.equal(query.get('arcadeParentOrigin'),'https://pazneria.github.io');
    reply(h,frame,'ready',{origin:'https://wrong.example'});reply(h,frame,'ready',{source:{}});
    reply(h,frame,'ready',{data:{type:'racegpt:cabinet:ready',version:1,session:'stale',trackId:'technical-bowl'}});
    if(order==='native-first'){reply(h,frame,'ready');await flush();assert.equal(h.game.phase,'opening');frame.emit('load');}
    else{frame.emit('load');await flush();assert.equal(h.game.phase,'opening','Document load alone cannot release an unready native engine');reply(h,frame,'ready');}
    await flush();assert.equal(h.game.phase,'prepared');assert(!frame.messages.some(m=>m.data.type==='racegpt:cabinet:start'));
    h.token.update(.92);await flush();assert(frame.inert);assert.deepEqual(h.events,['start']);
    assert.equal(frame.messages.filter(m=>m.data.type==='racegpt:cabinet:start').length,1,'Countdown starts only after both barriers');
    assert.equal(h.session.start(bridged),launch);reply(h,frame,'started');assert.equal(await launch,true);assert.equal(frame.inert,false);assert.deepEqual(h.events,['start','ready']);
    h.session.cancel();assert.equal(h.view.listeners.get('message').size,0);assert.equal(h.timers.size,0);
  }
  {
    const h=fixture(),launch=h.session.start(bridged),frame=h.host.children[0];frame.emit('load');reply(h,frame,'ready');h.token.update(.92);await flush();
    h.session.cancel();reply(h,frame,'started');assert.equal(await launch,false);assert.deepEqual(h.events,['start']);
    const retry=h.session.start(bridged),fresh=h.host.children[0];reply(h,frame,'ready');fresh.emit('load');await flush();assert.equal(h.game.phase,'opening');
    reply(h,fresh,'ready');h.token.update(.92);await flush();reply(h,fresh,'started');assert.equal(await retry,true);h.session.cancel();
  }
  for(const stage of ['boot','start']){
    const h=fixture(),launch=h.session.start(bridged),frame=h.host.children[0];
    if(stage==='start'){frame.emit('load');reply(h,frame,'ready');h.token.update(.92);await flush();}
    reply(h,frame,'error');assert.equal(await launch,false);assert.deepEqual(h.events,['start','error']);assert.equal(h.host.children.length,0);assert.equal(h.timers.size,0);
  }
  const quad=[{x:120,y:90},{x:380,y:110},{x:90,y:350},{x:410,y:390}],map=screenProjection(quad,800,600),surface=new Surface();
  assert(map);assert.equal(map.uv(0,0),null);assert.equal(screenProjection([{x:0,y:0},{x:0,y:0},{x:0,y:0},{x:0,y:0}]),null);
  for(let u=.05;u<1;u+=.1)for(let v=.05;v<1;v+=.1){const p=map.point(u,v),uv=map.uv(p.x,p.y);assert(Math.abs(uv.u-u)<1e-9&&Math.abs(uv.v-v)<1e-9);}
  placeCabinetScreen(surface,{quad,aspect:4/3},screenProjection);assert.equal(surface.dataset.screenProjected,'true');assert.equal(surface.style.transform,map.css);
  console.log('Cabinet CPU session checks passed: barrier orders, native engine/start handshake, source/origin/session checks, repeats, cancel/stale loads, errors/retry, focus and projective targeting.');
}
run().catch(error=>{console.error(error);process.exitCode=1;});

const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),url=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
async function run(){
  const track=url(fs.readFileSync(path.join(root,'assets/cabinet-menu/track-art.js'),'utf8'));
  const menu=url(fs.readFileSync(path.join(root,'assets/cabinet-menu/racegpt-menu.js'),'utf8').replace("'./track-art.js'",JSON.stringify(track)));
  const {MENU_HOTSPOTS,CANCEL_HOTSPOT}=await import(menu);
  const source=fs.readFileSync(path.join(root,'assets/arcade-menu.js'),'utf8').replace("'./cabinet-menu/racegpt-menu.js'",JSON.stringify(menu));
  const {createCabinetMenu}=await import(url(source));
  let focus=null,starts=0,cancels=0,backs=0,draws=0;
  class Node {
    constructor(){this.listeners=new Map();this.children=[];this.style={};this.dataset={};this.attrs={};}
    addEventListener(t,fn){this.listeners.set(t,fn);}setAttribute(k,v){this.attrs[k]=v;}
    append(n){this.children.push(n);n.parent=this;}remove(){this.parent.children=this.parent.children.filter(c=>c!==this);}
    focus(){focus=this;this.listeners.get('focus')?.();}click(event={}){this.listeners.get('click')?.(event);}
  }
  const gradient={addColorStop(){}},ctx=new Proxy({measureText:s=>({width:s.length*15}),createLinearGradient:()=>gradient,createRadialGradient:()=>gradient,
    fillRect(){draws++;}},{get:(obj,key)=>obj[key]||(()=>{})});
  const canvas={width:1280,height:960,getContext:()=>ctx},hotspots=new Node(),native=new Node();
  globalThis.matchMedia=()=>({matches:true});
  let backEvent;
  const display=createCabinetMenu({canvas,hotspots,native,document:{createElement:()=>new Node()},onStart:(selection,attempt)=>{starts++;assert.equal(selection.trackId,display.state.trackId);assert(attempt.signal);},onCancel:()=>cancels++,onBack:event=>{backs++;backEvent=event;}});
  display.mount({name:'RaceGPT'});assert.equal(native.hidden,true);assert.equal(hotspots.children.length,6);display.focus();assert.equal(focus.dataset.action,'start');
  for(const r of MENU_HOTSPOTS){const button=hotspots.children.find(b=>b.dataset.action===r.id);assert.equal(button.style.left,r.u*100+'%');assert.equal(button.style.top,r.v*100+'%');assert.equal(button.style.width,r.width*100+'%');assert.equal(button.style.height,r.height*100+'%');}
  const startRegion=MENU_HOTSPOTS.find(r=>r.id==='start'),start=focus;
  display.pointer({u:startRegion.u+startRegion.width/2,v:startRegion.v+startRegion.height/2,type:'move'});assert.equal(focus,start,'Hover does not rebuild or steal the native focused control');
  const key={code:'ArrowRight',preventDefault(){this.defaultPrevented=true;}};display.key(key);assert.equal(display.state.index,1);assert(key.defaultPrevented);assert.equal(focus,start);
  start.click();start.click();assert.equal(starts,1);assert.equal(display.state.phase,'loading');
  const cancel=hotspots.children.find(b=>b.dataset.action==='cancel');assert.equal(cancel.hidden,false);
  display.focus();assert.equal(focus,cancel,'Loading keyboard focus stays on the visible physical Cancel target');
  assert.equal(cancel.style.top,CANCEL_HOTSPOT.v*100+'%');assert(startRegion.v+startRegion.height<CANCEL_HOTSPOT.v,'Repeated Start cannot hit the separate Cancel target');
  cancel.click();assert.equal(cancels,1);assert.equal(display.state.phase,'menu');
  start.click();const attempt=display.state.requestId;assert(display.error(attempt,'failure'));assert.equal(display.state.phase,'error');assert.equal(start.hidden,false);
  start.click();assert(display.ready(display.state.requestId));assert.equal(display.state.phase,'playing');display.cancel();
  const trustedBack={type:'click',isTrusted:true,button:0};hotspots.children.find(b=>b.dataset.action==='back').click(trustedBack);assert.equal(backs,1);assert.equal(backEvent,trustedBack,'Physical Back retains the actual gesture for optional look capture');
  display.update(.016,1200);assert(draws>0,'Adapter invokes the actual renderer without a browser');
  const launch=new URL(display.launchUrl('https://pazneria.github.io/racegpt/?from=arcade&autoplay=1',{trackId:'technical-bowl'}));assert.equal(launch.searchParams.get('track'),'technical-bowl');assert.equal(launch.searchParams.get('from'),'arcade');assert(!launch.searchParams.has('autoplay'));
  display.mount({name:'Sword Guys'});assert.equal(native.hidden,false);assert.equal(canvas.hidden,true);assert.equal(hotspots.children.length,0);display.dispose();
  const {createApprovedCabinetArt,HOTSPOTS}=await import(url(fs.readFileSync(path.join(root,'assets/cabinet-menu/approved-art.js'),'utf8')));
  const art=createApprovedCabinetArt({loadImage:async src=>({src})});await art.ready;
  const approvedHotspots=new Node();let approvedStarts=0;
  ctx.drawImage=()=>draws++;
  const approved=createCabinetMenu({canvas,hotspots:approvedHotspots,native,art,document:{createElement:()=>new Node()},onStart:()=>approvedStarts++,onCancel(){},onBack(){assert.fail('Approved screen has no Leave target');}});
  approved.mount({name:'RaceGPT'});assert.equal(approvedHotspots.children.length,5);assert(!approvedHotspots.children.some(b=>['back','cancel'].includes(b.dataset.action)));
  for(const r of HOTSPOTS){const button=approvedHotspots.children.find(b=>b.dataset.action===r.id);assert.equal(button.style.left,r.u*100+'%');assert.equal(button.style.width,r.width*100+'%');}
  approved.pointer({u:HOTSPOTS[1].u,v:HOTSPOTS[1].v+.01,type:'move'});assert.equal(approved.state.hover,HOTSPOTS[1].id,'Shared quarter edge resolves to the same right-hand native target');
  approvedHotspots.children[2].click();assert.equal(approved.state.trackId,'technical-bowl');approved.focus();const approvedStart=focus;
  assert.equal(approved.key({code:'ArrowUp'}),false,'No hidden Leave target is part of keyboard navigation');
  approvedStart.click();approved.focus();assert.equal(focus,approvedStart);assert.equal(approvedStart.attrs['aria-disabled'],'true');approvedStart.click();assert.equal(approvedStarts,1);
  approved.error(approved.state.requestId,'fail');assert.equal(approvedStart.attrs['aria-label'],'Try again');approvedStart.click();assert.equal(approvedStarts,2);approved.cancel();approved.update(0,0);approved.dispose();
  console.log('Cabinet CPU menu adapter checks passed: actual craft renderer, native focus/hotspots, keyboard track choice, repeat/cancel/error/ready and canonical launch query.');
}
run().catch(e=>{console.error(e);process.exitCode=1;});

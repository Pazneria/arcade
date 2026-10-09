const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8').replace(/\r\n/g,'\n');
const source=html.match(/<script id="room-handoff-bootstrap">\n([\s\S]*?)    <\/script>/)?.[1];
assert(source,'Canonical handoff is inline in the early head');
const blob=crypto.createHash('sha1').update(Buffer.from('blob '+Buffer.byteLength(source)+'\0')).update(source).digest('hex');
assert.equal(blob,'846960bd15c10cfb1bcf835173022bc42bcdbd19','Exact pinned canonical source, without a local fork');
assert(html.indexOf('room-handoff-bootstrap')>html.indexOf('<meta name="viewport"'));
assert(html.indexOf('room-handoff-bootstrap')<html.indexOf('<link rel="stylesheet"'));
assert(!/<script[^>]*(?:async|defer|type=)[^>]*id="room-handoff-bootstrap"/.test(html));
assert(!html.includes('<script src="/assets/js/room-handoff.js"'),'No shared script download is required');
const css=fs.readFileSync(path.join(root,'assets/arcade.css'),'utf8');
assert(css.includes('html[data-room-handoff] #scene-loading {visibility:hidden}'));
const KEY='pazneria.room-handoff.v1',now=100000;
const valid={version:1,room:'arcade',path:'/arcade/',image:'https://pazneria.github.io/assets/images/rooms/arcade-entry.jpg',camera:'default-entry-v1',createdAt:now,viewport:{width:1707,height:923}};
class Surface{
  constructor(tag=''){this.tag=tag;this.listeners=new Map();this.children=[];this.attrs={};this.dataset={};}
  addEventListener(type,fn,options){if(!this.listeners.has(type))this.listeners.set(type,new Map());this.listeners.get(type).set(fn,!!options?.once);}
  removeEventListener(type,fn){this.listeners.get(type)?.delete(fn);}
  emit(type,props={}){const event={key:'',defaultPrevented:false,preventDefault(){this.defaultPrevented=true;},stopPropagation(){this.stopped=true;},...props};for(const [fn,once] of [...this.listeners.get(type)||[]]){if(once)this.listeners.get(type).delete(fn);fn(event);}return event;}
  append(...children){for(const child of children){child.parent=this;this.children.push(child);}}appendChild(child){this.append(child);}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(child=>child!==this);this.removed=true;}
  setAttribute(name,value){this.attrs[name]=value;}
  querySelectorAll(tag){return this.children.flatMap(child=>[...(child.tag===tag?[child]:[]),...child.querySelectorAll(tag)]);}
  focus(){this.doc.activeElement=this;}
}
function fixture({record=valid,raw,denied=false,forced=false,reduced=false,body=false,pathname='/arcade/'}={}){
  const window=new Surface(),document=new Surface(),timers=new Map(),observers=new Set(),media=new Map(),navigation=[];let next=1;
  const values=new Map();if(raw!==undefined)values.set(KEY,raw);else if(record!==null)values.set(KEY,JSON.stringify(record));
  const create=tag=>{const node=new Surface(tag);node.doc=document;return node;};
  Object.assign(document,{documentElement:create('html'),head:create('head'),body:body?create('body'):null,createElement:create});
  const storage={getItem(key){if(denied)throw Error('Storage denied');return values.get(key)||null;},removeItem(key){values.delete(key);}};
  Object.assign(window,{sessionStorage:storage,location:{origin:'https://pazneria.github.io',href:'https://pazneria.github.io'+pathname,pathname,assign:url=>navigation.push(url)},
    matchMedia(query){if(!media.has(query)){const surface=new Surface();surface.matches=query.includes('forced-colors')?forced:reduced;media.set(query,surface);}return media.get(query);},
    setTimeout(fn,ms){const id=next++;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id)});
  class Observer{constructor(callback){this.callback=callback;}observe(){observers.add(this);}disconnect(){observers.delete(this);}}
  vm.runInNewContext(source,{window,document,MutationObserver:Observer,URL,Date:{now:()=>now}},{filename:'canonical-room-handoff-cpu.js'});
  return {window,document,timers,observers,values,media,navigation,
    body(){document.body=create('body');for(const observer of [...observers])observer.callback();},
    expire(ms){for(const [id,timer] of [...timers])if(timer.ms===ms){timers.delete(id);timer.fn();}},
    get controls(){return document.body?.children.find(child=>child.className==='pazneria-handoff-controls');}};
}
for(const record of [null,{...valid,version:2},{...valid,camera:'other'},{...valid,createdAt:now-15001},{...valid,createdAt:now+1},{...valid,createdAt:'100000'},{...valid,room:'library'},{...valid,path:'/arcade/other/'},
  ...['https://example.com/assets/images/rooms/arcade-entry.jpg','https://pazneria.github.io/assets/images/rooms/arcade-entry.jpg?q=1','https://pazneria.github.io/assets/images/rooms/arcade-entry.jpg#x','https://user@pazneria.github.io/assets/images/rooms/arcade-entry.jpg','https://pazneria.github.io/assets/images/rooms/lab-entry.jpg'].map(image=>({...valid,image}))]){
  const h=fixture({record});assert.equal(h.window.pazneriaRoomHandoff,undefined);assert.equal(h.document.head.children.length,0);assert.equal(h.timers.size,0);assert.equal(h.values.has(KEY),false);
}
for(const options of [{denied:true},{forced:true},{raw:'{malformed'},{pathname:'/arcade/index.html'}]){const h=fixture(options);assert.equal(h.window.pazneriaRoomHandoff,undefined);assert.equal(h.document.head.children.length,0);}
{
  const h=fixture();assert.equal(h.values.has(KEY),false);assert.equal(h.document.documentElement.dataset.roomHandoff,'loading');assert.equal(h.timers.size,1,'Recovery clock starts before body/modules');
  assert(h.document.head.children[0].textContent.includes('center/cover no-repeat'));h.expire(8000);h.body();
  assert.match(h.controls.children[0].textContent,/retry or go home/);assert.deepEqual(h.controls.querySelectorAll('a').map(a=>a.textContent),['Home / Cancel','Retry']);
  const tab=h.document.emit('keydown',{key:'Tab'});assert(tab.defaultPrevented);assert(h.document.activeElement);
  const escape=h.document.emit('keydown',{key:'Escape'});assert(escape.defaultPrevented);assert.deepEqual(h.navigation,['/']);h.window.emit('pagehide');
  assert.equal(h.window.pazneriaRoomHandoff.active,false);assert.equal(h.document.head.children.length,0);assert.equal(h.document.body.children.length,0);assert.equal(h.observers.size,0);assert.equal(h.timers.size,0);
  assert.equal(h.document.listeners.get('keydown').size,0);assert.equal(h.document.listeners.get('DOMContentLoaded').size,0);
}
for(const reduced of [false,true]){
  const h=fixture({reduced,body:true});assert.equal(h.controls.attrs['aria-modal'],'true');h.window.pazneriaRoomHandoff.ready();
  if(!reduced){assert.equal(h.document.documentElement.dataset.roomHandoff,'ready');assert.equal(h.window.pazneriaRoomHandoff.active,true);h.expire(160);}
  assert.equal(h.window.pazneriaRoomHandoff.active,false);assert.equal(h.document.head.children.length,0);assert.equal(h.timers.size,0);
}
{
  const h=fixture();h.window.pazneriaRoomHandoff.ready();h.body();assert.equal(h.controls,undefined,'Ready before body cannot reinstall controls');h.expire(160);assert.equal(h.timers.size,0);
}
for(const action of ['fail','back','forced']){
  const h=fixture({body:true});if(action==='fail')h.window.pazneriaRoomHandoff.fail();else if(action==='back')h.window.emit('pageshow',{persisted:true});else {const forced=h.media.get('(forced-colors: active)');forced.matches=true;forced.emit('change');}
  assert.equal(h.window.pazneriaRoomHandoff.active,false);assert.equal(h.document.body.children.length,0);assert.equal(h.timers.size,0);assert.equal(h.observers.size,0);
}
console.log('Canonical inline handoff hash, early paint installation, validation, one-shot consumption, accessible recovery and cleanup checks passed on CPU surfaces.');

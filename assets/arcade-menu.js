import {draw,createMenu,createRaceGptLaunchUrl} from './cabinet-menu/racegpt-menu.js';

// Host adapter. The craft module owns presentation/state; these native buttons
// provide browser focus and semantics at the same physical-screen hotspots.
export function createCabinetMenu({canvas,hotspots,native,onStart,onBack,onCancel,onStatus=()=>{},document:doc=globalThis.document}) {
  const buttons=new Map(),ctx=canvas.getContext('2d');
  let menu=null,enabled=false,lastPhase='menu',disposed=false,activationEvent=null;
  function sync(state) {
    if(disposed)return;
    const canceled=lastPhase==='loading'&&state.phase==='menu';lastPhase=state.phase;
    const regions=menu?.getHotspots()||[],ids=new Set(regions.map(r=>r.id));
    for(const [id,button] of buttons)button.hidden=!ids.has(id);
    for(const r of regions){
      let button=buttons.get(r.id);
      if(!button){
        button=doc.createElement('button');button.type='button';button.className='cabinet-hotspot';button.dataset.action=r.id;
        button.textContent=r.label;button.setAttribute('aria-label',r.label);
        button.addEventListener('click',event=>{activationEvent=event;try{menu?.activate(r.id);}finally{activationEvent=null;}});
        button.addEventListener('focus',()=>menu?.pointer({u:r.u+r.width/2,v:r.v+r.height/2,type:'down'}));
        buttons.set(r.id,button);hotspots.append(button);
      }
      button.hidden=false;button.style.left=r.u*100+'%';button.style.top=r.v*100+'%';button.style.width=r.width*100+'%';button.style.height=r.height*100+'%';
      button.setAttribute('aria-pressed',String(state.trackId===r.id));
    }
    onStatus(state);if(canceled)onCancel();
  }
  function mount(game) {
    menu?.dispose();menu=null;buttons.forEach(button=>button.remove());buttons.clear();
    enabled=game?.name==='RaceGPT';canvas.hidden=!enabled;hotspots.hidden=!enabled;native.hidden=enabled;lastPhase='menu';
    if(enabled)menu=createMenu({onStart,onBack:()=>onBack(activationEvent),onChange:sync});
    if(menu)sync(menu.getState());
    return enabled;
  }
  function key(event) {
    if(!enabled||!menu||event.defaultPrevented||event.repeat)return false;
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','KeyA','KeyD'].includes(event.code))return false;
    const handled=menu.key(event);
    if(handled){event.preventDefault();buttons.get(menu.getState().focus)?.focus({preventScroll:true});}
    return handled;
  }
  function update(dt,time){if(enabled&&menu)draw(ctx,{width:canvas.width,height:canvas.height,time,state:menu.getState(),reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches});}
  return {mount,key,update,launchUrl:createRaceGptLaunchUrl,
    focus(){buttons.get(menu?.getState().phase==='loading'?'cancel':'start')?.focus({preventScroll:true});},
    pointer(point){return enabled&&menu?menu.pointer(point):false;},
    start(){return menu?.start();},ready(id){return menu?.ready(id);},error(id,message){return menu?.error(id,message);},
    cancel(){return menu?.cancel();},get enabled(){return enabled;},get state(){return menu?.getState();},
    dispose(){disposed=true;menu?.dispose();buttons.forEach(button=>button.remove());buttons.clear();}
  };
}

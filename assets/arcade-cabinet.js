// Native controls and a single game document on the scene's screen anchor.
// Games retain their own routes and storage. No game code or rendering lives here.
export function createCabinetGame({host,onEscape,onState=()=>{},document:doc=globalThis.document}, {
  setTimer=(callback,ms)=>setTimeout(callback,ms),clearTimer=id=>clearTimeout(id),slowAfterMs=10000,
}={}) {
  let frame=null,removeKeys=null,timer=0,phase='idle',openingFocus=null,releaseAllowed=true,documentLoaded=false,readyResolve=null,readyReject=null;
  function state(next) {if(next===phase)return;phase=next;onState(next);}
  function clearWait() {if(timer)clearTimer(timer);timer=0;}
  function clearKeys() {
    const remove=removeKeys;removeKeys=null;
    try{remove?.();}catch{/* A game may have navigated its WindowProxy cross-origin. */}
  }
  function stop() {
    clearWait();clearKeys();state('idle');openingFocus=null;documentLoaded=false;
    readyResolve?.(false);readyResolve=null;readyReject=null;
    if(!frame)return;
    const owned=frame;frame=null;owned.removeEventListener('load',loaded);owned.removeEventListener('error',failed);
    try{owned.src='about:blank';}finally{owned.remove();}
  }
  function loaded(event) {
    if(!frame||(event?.currentTarget&&event.currentTarget!==frame))return;
    const owned=frame;clearWait();clearKeys();documentLoaded=true;readyResolve?.(true);readyResolve=null;readyReject=null;
    if(!releaseAllowed){state('prepared');return;}
    owned.inert=false;owned.tabIndex=0;state('loaded');
    if(frame!==owned)return;
    try {
      const child=frame?.contentWindow;
      const escape=event=>{if(event.code!=='Escape')return;event.preventDefault();event.stopImmediatePropagation();if(!event.repeat)onEscape();};
      child?.addEventListener('keydown',escape,true);
      // Some games consume Escape at an earlier window capture listener. The
      // release still returns to the aisle; stopping the frame removes both.
      child?.addEventListener('keyup',escape,true);
      removeKeys=()=>{child?.removeEventListener('keydown',escape,true);child?.removeEventListener('keyup',escape,true);};
    }catch{/* Cross-origin local game ports use the persistent Back button. */}
    // A document load is not a promise that its game engine is ready. Give it
    // focus only if opening did not move the user to another host control.
    if(!doc.hidden&&doc.hasFocus?.()!==false&&doc.activeElement===openingFocus)owned.focus();
    openingFocus=null;
  }
  function failed(event) {
    if(!frame||(event?.currentTarget&&event.currentTarget!==frame))return;
    clearWait();readyReject?.(new Error('The game document could not be opened.'));readyResolve=null;readyReject=null;state('error');
  }
  let ready=Promise.resolve(false);
  function start(game,{deferFocus=false}={}) {
    stop();if(game.comingSoon||!game.url)return false;
    let url;try{url=new URL(game.url,doc.baseURI);}catch{return false;}
    if(!['http:','https:'].includes(url.protocol))return false;
    releaseAllowed=!deferFocus;documentLoaded=false;ready=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject;});
    // Consumers may attach after start; avoid an unhandled rejection on an
    // immediate document error while retaining rejection for the barrier.
    ready.catch(()=>{});
    frame=doc.createElement('iframe');frame.title=game.name+' game';frame.inert=true;frame.tabIndex=-1;
    frame.setAttribute('allow','fullscreen');frame.setAttribute('allowfullscreen','');
    frame.addEventListener('load',loaded);frame.addEventListener('error',failed);frame.src=url.href;host.append(frame);
    const owned=frame;state('opening');openingFocus=doc.activeElement;
    timer=setTimer(()=>{if(frame!==owned||phase!=='opening')return;timer=0;state('delayed');},slowAfterMs);
    return true;
  }
  function release(){if(!frame||!documentLoaded)return false;releaseAllowed=true;loaded({currentTarget:frame});return true;}
  return {start,stop,release,get ready(){return ready;},get active(){return !!frame;},get phase(){return phase;}};
}

export function placeCabinetScreen(element,rect,projection=null) {
  if(rect?.quad){
    const map=projection?.(rect.quad,800,800/rect.aspect);
    element.dataset.screenAligned=String(!!map);element.dataset.screenProjected=String(!!map);
    element.style.left='0px';element.style.top='0px';element.style.width=map?map.width+'px':'';element.style.height=map?map.height+'px':'';
    element.style.transform=map?.css||'';element.style.transformOrigin='0 0';
    return map;
  }
  const aligned=rect&&[rect.left,rect.top,rect.width,rect.height].every(Number.isFinite)&&rect.width>70&&rect.height>70;
  element.dataset.screenAligned=String(!!aligned);element.dataset.screenProjected='false';element.style.transform='';
  for(const key of ['left','top','width','height'])element.style[key]=aligned?rect[key]+'px':'';
}

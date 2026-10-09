// Native controls and a single game document on the scene's screen anchor.
// Games retain their own routes and storage. No game code or rendering lives here.
export function createCabinetGame({host,onEscape,document:doc=globalThis.document}) {
  let frame=null,removeKeys=null;
  function clearKeys() {
    const remove=removeKeys;removeKeys=null;
    try{remove?.();}catch{/* A game may have navigated its WindowProxy cross-origin. */}
  }
  function stop() {
    clearKeys();
    if(!frame)return;
    const owned=frame;frame=null;owned.removeEventListener('load',loaded);
    try{owned.src='about:blank';}finally{owned.remove();}
  }
  function loaded() {
    clearKeys();
    try {
      const child=frame?.contentWindow;
      const escape=event=>{if(event.code!=='Escape')return;event.preventDefault();event.stopImmediatePropagation();if(!event.repeat)onEscape();};
      child?.addEventListener('keydown',escape,true);
      removeKeys=()=>child?.removeEventListener('keydown',escape,true);
    }catch{/* Cross-origin local game ports use the persistent Back button. */}
  }
  function start(game) {
    stop();if(game.comingSoon||!game.url)return false;
    const url=new URL(game.url,doc.baseURI);
    if(!['http:','https:'].includes(url.protocol))return false;
    frame=doc.createElement('iframe');frame.title=game.name+' game';
    frame.setAttribute('allow','fullscreen');frame.setAttribute('allowfullscreen','');
    frame.addEventListener('load',loaded);frame.src=url.href;host.append(frame);frame.focus();return true;
  }
  return {start,stop,get active(){return !!frame;}};
}

export function placeCabinetScreen(element,rect) {
  const aligned=rect&&[rect.left,rect.top,rect.width,rect.height].every(Number.isFinite)&&rect.width>70&&rect.height>70;
  element.dataset.screenAligned=String(!!aligned);
  for(const key of ['left','top','width','height'])element.style[key]=aligned?rect[key]+'px':'';
}

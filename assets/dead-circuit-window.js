// Dead Circuit has one dedicated game tab. Other games keep their own launch flow.
export function createDeadCircuitWindow({view=window,location=view.location,onPark=()=>{},onReturn=()=>{},onStatus=()=>{}}={}){
  let child=null,origin=null,session=null,status='idle';
  const emit=value=>{status=value;onStatus(value);};
  function active(){try{return !!child&&!child.closed;}catch{return false;}}
  function destination(game){
    const url=new URL(game.url,location.href);
    const loopback=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
    if(url.username||url.password||!(url.protocol==='https:'||loopback&&url.protocol==='http:'))throw new Error('Game URL is unavailable.');
    url.searchParams.set('from','arcade');url.searchParams.set('arcadeWindow','1');
    url.searchParams.set('arcadeParentOrigin',location.origin);
    url.searchParams.set('arcadeSession',session);
    url.searchParams.set('v','dc-window-20261101-1');
    return url;
  }
  function open(game){
    if(active()){onPark();try{child.focus();}catch{}emit('open');return 'existing';}
    session=view.crypto?.randomUUID?.()||Date.now().toString(36)+Math.random().toString(36).slice(2);
    const url=destination(game);origin=url.origin;
    // This must stay synchronous inside the cabinet's click/keyboard gesture.
    // A retained opener supports Back to Arcade; the destination is our own game.
    try{child=view.open(url.href,'pazneria-dead-circuit');}catch{child=null;}
    onPark();
    if(!child){url.searchParams.set('arcadeWindow','0');emit('blocked');location.assign(url.href);return 'same-tab';}
    emit('open');try{child.focus();}catch{}return 'opened';
  }
  function message(event){
    const d=event.data;
    if(!child||event.source!==child||event.origin!==origin||d?.type!=='dead-circuit:window:return'||d.version!==1||d.session!==session)return;
    child=null;emit('idle');onReturn();
  }
  function focus(){if(child&&!active()&&status!=='idle')emit('idle');}
  view.addEventListener('message',message);view.addEventListener('focus',focus);
  return {open,get active(){return active();},get status(){return status;},dispose(){view.removeEventListener('message',message);view.removeEventListener('focus',focus);}};
}

// One cabinet launch, one inert document, one abortable insertion barrier.
// Game engine readiness is owned by the native game; iframe load is explicitly
// only the host document handoff boundary.
export function createCabinetSession({game,tokenFor=()=>null,onStart=()=>{},onReady=()=>{},onError=()=>{},onCancel=()=>{}}) {
  let current=null,serial=0;
  function clearAttempt(owned){owned.removeSignal?.();owned.removeSignal=null;}
  function cancel(reason='cancel') {
    const owned=current;current=null;
    if(owned){clearAttempt(owned);owned.abort.abort();owned.token?.cancel(reason);}
    game.stop();if(owned)onCancel(reason,owned);
  }
  function start(selection,{signal,requestId=null}={}) {
    if(current)return current.promise;
    const owned={id:++serial,requestId,abort:new AbortController(),token:null,promise:null};
    current=owned;
    if(signal){const stop=()=>cancel('menu');signal.addEventListener('abort',stop,{once:true});owned.removeSignal=()=>signal.removeEventListener('abort',stop);}
    if(signal?.aborted){cancel('menu');return Promise.resolve(false);}
    owned.promise=(async()=>{
      try{
        owned.token=tokenFor(selection);
        onStart(owned);
        if(current!==owned)return false;
        if(!game.start(selection,{deferFocus:true}))throw new Error('This game is unavailable.');
        const preload=()=>game.ready.then(loaded=>{if(!loaded)throw new DOMException('Canceled','AbortError');return true;});
        const result=owned.token?await owned.token.start({signal:owned.abort.signal,preload}):await preload();
        if(current!==owned||owned.abort.signal.aborted||result===false)return false;
        const activated=await game.activate?.();
        if(current!==owned||owned.abort.signal.aborted||activated===false)return false;
        clearAttempt(owned);owned.token?.reset();onReady(owned);
        // A host callback may leave/reselect during its state update.
        if(current!==owned)return false;
        return game.release();
      }catch(error){
        if(current!==owned||owned.abort.signal.aborted)return false;
        current=null;clearAttempt(owned);owned.abort.abort();owned.token?.cancel('error');game.stop();onError(error,owned);return false;
      }
    })();
    return owned.promise;
  }
  return {start,cancel,get current(){return current;},get active(){return !!current;}};
}

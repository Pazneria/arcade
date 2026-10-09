// Real stage changes drive the indicator; no clock-derived progress or percentages.
export function createLoadingScreen({root,status,steps}, {
  requestFrame=callback=>requestAnimationFrame(callback),
  cancelFrame=id=>cancelAnimationFrame(id),
  setTimer=(callback,ms)=>setTimeout(callback,ms),
  clearTimer=id=>clearTimeout(id),
  reducedMotion=()=>matchMedia('(prefers-reduced-motion: reduce)').matches,
}={}) {
  const waits=new Set();let timer=0,epoch=0;
  function cancel() {
    epoch++;if(timer)clearTimer(timer);timer=0;
    for(const wait of waits){cancelFrame(wait.frame);wait.resolve(false);}waits.clear();
  }
  function begin() {
    cancel();root.hidden=false;root.classList.remove('is-ready');root.classList.add('is-loading');
    root.removeAttribute('aria-hidden');status.textContent='Loading engine';
    steps.forEach(step=>{step.classList.remove('is-complete','is-current');});
  }
  function stage(index,label) {
    const token=epoch;status.textContent=label;
    steps.forEach((step,i)=>{step.classList.toggle('is-complete',i<index);step.classList.toggle('is-current',i===index);});
    // Yield two frames so the new stage can paint before synchronous preparation.
    return new Promise(resolve=>{
      const wait={frame:0,resolve};waits.add(wait);
      wait.frame=requestFrame(()=>{
        if(token!==epoch){waits.delete(wait);resolve(false);return;}
        wait.frame=requestFrame(()=>{waits.delete(wait);resolve(token===epoch);});
      });
    });
  }
  function hide() {cancel();root.hidden=true;root.setAttribute('aria-hidden','true');}
  function finish() {
    cancel();status.textContent='Ready';steps.forEach(step=>{step.classList.remove('is-current');step.classList.add('is-complete');});
    if(reducedMotion()){hide();return;}
    root.classList.remove('is-loading');root.classList.add('is-ready');
    timer=setTimer(()=>{timer=0;root.hidden=true;root.setAttribute('aria-hidden','true');},200);
  }
  return {begin,stage,finish,hide,cancel,dispose:cancel};
}

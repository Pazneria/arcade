import {createEntrySession, sampleTokenPose, TOKEN_DURATION, REDUCED_DURATION} from './entry-session.js';
import {createTokenProp} from './token-prop.js';
export {TOKEN_DURATION, REDUCED_DURATION};

// The host owns its RAF, selection, readiness source, status UI, and camera.
export function createTokenEntry(options = {}) {
  const prop = createTokenProp(options);
  const {onStart, onState, ...sessionOptions} = options;
  const session = createEntrySession({...sessionOptions,
    onStart(event) {
      prop.root.visible = true;
      prop.pose(sampleTokenPose(0,{duration:event.duration,reducedMotion:event.reducedMotion,radius:prop.summary.radius}));
      onStart?.(event);
    },
    onState(event) {
      prop.root.visible = event.phase === 'inserting' || event.phase === 'waiting';
      if(event.phase !== 'inserting') prop.token.visible = false;
      onState?.(event);
    },
  });
  let disposed=false;
  function update(dt) {
    const frame=session.frame;if(!frame||frame.inserted||disposed)return false;
    if(!Number.isFinite(dt)||dt<0)throw new TypeError('update expects finite nonnegative seconds');
    prop.pose(sampleTokenPose(Math.min(frame.duration,frame.elapsed+dt),{
      duration:frame.duration,reducedMotion:frame.reducedMotion,radius:prop.summary.radius}));
    return session.update(dt);
  }
  function dispose(){if(disposed)return;disposed=true;session.dispose();prop.dispose();}
  return {start:session.start,update,cancel:session.cancel,reset:session.reset,dispose,
    root:prop.root,token:prop.token,slot:prop.slot,summary:prop.summary,
    get state(){return session.state;},get active(){return session.active;}};
}

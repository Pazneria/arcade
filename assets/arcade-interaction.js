export const isCabinetMode=mode=>['inspect','inserting','play'].includes(mode);

// Consume an outside press before it reaches the newly resumed scene. One
// gesture exits and can request look capture; it cannot also activate a cabinet.
export function exitOnOutsidePress(event,{interacting,contains,exit}) {
  if(!interacting||event.defaultPrevented||(event.button!==undefined&&event.button!==0))return false;
  if(contains(event))return false;
  event.preventDefault();event.stopImmediatePropagation();exit(event);return true;
}

// Escape can be reserved by the browser to unlock a child. Do not request lock
// from it. Restore window mouse look immediately; an ordinary trusted press can
// request capture, subject to the browser's gesture/cooldown policy.
export function canCaptureOnExit(event) {
  return !!(event?.isTrusted&&['pointerdown','click'].includes(event.type)&&(event.button===undefined||event.button===0));
}

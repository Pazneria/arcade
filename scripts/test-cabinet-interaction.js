const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const url=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
(async()=>{
  const {isCabinetMode,exitOnOutsidePress,canCaptureOnExit}=await import(url(fs.readFileSync(path.join(__dirname,'../assets/arcade-interaction.js'),'utf8')));
  for(const mode of ['inspect','inserting','play'])assert(isCabinetMode(mode));
  for(const mode of ['explore','paused','help','directory','loading'])assert(!isCabinetMode(mode));
  let exits=0,received;
  const event=values=>({type:'pointerdown',button:0,isTrusted:true,defaultPrevented:false,prevented:0,stopped:0,
    preventDefault(){this.prevented++;},stopImmediatePropagation(){this.stopped++;},...values});
  for(const values of [{button:2},{defaultPrevented:true}]){
    const e=event(values);assert(!exitOnOutsidePress(e,{interacting:true,contains:()=>false,exit:()=>exits++}));assert.equal(e.prevented,0);
  }
  const inside=event();assert(!exitOnOutsidePress(inside,{interacting:true,contains:()=>true,exit:()=>exits++}));assert.equal(inside.stopped,0,'Inside screen/physical cabinet input reaches its own target');
  const idle=event();assert(!exitOnOutsidePress(idle,{interacting:false,contains:()=>false,exit:()=>exits++}));
  const outside=event();assert(exitOnOutsidePress(outside,{interacting:true,contains:()=>false,exit:e=>{received=e;exits++;}}));
  assert.equal(received,outside);assert.equal(exits,1);assert.equal(outside.prevented,1);assert.equal(outside.stopped,1,'Outside press cannot reach the resumed canvas and immediately re-enter');
  assert(canCaptureOnExit(outside));assert(canCaptureOnExit(event({type:'click'})));
  assert(!canCaptureOnExit(event({isTrusted:false})));assert(!canCaptureOnExit(event({button:2})));
  assert(!canCaptureOnExit(event({type:'keydown',code:'Escape'})),'Browser-reserved Escape never triggers a lock request');assert(!canCaptureOnExit());
  console.log('PASS cabinet CPU interaction: mode gating, inside/outside targets, consumed exit gesture, trusted capture and Escape fallback');
})().catch(error=>{console.error(error);process.exitCode=1;});

export const DESIGN=Object.freeze({width:992,height:1152});
const ids=['banked-shakedown','test-track-b','technical-bowl','jump-speedcheck'];
const rect=(id,x,y,width,height,label)=>Object.freeze({id,u:x/992,v:y/1152,right:(x+width)/992,bottom:(y+height)/1152,width:width/992,height:height/1152,label});
export const HOTSPOTS=Object.freeze([
  ...ids.map((id,i)=>rect(id,128+i*184,758,184,172,`Course ${'ABCD'[i]}`)),
  rect('start',124,963,744,127,'Press Start'),
]);

// Rasterized period lettering is bundled with the approved vectors so runtime
// font availability cannot silently change the owner-approved type/scale.
export function createApprovedCabinetArt({document:doc=globalThis.document,loadImage}={}) {
  const images=new Map();
  const load=loadImage||((src)=>new Promise((resolve,reject)=>{
    const image=doc.createElement('img');image.onload=()=>resolve(image);image.onerror=()=>reject(new Error('Cabinet artwork could not load.'));image.src=new URL(src,doc.baseURI).href;
  }));
  const sources=[...ids.map((id,i)=>[id,`course-${'abcd'[i]}.png`]),...['loading','error'].map(phase=>[phase,`${phase}-prompt.png`])];
  const ready=Promise.all(sources.map(async([key,file])=>images.set(key,await load(`./assets/cabinet-menu/proof-v2/${file}`))));
  function draw(ctx,{width=992,height=1152,state}={}){
    const id=ids.includes(state?.trackId)?state.trackId:ids[0],phase=['loading','error'].includes(state?.phase)?state.phase:'menu';
    const image=images.get(id);ctx.save();ctx.setTransform(width/992,0,0,height/1152,0,0);
    if(image){ctx.drawImage(image,0,0,992,1152);if(phase!=='menu')ctx.drawImage(images.get(phase),124,963,744,127);}
    else{ctx.fillStyle='#190f19';ctx.fillRect(0,0,992,1152);}
    ctx.restore();
  }
  return Object.freeze({ready,draw,regions:()=>HOTSPOTS,focusAction:()=> 'start',approved:true,design:DESIGN});
}

// Art-only companion to the Claude / Starlite production derivative.
// No input, camera, door, route, storage, light or animation ownership.
export const CABINET_LAYOUT = Object.freeze({
  left: Object.freeze([-3.65, -4.92, -6.19]),
  right: Object.freeze([-6.10, -7.55]),
  feature: -9.25,
});

const SANS = '"Arial Black", "Segoe UI Black", sans-serif';
const SERIF = 'Georgia, "Times New Roman", serif';
const MONO = 'Consolas, "Courier New", monospace';
const signatures = {
  'RACEGPT': {lines:['RACEGPT'], face:SANS, italic:true, ink:'#fff1c9', accent:'#ff983d', field:'#29121e', motif:'speed'},
  'OSRS CLONE': {lines:['OSRS','CLONE'], face:SERIF, ink:'#ffe7a0', accent:'#bc84ee', field:'#170f2b', motif:'diamond'},
  'SWORD GUYS': {lines:['SWORD','GUYS'], face:SERIF, ink:'#ecfff5', accent:'#59dcc9', field:'#092b38', motif:'blade'},
  'GHOST SIGNAL': {lines:['GHOST','SIGNAL'], face:MONO, ink:'#fff0e4', accent:'#ff91b0', field:'#241126', motif:'signal'},
  'NIGHT COURIER': {lines:['NIGHT','COURIER'], face:SANS, italic:true, ink:'#f6ecff', accent:'#72d9ed', field:'#171329', motif:'route'},
  'REBOUND RELAY': {lines:['REBOUND','RELAY'], face:SANS, ink:'#fff1be', accent:'#6de1ea', field:'#091c3c', motif:'relay'},
};

function signature(title) {
  return signatures[title] || {lines:[title], face:SANS, ink:'#fff1cf', accent:'#e9b96b', field:'#1b1229', motif:'diamond'};
}

// Fit by changing font size, never by squeezing glyphs. Canvas is authored at
// the receiving panel's physical aspect, including the arched feature header.
function fittedText(g, text, x, y, size, maxWidth, style) {
  const font = n => `${style.italic ? 'italic ' : ''}900 ${n}px ${style.face}`;
  g.font = font(size);
  const width = g.measureText(text).width;
  if (width > maxWidth) g.font = font(size * maxWidth / width);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineJoin = 'round'; g.lineWidth = 2.5;
  g.strokeStyle = style.field; g.strokeText(text, x, y);
  g.fillStyle = style.ink; g.fillText(text, x, y);
}

function emblem(g, motif, x, y, size, ink) {
  g.save(); g.translate(x,y); g.scale(size,size);
  g.strokeStyle = ink; g.fillStyle = ink; g.lineWidth = 0.07;
  g.beginPath();
  if (motif === 'speed') {
    for (let i=0;i<3;i++) { g.moveTo(-1+i*.12,-.45+i*.45);g.lineTo(.7+i*.12,-.45+i*.45); }
  } else if (motif === 'blade') {
    g.moveTo(0,-1);g.lineTo(.15,.25);g.lineTo(0,.45);g.lineTo(-.15,.25);g.closePath();
    g.moveTo(-.45,.45);g.lineTo(.45,.45);g.moveTo(0,.45);g.lineTo(0,.9);
  } else if (motif === 'signal') {
    for(let i=0;i<3;i++) {g.moveTo(-.75+i*.75,.65);g.lineTo(-.75+i*.75,-.15-i*.3);}
    g.moveTo(-1,.9);g.lineTo(1,.9);
  } else if (motif === 'route') {
    g.moveTo(-.9,.65);g.lineTo(-.2,.65);g.lineTo(.25,-.65);g.lineTo(.9,-.65);
    g.moveTo(.5,-.95);g.lineTo(.95,-.65);g.lineTo(.5,-.3);
  } else if (motif === 'relay') {
    for(const sx of [-.6,.25]) {g.moveTo(sx-.3,-.6);g.lineTo(sx+.25,0);g.lineTo(sx-.3,.6);}
  } else {
    g.moveTo(0,-.95);g.lineTo(.65,0);g.lineTo(0,.95);g.lineTo(-.65,0);g.closePath();
    g.moveTo(-.65,0);g.lineTo(.65,0);g.moveTo(0,-.95);g.lineTo(0,.95);
  }
  g.stroke();g.restore();
}

function fieldMotif(g, s, W) {
  g.save();g.globalAlpha=.14;g.strokeStyle=s.accent;g.fillStyle=s.accent;g.lineWidth=2;
  for(const mirror of [false,true]) {
    g.save();if(mirror){g.translate(W,0);g.scale(-1,1);}
    if(s.motif==='speed') {
      for(let i=0;i<6;i++) {g.beginPath();g.moveTo(24+i*19,27);g.lineTo(32+i*19,27);g.lineTo(110+i*19,229);g.lineTo(102+i*19,229);g.fill();}
    } else if(s.motif==='diamond') {
      g.translate(93,125);g.rotate(Math.PI/4);g.strokeRect(-56,-56,112,112);g.strokeRect(-44,-44,88,88);
      g.beginPath();g.moveTo(-65,0);g.lineTo(65,0);g.moveTo(0,-65);g.lineTo(0,65);g.stroke();
    } else if(s.motif==='blade') {
      for(let i=0;i<3;i++){g.beginPath();g.moveTo(25,192+i*11);g.bezierCurveTo(77,161+i*11,125,211+i*11,185,182+i*11);g.stroke();}
      g.beginPath();g.moveTo(34,35);g.lineTo(123,144);g.lineTo(119,125);g.moveTo(90,116);g.lineTo(111,100);g.stroke();
    } else if(s.motif==='signal') {
      g.beginPath();g.moveTo(25,190);g.lineTo(63,190);g.lineTo(76,150);g.lineTo(91,213);g.lineTo(109,175);g.lineTo(122,190);g.lineTo(188,190);g.stroke();
      for(let i=0;i<4;i++)g.fillRect(27+i*23,38,12,2);
    } else if(s.motif==='route') {
      g.setLineDash([6,8]);g.beginPath();g.moveTo(28,215);g.lineTo(77,215);g.lineTo(110,48);g.lineTo(173,48);g.stroke();g.setLineDash([]);
      g.lineWidth=1;g.beginPath();g.moveTo(34,28);g.lineTo(34,160);g.lineTo(172,160);g.moveTo(26,76);g.lineTo(158,76);g.stroke();
    } else {
      for(let i=0;i<3;i++){g.beginPath();g.arc(40,130,44+i*21,-1.15,1.15);g.stroke();}
      g.beginPath();g.arc(148,207,7,0,Math.PI*2);g.fill();
    }
    g.restore();
  }
  g.restore();
}

export function paintMarquee(g, G, width, height) {
  const s = signature(G.title), k = height/256;
  g.save();g.scale(k,k);
  const W=width/k,H=256;
  const arched=G.bank==='STARLITE';
  g.fillStyle=s.field;g.fillRect(0,0,W,H);
  // Restrained printed edge bands, with a quiet title field between them.
  const edge=g.createLinearGradient(0,0,W,H);
  edge.addColorStop(0,s.accent);edge.addColorStop(.5,s.ink);edge.addColorStop(1,s.accent);
  g.strokeStyle=edge;g.lineWidth=3;
  if(arched) {
    // The physical quadratic arch clips the rectangular UV field. Follow its
    // shoulder here and keep the upper word clear of the low outer corners.
    for(const [inset,bottom,shoulder,control] of [[14,242,160,-54],[23,232,169,-37]]) {
      g.beginPath();g.moveTo(inset,bottom);g.lineTo(W-inset,bottom);g.lineTo(W-inset,shoulder);g.quadraticCurveTo(W/2,control,inset,shoulder);g.closePath();g.stroke();g.lineWidth=1;
    }
  } else {g.strokeRect(11,11,W-22,H-22);g.lineWidth=1;g.strokeRect(18,18,W-36,H-36);}
  fieldMotif(g,s,W);
  emblem(g,s.motif,55,arched?190:127,19,s.accent);
  emblem(g,s.motif,W-55,arched?190:127,19,s.accent);
  const lines=G.bank==='WAVECREST'?[G.title]:s.lines;
  lines.forEach((line,i)=>fittedText(g,line,W/2,arched?109+i*65:lines.length===1?119:86+i*77,lines.length===1?103:78,arched&&i===0?W*.54:W-154,s));
  g.font=`600 15px ${MONO}`;g.textAlign='center';g.textBaseline='middle';g.fillStyle=s.accent;
  g.fillText(G.bank==='STARLITE'?'STARLITE ORIGINAL / 2-PLAYER DELUXE':`${G.bank} AMUSEMENTS`,W/2,arched?223:219);
  // A tiny maker's lozenge joins the title to the cabinet's existing hardware.
  g.fillStyle=s.accent;g.fillRect(W/2-26,arched?70:31,52,3);
  g.restore();
}

export function paintSideSignature(g, G, uMin, uMax, vMax, W, H) {
  const s=signature(G.title);
  const X=u=>(u-uMin)/(uMax-uMin)*W,Y=v=>(1-v/vMax)*H;
  // The upper rear shoulder is visible on approach and safely inside all three
  // original silhouettes. Correct for the side UV's unequal metre/pixel scale.
  const centerU=G.bank==='STARLITE'?.22:.245;
  const span=G.bank==='STARLITE'?.46:.42;
  const cx=X(centerU), cy=Y(G.bank==='STARLITE'?1.70:1.67);
  const maxWidth=span/(uMax-uMin)*W;
  g.save();g.translate(cx,cy);
  g.scale(1,(uMax-uMin)/vMax*H/W);
  g.globalAlpha=.95;g.fillStyle=s.field;
  g.fillRect(-maxWidth/2-13,-84,maxWidth+26,178);
  g.strokeStyle=s.accent;g.lineWidth=3;
  g.beginPath();g.moveTo(-maxWidth/2,-77);g.lineTo(maxWidth/2,-77);g.moveTo(-maxWidth/2,89);g.lineTo(maxWidth/2,89);g.stroke();
  const lines=G.title==='RACEGPT'?['RACE','GPT']:s.lines;
  lines.forEach((line,i)=>fittedText(g,line,0,-39+i*83,94,maxWidth-18,s));
  g.restore();
}

export function buildLoungeProps({THREE,root,M,mesh,box,cyl,blobShadow,cachedGeometry}) {
  const bench=new THREE.Group();bench.name='crafted-entrance-bench';bench.position.set(-2.55,0,-.32);root.add(bench);
  const plank=(key,w,h,d)=>cachedGeometry(key,()=>{
    const shape=new THREE.Shape();const r=.014,x=-w/2,y=-h/2;
    shape.moveTo(x+r,y);shape.lineTo(x+w-r,y);shape.quadraticCurveTo(x+w,y,x+w,y+r);
    shape.lineTo(x+w,y+h-r);shape.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
    shape.lineTo(x+r,y+h);shape.quadraticCurveTo(x,y+h,x,y+h-r);shape.lineTo(x,y+r);shape.quadraticCurveTo(x,y,x+r,y);
    const geo=new THREE.ExtrudeGeometry(shape,{depth:d,steps:1,bevelEnabled:true,bevelSize:.004,bevelThickness:.004,bevelSegments:1,curveSegments:3});
    geo.translate(0,0,-d/2);return geo;
  });
  const seat=plank('lounge:seat',1.28,.042,.076),back=plank('lounge:back',1.28,.085,.034);
  // Four separate eased slats, a pitched three-slat back, brass fixings and
  // proper welded supports. All static pieces enter the usual material merge.
  for(let i=0;i<4;i++) mesh(seat,M.wood,bench,0,.465,-.155+i*.095);
  for(let i=0;i<3;i++) mesh(back,M.wood,bench,0,.64+i*.112,.225+i*.012,.10);
  for(const x of [-.52,.52]) {
    for(const z of [-.14,.14]) {
      box(.034,.40,.034,M.darkMetal,bench,x,.22,z);
      box(.065,.018,.07,M.rubber,bench,x,.018,z);
    }
    box(.038,.033,.43,M.darkMetal,bench,x,.427,.045);
    box(.032,.43,.032,M.darkMetal,bench,x,.657,.260,.10);
    for(let i=0;i<4;i++) cyl(.005,.005,.002,8,M.gold,bench,x,.489,-.155+i*.095);
    for(let i=0;i<3;i++) cyl(.005,.005,.003,8,M.gold,bench,x,.64+i*.112,.205+i*.012,Math.PI/2+.10);
  }
  box(1.07,.028,.028,M.darkMetal,bench,0,.19,.105);
  blobShadow(bench,1.6,.6);

  const plant=new THREE.Group();plant.name='crafted-entrance-plant';plant.position.set(-3.32,0,-.95);root.add(plant);
  const clay=new THREE.MeshStandardMaterial({color:0xb26d50,roughness:.82});
  const forest=new THREE.MeshStandardMaterial({color:0x28563c,roughness:.57,side:THREE.DoubleSide});
  const sage=new THREE.MeshStandardMaterial({color:0x54825a,roughness:.63,side:THREE.DoubleSide});
  // Closed lathed ceramic profile: foot, belly, rolled lip and inner wall.
  const profile=[[.12,.032],[.135,.05],[.15,.18],[.172,.31],[.178,.326],[.183,.33],[.184,.347],[.178,.358],[.164,.358],[.160,.34],[.154,.315]];
  mesh(new THREE.LatheGeometry(profile.map(([x,y])=>new THREE.Vector2(x,y)),24),clay,plant);
  cyl(.155,.155,.014,24,M.matte,plant,0,.323,0);
  cyl(.19,.19,.018,24,clay,plant,0,.018,0);
  mesh(new THREE.TorusGeometry(.175,.008,6,24),M.gold,plant,0,.034,0,Math.PI/2);
  const leafGeometry=(length,width,bend)=>{
    const p=[],uv=[],idx=[];
    for(let row=0;row<=9;row++) {
      const t=row/9, half=width*Math.pow(Math.sin(Math.PI*t),.75);
      for(const side of [-1,0,1]) {p.push(side*half,length*(t-.15*t*t*t),bend*t*t+(side===0?.012:0)*Math.sin(Math.PI*t));uv.push((side+1)/2,t);}
    }
    for(let row=0;row<9;row++) for(let side=0;side<2;side++) {
      const a=row*3+side,b=a+3;idx.push(a,b,a+1,b,b+1,a+1);
    }
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(p,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.setIndex(idx);geo.computeVertexNormals();return geo;
  };
  // Three shared folded, tapering leaf forms replace fourteen flat rectangles.
  const forms=[[.53,.065,.17],[.68,.072,.15],[.77,.061,.10]];
  const leaves=forms.map(([l,w,b],i)=>cachedGeometry(`lounge:leaf:${i}`,()=>leafGeometry(l,w,b)));
  for(let i=0;i<11;i++) {
    const a=i*2.399963,form=i%3,base=.415+(i%3)*.022;
    const frond=new THREE.Group();frond.position.set(Math.sin(a)*.018,base,Math.cos(a)*.018);frond.rotation.y=a;plant.add(frond);
    mesh(leaves[form],i%4===0?sage:forest,frond);
    const [length,,bend]=forms[form];
    const vein=[];
    for(let j=0;j<=6;j++) {const t=j/6;vein.push(new THREE.Vector3(0,length*(t-.15*t*t*t),bend*t*t+.013*Math.sin(Math.PI*t)+.001));}
    mesh(cachedGeometry(`lounge:vein:${form}`,()=>new THREE.TubeGeometry(new THREE.CatmullRomCurve3(vein),6,.0018,3,false)),sage,frond);
    const stem=new THREE.LineCurve3(new THREE.Vector3(0,.325,0),new THREE.Vector3(frond.position.x,base,frond.position.z));
    mesh(new THREE.TubeGeometry(stem,1,.004,5,false),forest,plant);
  }
  blobShadow(plant,.55,.55);
  return {bench,plant};
}

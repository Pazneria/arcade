// Mechanical course/state variants of the approved task-43 vector template.
// Existing ImageMagick rasterizes on the CPU; no browser, server, GPU or install.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'assets/cabinet-menu/proof-v2');
const template=fs.readFileSync(path.join(dir,'approved-template.svg'),'utf8').replace(/\r\n/g,'\n');
const tracks=JSON.parse(fs.readFileSync(path.join(dir,'track-routes.json'),'utf8'));
const BG='#190f19',INK='#f0dfbb',AMBER='#d9a65e',DIM='#735044',DARK='#3c2530';
const line=(d,color=AMBER,width=3)=>`<path d="${d}" stroke="${color}" stroke-width="${width}" fill="none" stroke-linejoin="round" stroke-linecap="round"/>`;
const text=(x,y,t,size=78,fill=INK)=>`<text x="${x}" y="${y}" font-family="Arial Narrow" font-size="${size}" font-weight="700" font-style="normal" text-anchor="middle" letter-spacing="0" fill="${fill}">${t}</text>`;
const prefix=template.slice(0,template.indexOf('<path d="M '));
const footer=template.slice(template.indexOf('<path d="M124 963h744"'));
if(!prefix||!footer.includes('PRESS START'))throw Error('Approved template structure changed');
function route(track){
  const xs=track.route.map(p=>p[0]),ys=track.route.map(p=>p[1]);
  const xmin=Math.min(...xs),xmax=Math.max(...xs),ymin=Math.min(...ys),ymax=Math.max(...ys);
  const scale=Math.min(594/(xmax-xmin),367/(ymax-ymin));
  const point=p=>[496+(p[0]-(xmin+xmax)/2)*scale,522+(p[1]-(ymin+ymax)/2)*scale],pts=track.route.map(point);
  const d='M '+pts.map(([x,y])=>`${x.toFixed(2)},${y.toFixed(2)}`).join(' L '),art=[line(d,DARK,30),line(d,INK,8)];
  for(const gate of track.gates){const [x,y]=point(gate);art.push(`<path d="M${x.toFixed(2)},${(y-10).toFixed(2)}l10,10l-10,10l-10,-10Z" fill="${AMBER}" stroke="${BG}" stroke-width="3"/>`);}
  let [x,y]=pts[0];art.push(`<path d="M${x.toFixed(2)} ${(y-13).toFixed(2)}l-12 25h24Z" fill="${AMBER}" stroke="${BG}" stroke-width="3"/>`);
  [x,y]=pts.at(-1);for(let ix=0;ix<3;ix++)for(let iy=0;iy<3;iy++)if((ix+iy)%2===0)art.push(`<rect x="${(x-12+ix*8).toFixed(2)}" y="${(y-12+iy*8).toFixed(2)}" width="8" height="8" fill="${INK}"/>`);
  return art.join('\n');
}
function choices(selected){const art=[];for(let i=0;i<4;i++){
  const x=220+i*184,y=838,letter='ABCD'[i];
  if(i===selected)art.push(`<path d="M${x-66} ${y-60}h117l15 15v82l-15 15h-117Z" fill="${AMBER}"/>`,line(`M${x-79} ${y-73}h138l20 20v98l-20 20h-138`,AMBER,2),text(x,y+29,letter,78,BG));
  else art.push(line(`M${x-43} ${y+54}h86`,DIM,2),text(x,y+29,letter));
}return art.join('\n');}
const magick=process.env.MAGICK_EXECUTABLE||'magick';
function raster(svg,png){cp.execFileSync(magick,['-background','none',svg,'-depth','8',png],{windowsHide:true,stdio:'pipe'});}
const files=[];
for(let i=0;i<tracks.length;i++){
  const letter='abcd'[i],svg=path.join(dir,`course-${letter}.svg`),png=path.join(dir,`course-${letter}.png`);
  const source=i===2?template:prefix+route(tracks[i])+'\n'+choices(i)+'\n'+footer;
  fs.writeFileSync(svg,source);if(i!==2)raster(svg,png); // C is the exact approved PNG copy.
  for(const suffix of ['']){
    const file=`course-${letter}${suffix}.png`,bytes=fs.readFileSync(path.join(dir,file));
    if(bytes.readUInt32BE(16)!==992||bytes.readUInt32BE(20)!==1152)throw Error('Unexpected artwork dimensions');
    files.push({file,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});
  }
}
// Shared prompt strips avoid decoding a full-screen copy for every busy/error
// course. Only the existing prompt region changes; the approved frame survives.
for(const [phase,label] of [['loading','PLEASE WAIT'],['error','TRY AGAIN']]){
  const svg=path.join(dir,`${phase}-prompt.svg`),full=path.join(root,'../',`cabinet-${phase}-prompt-build.png`),png=path.join(dir,`${phase}-prompt.png`);
  fs.writeFileSync(svg,template.replace('>PRESS START</text>',`>${label}</text>`));raster(svg,full);
  cp.execFileSync(magick,[full,'-crop','744x127+124+963','+repage',png],{windowsHide:true,stdio:'pipe'});fs.unlinkSync(full);
  const bytes=fs.readFileSync(png);files.push({file:path.basename(png),bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});
}
if(files.find(f=>f.file==='course-c.png').sha256!=='3093f657363c7c7f21b9713e56935623c7cc5917e12b3cb81cc86ae5898204f2')throw Error('Approved Course C PNG changed');
fs.writeFileSync(path.join(dir,'asset-receipt.json'),JSON.stringify({source:'task-43/proof-v2; owner-approved still',dimensions:[992,1152],approvedCourseCByteExact:true,normalLayoutUnchanged:true,variants:'canonical routes/selection only; loading/error replace only the original prompt text',browserOrGpu:false,files},null,2)+'\n');
console.log('PASS CPU proof-v2 assets: four 992x1152 course PNGs and two shared prompt strips; approved Course C byte-exact');

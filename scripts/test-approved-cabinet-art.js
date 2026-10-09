const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),url=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
(async()=>{
  const source=fs.readFileSync(path.join(root,'assets/cabinet-menu/approved-art.js'),'utf8');
  const {createApprovedCabinetArt,DESIGN,HOTSPOTS}=await import(url(source));
  assert.deepEqual(DESIGN,{width:992,height:1152});assert.equal(HOTSPOTS.length,5);assert(!HOTSPOTS.some(r=>['back','cancel'].includes(r.id)));
  const routes=JSON.parse(fs.readFileSync(path.join(root,'assets/cabinet-menu/proof-v2/track-routes.json'),'utf8'));
  for(let i=0;i<4;i++){
    assert.equal(HOTSPOTS[i].id,routes[i].id);const x=220+i*184;
    assert(x/992>HOTSPOTS[i].u&&x/992<HOTSPOTS[i].u+HOTSPOTS[i].width);assert(867/1152>HOTSPOTS[i].v&&867/1152<HOTSPOTS[i].v+HOTSPOTS[i].height);
    if(i)assert.equal(HOTSPOTS[i-1].right,HOTSPOTS[i].u,'Quarter-width course targets meet without overlap');
  }
  assert(HOTSPOTS[0].v+HOTSPOTS[0].height<HOTSPOTS[4].v,'Start is separated from course selection');
  const receipt=JSON.parse(fs.readFileSync(path.join(root,'assets/cabinet-menu/proof-v2/asset-receipt.json'),'utf8'));
  assert.equal(receipt.files.length,6);assert.equal(receipt.approvedCourseCByteExact,true);
  for(const f of receipt.files){const bytes=fs.readFileSync(path.join(root,'assets/cabinet-menu/proof-v2',f.file));assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),f.sha256);assert.equal(bytes.length,f.bytes);assert.equal(bytes.readUInt32BE(16),f.file.includes('prompt')?744:992);assert.equal(bytes.readUInt32BE(20),f.file.includes('prompt')?127:1152);}
  assert.equal(receipt.files.find(f=>f.file==='course-c.png').sha256,'3093f657363c7c7f21b9713e56935623c7cc5917e12b3cb81cc86ae5898204f2');
  const requests=[],draws=[],transforms=[];
  const art=createApprovedCabinetArt({loadImage:async src=>{requests.push(src);return {src};}});await art.ready;assert.equal(requests.length,6);
  const ctx={save(){},restore(){},setTransform(...args){transforms.push(args);},drawImage(...args){draws.push(args);},fillRect(){assert.fail('Ready artwork must use the approved raster');}};
  art.draw(ctx,{width:992,height:1152,state:{trackId:'technical-bowl',phase:'menu'}});assert.equal(draws.length,1);assert(draws[0][0].src.endsWith('course-c.png'));assert.deepEqual(draws[0].slice(1),[0,0,992,1152]);
  for(const phase of ['loading','error']){draws.length=0;art.draw(ctx,{width:496,height:576,state:{trackId:'test-track-b',phase}});assert(draws[0][0].src.endsWith('course-b.png'));assert(draws[1][0].src.endsWith(phase+'-prompt.png'));assert.deepEqual(draws[1].slice(1),[124,963,744,127]);assert.deepEqual(transforms.at(-1),[.5,0,0,.5,0,0]);}
  assert(!/fillText|strokeText|requestAnimationFrame|setInterval|setTimeout/.test(source),'Runtime does not recreate period type or own an animation loop');
  await assert.rejects(createApprovedCabinetArt({loadImage:async()=>{throw Error('missing art');}}).ready,/missing art/);
  console.log('PASS CPU approved art: exact Course C pixels, six validated assets, authoritative quarter-width/start targets, bitmap-only type, scale/state strips and load failure');
})().catch(error=>{console.error(error);process.exitCode=1;});

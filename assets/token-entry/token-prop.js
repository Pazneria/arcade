// Procedural, owned geometry and textures. No network, image loaders, or lights.
export function createTokenProp({THREE, parent, mount = {}, document: doc = globalThis.document,
  radius = 0.052, thickness = 0.0072, envMap = null} = {}) {
  if (!THREE || !parent?.add) throw new TypeError('THREE and an Object3D parent are required');
  if (!Number.isFinite(radius) || radius <= 0 || !Number.isFinite(thickness) || thickness <= 0) throw new TypeError('Invalid token dimensions');
  const geometries = new Set(), materials = new Set(), textures = new Set();
  const geo = value => (geometries.add(value), value);
  const mat = value => (materials.add(value), value);
  const root = new THREE.Group(); root.name = 'arcade-token-entry'; root.visible = false;
  const transform = (values, fallback, label) => {
    const result = values ?? fallback;
    if (!Array.isArray(result) || result.length !== 3 || !result.every(Number.isFinite)) throw new TypeError('Invalid mount ' + label);
    return result;
  };
  root.position.fromArray(transform(mount.position, [0, 0, 0], 'position'));
  root.rotation.fromArray([...transform(mount.rotation, [0, 0, 0], 'rotation'), 'XYZ']);
  const scale = typeof mount.scale === 'number' ? [mount.scale, mount.scale, mount.scale] : mount.scale;
  root.scale.fromArray(transform(scale, [1, 1, 1], 'scale'));
  if (root.scale.toArray().some(n => n <= 0)) throw new TypeError('Mount scale must be positive');
  parent.add(root);
  const token = new THREE.Group(); token.name = 'brass-play-token'; root.add(token);
  const planeUniform = {value: new THREE.Vector4(0, 0, 1, -0.008)};
  const localPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -0.008);
  const worldPlane = new THREE.Plane();

  // Clip only our own token at the mouth, even when a host uses a solid coin door.
  // Does not enable renderer clipping, alter global shaders, or touch host materials.
  function clippedMaterial(settings) {
    const material = mat(new THREE.MeshStandardMaterial({...settings, envMap}));
    material.onBeforeCompile = shader => {
      shader.uniforms.tokenMouthPlane = planeUniform;
      shader.vertexShader = 'varying vec3 vTokenWorldPosition;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
        vec4 tokenWorldPosition = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          tokenWorldPosition = instanceMatrix * tokenWorldPosition;
        #endif
        vTokenWorldPosition = (modelMatrix * tokenWorldPosition).xyz;`);
      shader.fragmentShader = 'uniform vec4 tokenMouthPlane;\nvarying vec3 vTokenWorldPosition;\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <clipping_planes_fragment>',
        '#include <clipping_planes_fragment>\nif (dot(vec4(vTokenWorldPosition, 1.0), tokenMouthPlane) < 0.0) discard;');
    };
    material.customProgramCacheKey = () => 'arcade-token-mouth-v1';
    return material;
  }
  function mesh(geometry, material, group = token, position = [0, 0, 0]) {
    const object = new THREE.Mesh(geometry, material); object.position.fromArray(position); group.add(object); return object;
  }
  function faceTextures() {
    if (!doc?.createElement) return {};
    const size = 512;
    const make = draw => {
      const canvas = doc.createElement('canvas'); canvas.width = canvas.height = size;
      const ctx = canvas.getContext('2d'); if (!ctx) return null;
      draw(ctx, size); const texture = new THREE.CanvasTexture(canvas);
      textures.add(texture); return texture;
    };
    const stamp = (ctx, color, offset = 0) => {
      ctx.save(); ctx.translate(256 + offset, 256 + offset); ctx.fillStyle = color;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '600 38px Georgia, serif';
      const arc = (text, bottom, spread) => {
        [...text].forEach((letter, i) => {
          const a = (i / (text.length - 1) - 0.5) * spread;
          ctx.save();ctx.translate(Math.sin(a)*174,(bottom?1:-1)*Math.cos(a)*174);
          ctx.rotate(bottom?-a:a);ctx.fillText(letter,0,0);ctx.restore();
        });
      };
      arc('A R C A D E', false, 1.88); arc('P L A Y', true, 1.23);
      ctx.restore();
    };
    const colorMap = make((ctx, s) => {
      ctx.fillStyle = '#d8ad68'; ctx.fillRect(0, 0, s, s);
      // Fine concentric machining marks and restrained dark letter recesses.
      ctx.strokeStyle = 'rgba(107,69,27,.055)'; ctx.lineWidth = 1;
      for (let r = 14; r < 220; r += 3) {ctx.beginPath();ctx.arc(256, 256, r, 0, Math.PI * 2);ctx.stroke();}
      stamp(ctx, '#8e652e', 1); stamp(ctx, '#bb8a43');
      ctx.fillStyle = '#9d7437'; for (const x of [105, 407]) {ctx.beginPath();ctx.arc(x,256,5,0,Math.PI*2);ctx.fill();}
    });
    if (colorMap) colorMap.colorSpace = THREE.SRGBColorSpace;
    const bumpMap = make((ctx, s) => {ctx.fillStyle='#777';ctx.fillRect(0,0,s,s);stamp(ctx,'#ddd');});
    const roughnessMap = make((ctx, s) => {
      const data = ctx.createImageData(s,s);
      for (let y=0;y<s;y++) for (let x=0;x<s;x++) {
        const index=(y*s+x)*4;
        const radial=Math.hypot(x-s/2,y-s/2);
        const grain=86+Math.round(Math.sin(radial*2.1)*7)+((x*17+y*31)%7);
        data.data[index]=data.data[index+1]=data.data[index+2]=grain;data.data[index+3]=255;
      }
      ctx.putImageData(data,0,0);
    });
    return {map:colorMap,bumpMap,bumpScale:0.00055,roughnessMap};
  }
  const gold = clippedMaterial({color:0xffffff, metalness:0.78, roughness:0.88, ...faceTextures()});
  if (!gold.map) {gold.color.set(0xd6aa64);gold.roughness=0.30;}
  const polished = clippedMaterial({color:0xe9c486, metalness:0.86, roughness:0.23});
  const edgeMaterial = clippedMaterial({color:0xc39350, metalness:0.88, roughness:0.29});
  const bevel = Math.min(0.0014, thickness * 0.18), half=thickness/2;
  const profile = [[0,-half],[radius-bevel,-half],[radius,-half+bevel],
    [radius,half-bevel],[radius-bevel,half],[0,half]].map(([x,y])=>new THREE.Vector2(x,y));
  const body=mesh(geo(new THREE.LatheGeometry(profile, 112)), edgeMaterial);body.rotation.x=Math.PI/2;
  const faceGeo=geo(new THREE.CircleGeometry(radius-bevel*1.05,112));
  mesh(faceGeo,gold,token,[0,0,half+0.00003]);
  const back=mesh(faceGeo,gold,token,[0,0,-half-0.00003]);back.rotation.y=Math.PI;
  const rimGeo=geo(new THREE.TorusGeometry(radius-bevel*1.55,0.0006,5,112));
  const innerGeo=geo(new THREE.TorusGeometry(radius*0.72,0.00026,4,96));
  for (const side of [-1,1]) {
    mesh(rimGeo,polished,token,[0,0,side*(half+0.00015)]);
    mesh(innerGeo,polished,token,[0,0,side*(half+0.00013)]);
  }
  const reedGeo=geo(new THREE.BoxGeometry(0.00065,thickness-bevel*1.5,0.0012));
  const reeds=new THREE.InstancedMesh(reedGeo,polished,88);reeds.name='milled-edge-88-reeds';
  const dummy=new THREE.Object3D();
  for(let i=0;i<88;i++) {
    const a=i/88*Math.PI*2;
    dummy.position.set(Math.cos(a)*(radius-0.0002),Math.sin(a)*(radius-0.0002),0);
    dummy.rotation.set(0,0,a-Math.PI/2);dummy.rotateX(Math.PI/2);dummy.updateMatrix();reeds.setMatrixAt(i,dummy.matrix);
  }
  reeds.instanceMatrix.needsUpdate=true;token.add(reeds);
  const star=new THREE.Shape();
  for(let i=0;i<10;i++){const a=i/10*Math.PI*2+Math.PI/2,r=i%2?radius*.17:radius*.34;
    const x=Math.cos(a)*r,y=Math.sin(a)*r;if(i)star.lineTo(x,y);else star.moveTo(x,y);}
  star.closePath();
  const starGeo=geo(new THREE.ExtrudeGeometry(star,{depth:0.00045,bevelEnabled:true,bevelThickness:0.0002,
    bevelSize:0.0002,bevelSegments:2,steps:1}));
  mesh(starGeo,polished,token,[0,0,half+0.00015]);
  const backStar=mesh(starGeo,polished,token,[0,0,-half-0.00015]);backStar.rotation.y=Math.PI;

  const slot=new THREE.Group();slot.name='token-slot-escutcheon';root.add(slot);
  const plateMaterial=mat(new THREE.MeshStandardMaterial({color:0x8e805f,metalness:0.82,roughness:0.33,envMap}));
  const black=mat(new THREE.MeshStandardMaterial({color:0x080706,roughness:0.83}));
  const screwMaterial=mat(new THREE.MeshStandardMaterial({color:0xc9b992,metalness:0.88,roughness:0.26,envMap}));
  const roundedRect=(path,x,y,w,h,r)=>{
    path.moveTo(x+r,y);path.lineTo(x+w-r,y);path.quadraticCurveTo(x+w,y,x+w,y+r);
    path.lineTo(x+w,y+h-r);path.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
    path.lineTo(x+r,y+h);path.quadraticCurveTo(x,y+h,x,y+h-r);
    path.lineTo(x,y+r);path.quadraticCurveTo(x,y,x+r,y);return path;
  };
  const plate=roundedRect(new THREE.Shape(),-0.047,-0.098,0.094,0.196,0.009);
  // Clearance scales with token dimensions; default slot 0.013 × 0.12 metres.
  const mouthWidth=thickness+0.0058,mouthHeight=radius*2+0.016;
  plate.holes.push(roundedRect(new THREE.Path(),-mouthWidth/2,-mouthHeight/2,mouthWidth,mouthHeight,0.003));
  mesh(geo(new THREE.ExtrudeGeometry(plate,{depth:0.009,bevelEnabled:true,bevelSize:0.0015,
    bevelThickness:0.0015,bevelSegments:2,curveSegments:8})),plateMaterial,slot,[0,0,0.007]);
  mesh(geo(new THREE.PlaneGeometry(mouthWidth+0.004,mouthHeight+0.004)),black,slot,[0,0,0.003]);
  const screwGeo=geo(new THREE.CylinderGeometry(0.0032,0.0032,0.0018,16));
  const screwSlit=geo(new THREE.BoxGeometry(0.0045,0.00055,0.0002));
  for(const y of [-0.082,0.082]) {
    const screw=mesh(screwGeo,screwMaterial,slot,[0,y,0.0177]);screw.rotation.x=Math.PI/2;
    const cut=mesh(screwSlit,black,slot,[0,y,0.0187]);cut.rotation.z=y<0?0.28:-0.36;
  }
  const indicatorMaterial=mat(new THREE.MeshBasicMaterial({color:0xd2a45c,toneMapped:false}));
  mesh(geo(new THREE.CircleGeometry(0.0023,12)),indicatorMaterial,slot,[0.024,-0.066,0.018]);
  const summary=Object.freeze({radius,thickness,reedCount:88,mouthWidth,mouthHeight,
    geometries:geometries.size,materials:materials.size,textures:textures.size});
  let disposed=false;
  function updateMouthPlane() {
    root.updateWorldMatrix(true,false);worldPlane.copy(localPlane).applyMatrix4(root.matrixWorld);
    planeUniform.value.set(worldPlane.normal.x,worldPlane.normal.y,worldPlane.normal.z,worldPlane.constant);
  }
  function pose(value) {
    if(disposed)return;token.position.fromArray(value.position);token.rotation.fromArray([...value.rotation,'XYZ']);
    token.visible=value.visible;updateMouthPlane();
  }
  function dispose() {
    if(disposed)return;disposed=true;root.removeFromParent();
    // InstancedMesh owns its instance buffer; geometries/materials stay ours too.
    reeds.dispose();for(const value of geometries)value.dispose();for(const value of materials)value.dispose();
    for(const value of textures)value.dispose();token.clear();slot.clear();root.clear();
    geometries.clear();materials.clear();textures.clear();
  }
  return {root,token,slot,pose,dispose,summary,resources:{geometries,materials,textures}};
}

import * as THREE from './vendor/three.module.min.mjs';

// Source-qualified landmark, not an imagery-footprint extrusion. A 2024 USCG
// Notice position is rounded (~1m); the 1910 station report specifies 13'9"
// square-base diameter, octagonal shaft, 10'8" parapet and 90'2¼" to ball.
// Published descriptions disagree (84 ft, 90 ft 2¼ in, 95 ft). We use the
// historic report's explicit base-to-ball measurement as an approximation.
export const LIGHTHOUSE_POSITION={x:77.7924,z:-11.3810};
export const LIGHTHOUSE_HEIGHT=27.48915;
export const LIGHTHOUSE_BASE_WIDTH=4.191;
const PARAPET_WIDTH=3.2512;

// Box/Cylinder UVs normally span 0..1. Scale them to metre units so the shared
// 4m repeating cellhouse material looks consistent in world space.
function scaleUV(g,u,v){const a=g.attributes.uv;for(let i=0;i<a.count;i++)a.setXY(i,a.getX(i)*u,a.getY(i)*v);a.needsUpdate=true;return g}
export function buildLighthouse(terrain,{wallTexture=null}={}){
 const {x,z}=LIGHTHOUSE_POSITION,half=LIGHTHOUSE_BASE_WIDTH/2,ground=terrain.sampleHeight(x,z);if(!Number.isFinite(ground))throw Error('Lighthouse position has no playable terrain');
 const samples=[];for(const dx of [-half,0,half])for(const dz of [-half,0,half]){const h=terrain.sampleHeight(x+dx,z+dz);if(!Number.isFinite(h))throw Error('Lighthouse foundation is outside terrain');samples.push(h)}
 const bottom=Math.min(...samples)-ground-.28,baseTop=5.8,group=new THREE.Group();group.name='alcatraz-lighthouse';group.position.set(x,ground,z);
 const wall=new THREE.MeshStandardMaterial({color:wallTexture?0xdad3c8:0xc2baaa,map:wallTexture,roughness:.96}),stone=new THREE.MeshStandardMaterial({color:0xb3ab9b,roughness:.98}),metal=new THREE.MeshStandardMaterial({color:0x555e5b,roughness:.8,metalness:.12}),glass=new THREE.MeshStandardMaterial({color:0x4c6869,roughness:.55,metalness:.08}),dark=new THREE.MeshStandardMaterial({color:0x41494a,roughness:.9});
 function add(g,m,name,y){const mesh=new THREE.Mesh(g,m);mesh.name=name;mesh.position.y=y;group.add(mesh);return mesh}
 function radial(g,m,name,count,r,y){const mesh=new THREE.InstancedMesh(g,m,count),matrix=new THREE.Matrix4();mesh.name=name;for(let i=0;i<count;i++){const a=2*Math.PI*i/count;matrix.makeTranslation(Math.cos(a)*r,y,Math.sin(a)*r);mesh.setMatrixAt(i,matrix)}mesh.instanceMatrix.needsUpdate=true;group.add(mesh)}
 // Square base, buried only enough to close the visible terrain seam; all four
 // sides exactly coincide with the collision polygon at player height.
 add(scaleUV(new THREE.BoxGeometry(LIGHTHOUSE_BASE_WIDTH,baseTop-bottom,LIGHTHOUSE_BASE_WIDTH),LIGHTHOUSE_BASE_WIDTH,baseTop-bottom),wall,'lighthouse-square-base',(bottom+baseTop)/2);
 // Octagonal taper spans historical base/parapet values; reported diameters
 // are interpreted as across flats, rather than claiming a measured plan.
 const ap=Math.cos(Math.PI/8),rb=half/ap,rt=(PARAPET_WIDTH/2)/ap,shaftTop=23.35,shaftH=shaftTop-baseTop;
 const shaft=add(scaleUV(new THREE.CylinderGeometry(rt,rb,shaftH,8,1,false),Math.PI*(rb+rt),shaftH),wall,'lighthouse-octagonal-shaft',(shaftTop+baseTop)/2);shaft.rotation.y=Math.PI/8;
 add(new THREE.CylinderGeometry(2.13,2.05,.24,24),stone,'lighthouse-gallery-floor',23.47);
 // Watch room: dark insets behind pale vertical structural piers.
 add(new THREE.CylinderGeometry(1.48,1.50,1.68,8),glass,'lighthouse-watchroom',24.43);
 radial(new THREE.BoxGeometry(.20,1.68,.22),wall,'lighthouse-watchroom-piers',8,1.44,24.43);
 add(new THREE.CylinderGeometry(1.65,1.60,.20,16),stone,'lighthouse-watchroom-cornice',25.37);
 // Lantern glass is an opaque dark solid for depth sorting and no fake light.
 add(new THREE.CylinderGeometry(1.17,1.17,.92,16),glass,'lighthouse-lantern',25.93);
 radial(new THREE.CylinderGeometry(.04,.04,.92,6),metal,'lighthouse-lantern-posts',12,1.18,25.93);
 add(new THREE.ConeGeometry(1.35,.72,16),stone,'lighthouse-lantern-roof',26.75);
 add(new THREE.CylinderGeometry(.04,.04,.32,6),metal,'lighthouse-vent-spindle',27.25);
 add(new THREE.SphereGeometry(.08,8,6),metal,'lighthouse-vent-ball',LIGHTHOUSE_HEIGHT-.08);
 // Round open gallery railing, not a wall volume.
 const railR=2.10;for(const y of [23.85,24.35]){const ring=new THREE.Mesh(new THREE.TorusGeometry(railR,.035,6,32),metal);ring.rotation.x=Math.PI/2;ring.position.y=y;group.add(ring)}
 radial(new THREE.CylinderGeometry(.027,.027,.9,5),metal,'lighthouse-gallery-posts',24,railR,23.95);
 // Interpreted narrow external door and slit for visual scale. Not an entrance.
 const door=new THREE.Mesh(new THREE.BoxGeometry(.88,2.05,.025),dark);door.position.set(0,1.05,half+.014);door.name='lighthouse-closed-door';group.add(door);
 const slit=new THREE.Mesh(new THREE.BoxGeometry(.20,1.0,.025),dark);slit.position.set(0,14.2,1.885);slit.name='lighthouse-window-slit';group.add(slit);
 const outline=[[x-half,z-half],[x+half,z-half],[x+half,z+half],[x-half,z+half]];
 group.userData={ground,baseBottom:ground+bottom,height:LIGHTHOUSE_HEIGHT,baseWidth:LIGHTHOUSE_BASE_WIDTH,parapetWidth:PARAPET_WIDTH,collider:{id:-4315,name:'Lighthouse',outline},notes:'Position rounded USCG; base width and base-to-ball from 1910 station inventory; absolute base elevation sampled from game terrain, rotation, window and lantern details interpreted. Height sources differ 84/90.2/95 ft; no interiors.'};
 return group;
}

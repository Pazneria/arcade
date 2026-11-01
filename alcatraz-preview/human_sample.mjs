// Reversible, static MPFB visual sample; no animation or game behavior.
import * as THREE from './vendor/three.module.min.mjs';
import {GLTFLoader} from './vendor/addons/loaders/GLTFLoader.mjs';
export function placeHumanSample(model,terrain,spawn){
 if(!model?.isObject3D)throw Error('Missing human sample scene');
 const f=4.5,side=1,sy=Math.sin(spawn.yaw),cy=Math.cos(spawn.yaw),x=spawn.x+f*sy+side*cy,z=spawn.z-f*cy+side*sy,y=terrain.sampleHeight(x,z);
 if(!Number.isFinite(y))throw Error('Human sample has no ground support');
 model.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(model),size=bounds.getSize(new THREE.Vector3());
 if(!Number.isFinite(size.y)||size.y<1.5||size.y>2.1)throw Error('Unexpected human sample height');
 const root=new THREE.Group();root.name='human-sample';root.position.set(x,y,z);root.rotation.y=Math.atan2(spawn.x-x,spawn.z-z);model.position.y-=bounds.min.y;root.add(model);root.updateMatrixWorld(true);
 // Approximate torso footprint; A-pose arms do not act as collision walls.
 const radius=.25,outline=Array.from({length:12},(_,i)=>{const a=i*Math.PI/6;return [x+radius*Math.cos(a),z+radius*Math.sin(a)]});
 return {root,collider:{id:'human-sample',outline,base:y,roof_elevation_navd88:y+size.y},height:size.y,ground:y};
}
export async function loadHumanSample(terrain,spawn){const gltf=await new GLTFLoader().loadAsync('assets/mpfb-neutral-adult.glb?v=human-30');return placeHumanSample(gltf.scene,terrain,spawn)}

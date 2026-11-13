import * as THREE from 'three';
import {objects} from '../content/objects.js';
// Split only the presentation copy's index buffer. Vertex buffers/textures remain shared.
function extractMesh(source,bounds){
 const g=source.geometry,pos=g.attributes.position,idx=g.index;
 if(!pos)return null;
 const selected=[],point=new THREE.Vector3(),matrix=new THREE.Matrix4();
 const instances=source.isInstancedMesh?source.count:1;
 const group=new THREE.Group();
 for(let inst=0;inst<instances;inst++){
  if(source.isInstancedMesh){source.getMatrixAt(inst,matrix);matrix.premultiply(source.matrixWorld)}else matrix.copy(source.matrixWorld);
  const box=new THREE.Box3().setFromBufferAttribute(pos).applyMatrix4(matrix);
  if(!box.intersectsBox(bounds))continue;
  selected.length=0;
  for(let i=0,n=idx?idx.count:pos.count;i<n;i+=3){
   let x=0,y=0,z=0;for(let k=0;k<3;k++){point.fromBufferAttribute(pos,idx?idx.getX(i+k):i+k).applyMatrix4(matrix);x+=point.x;y+=point.y;z+=point.z;}
   point.set(x/3,y/3,z/3);
   if(bounds.containsPoint(point)){selected.push(idx?idx.getX(i):i,idx?idx.getX(i+1):i+1,idx?idx.getX(i+2):i+2);}
  }
  if(!selected.length)continue;
  const geo=new THREE.BufferGeometry();for(const [name,attr] of Object.entries(g.attributes))geo.setAttribute(name,attr);
  geo.setIndex(selected.slice());geo.computeBoundingSphere();
  const mesh=new THREE.Mesh(geo,source.material);mesh.matrix.copy(matrix);mesh.matrixAutoUpdate=false;group.add(mesh);
 }
 return group.children.length?group:null;
}
export function createRegistry(model){
 model.updateMatrixWorld(true);const registry={},meshes=[];model.traverse(o=>{if(o.isMesh)meshes.push(o)});
 for(const [id,spec]of Object.entries(objects)){
  const box=new THREE.Box3(new THREE.Vector3(...spec.min),new THREE.Vector3(...spec.max));
  const candidates=meshes.filter(o=>{
   const n=o.name+' '+o.material.name;
   if(id==='cello')return !/floor|plaster|curtain|window|wood atlas/i.test(n);
   if(id==='boots')return /Shoes |V4 boot/.test(n);
   if(id==='laptop')return /Laptop|MacBook/.test(n);
   if(id==='left')return /Chest lamp|lamp/.test(n);
   if(id==='desk')return /Task lamp|lamp/.test(n);
   return /Bedside lamp|lamp/.test(n);
  }).filter(o=>new THREE.Box3().setFromObject(o).intersectsBox(box));
  registry[id]={id,type:spec.type,box,anchor:new THREE.Vector3(...spec.anchor),meshes:candidates,presentation:null};
  if(spec.type==='story'){
   const group=new THREE.Group();group.name='Story presentation '+id;
   for(const o of candidates){const part=extractMesh(o,box);if(part)group.add(part)}
   const center=box.getCenter(new THREE.Vector3());group.position.copy(center).multiplyScalar(-1);
   const wrapper=new THREE.Group();wrapper.add(group);registry[id].presentation=wrapper;
  }
 }
 for(const [id,pattern]of Object.entries({bed:/02_Bed|rabbit|plush/i,deskFurniture:/03_Desk/,wardrobe:/Wardrobe/i,bookshelf:/Bookcase/i,curtains:/curtain/i,speaker:/bird/i}))registry[id]={id,meshes:meshes.filter(o=>pattern.test(o.userData.sourceCollection+' '+o.name+' '+o.material.name))};
 return registry;
}
export function simpleLamps(){
 const group=new THREE.Group(),mat=new THREE.MeshBasicMaterial({color:'#b8b3aa'});
 function mesh(g,p,id){const m=new THREE.Mesh(g,mat.clone());m.position.set(...p);m.userData.id=id;group.add(m);return m}
 mesh(new THREE.CylinderGeometry(.06,.07,.08,12),[.90,1.55,-4.03],'left');
 mesh(new THREE.CapsuleGeometry(.045,.16,4,12),[.90,1.72,-4.03],'left');
 mesh(new THREE.CylinderGeometry(.09,.10,.025,16),[3.23,.83,-1.74],'bedside');
 mesh(new THREE.CylinderGeometry(.013,.013,.41,8),[3.23,1.05,-1.74],'bedside');
 mesh(new THREE.CylinderGeometry(.10,.15,.23,16,1,true),[3.23,1.35,-1.74],'bedside');
 mesh(new THREE.CylinderGeometry(.09,.10,.025,16),[3.26,.81,-3.05],'desk');
 function rod(a,b){let d=new THREE.Vector3(...b).sub(new THREE.Vector3(...a));let m=mesh(new THREE.CylinderGeometry(.008,.008,d.length(),8),new THREE.Vector3(...a).addScaledVector(d,.5).toArray(),'desk');m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());}
 rod([3.26,.83,-3.05],[3.26,1.22,-3.07]);rod([3.26,1.22,-3.07],[3.12,1.43,-2.79]);
 mesh(new THREE.SphereGeometry(.09,16,8,0,Math.PI*2,0,Math.PI/2),[3.12,1.39,-2.79],'desk');
 return group;
}

import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import * as THREE from 'three';
// A separate daylight scene is sampled only by the inside faces of the bay
// window. It never changes the black background of the room's scene.
export function createWindowExterior(model){
 const scene=new THREE.Scene();scene.background=new THREE.Color('#a8d9f4');scene.fog=new THREE.Fog('#cce5ed',18,65);
 scene.add(new THREE.HemisphereLight('#fff6dc','#7c9972',2.4));const sun=new THREE.DirectionalLight('#fff0cd',3);sun.position.set(-12,20,-16);scene.add(sun);
 const box=(size,pos,color)=>{const o=new THREE.Mesh(new THREE.BoxGeometry(...size),new THREE.MeshLambertMaterial({color}));o.position.set(...pos);scene.add(o);return o;};
 box([120,.2,100],[0,-2,-35],'#93ad75');
 for(let i=-6;i<=6;i++){
  const x=i*6,z=-17-(Math.abs(i)%3)*5,h=7+(i*i%5);box([4.8,h,4],[x,h/2-2,z],i%2?'#eddfbc':'#e3e6dd');box([5,.16,4.2],[x,h-1.9,z],'#eee8d2');
  for(let y=0;y<h-1;y+=1.3)for(let j=-1;j<=1;j++){box([.78,.82,.04],[x+j*1.36,y-1.1,z+2.03],'#6d9aaa');box([1,.1,.22],[x+j*1.36,y-1.54,z+2.08],'#fff1d1');}
 }
 for(let i=-9;i<=9;i++){
  const x=i*2.2,z=-9.5-Math.abs(i%3);box([.13,2.8,.13],[x,-.6,z],'#75634a');
  const crown=new THREE.Mesh(new THREE.IcosahedronGeometry(1.1,2),new THREE.MeshLambertMaterial({color:i%2?'#6d984f':'#88a95f'}));crown.position.set(x,.9,z);crown.scale.y=1.35;scene.add(crown);
 }
 scene.traverse(o=>{if(o.isMesh)o.position.y-=4;});
 const batches=new Map();scene.updateMatrixWorld(true);
 for(const o of [...scene.children])if(o.isMesh){const key=o.material.color.getHex(),batch=batches.get(key)||{parts:[],material:o.material};batch.parts.push(o.geometry.clone().applyMatrix4(o.matrixWorld));batches.set(key,batch);scene.remove(o);o.geometry.dispose();if(batch.material!==o.material)o.material.dispose();}
 for(const batch of batches.values()){const merged=new THREE.Mesh(mergeGeometries(batch.parts),batch.material);merged.frustumCulled=false;scene.add(merged);batch.parts.forEach(g=>g.dispose());}
 const target=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType});
 const material=new THREE.ShaderMaterial({uniforms:{view:{value:target.texture},resolution:{value:new THREE.Vector2(1,1)}},vertexShader:'void main(){gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'uniform sampler2D view;uniform vec2 resolution;void main(){if(cameraPosition.z < -4.29)discard;gl_FragColor=texture2D(view,gl_FragCoord.xy/resolution);}',side:THREE.FrontSide,toneMapped:false});
 const normal=new THREE.ShaderMaterial({vertexShader:material.vertexShader,fragmentShader:'void main(){if(cameraPosition.z < -4.29)discard;gl_FragColor=vec4(0.,0.,0.,1.);}',side:THREE.FrontSide});
 const add=(w,h,p,rot)=>{const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),material);m.position.set(...p);m.rotation.y=rot;m.userData.daylightPortal=true;m.userData.portalNormal=normal;model.add(m);};
 add(1.79,2.04,[2.005,1.73,-5.02],0);add(.74,2.04,[1.11,1.73,-4.65],Math.PI/2);add(.74,2.04,[2.90,1.73,-4.65],-Math.PI/2);
 return {render(renderer,camera){const size=renderer.getDrawingBufferSize(new THREE.Vector2());if(target.width!==size.x||target.height!==size.y){target.setSize(size.x,size.y);material.uniforms.resolution.value.copy(size);}renderer.setRenderTarget(target);renderer.clear();renderer.render(scene,camera);renderer.setRenderTarget(null);},dispose(){target.dispose();material.dispose();normal.dispose();scene.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});}};
}

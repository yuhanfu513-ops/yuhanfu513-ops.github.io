import * as THREE from 'three';
import {daylight} from './daylight.js';
export function createCurtainStory(model,opened=false){
 const parts=[];model.updateMatrixWorld(true);
 model.traverse(o=>{if(!o.isMesh||!/Cars printed offwhite curtain/.test(o.material.name))return;
  o.geometry=o.geometry.clone();o.userData.storyCurtain=true;o.frustumCulled=false;
  const attr=o.geometry.attributes.position,original=new Float32Array(attr.array),points=[];
  const inv=o.matrixWorld.clone().invert();for(let i=0;i<attr.count;i++)points.push(new THREE.Vector3().fromBufferAttribute(attr,i).applyMatrix4(o.matrixWorld));
  parts.push({o,attr,original,points,inv});
 });
 let started=opened?performance.now()-4800:null;let lastElapsed=-1;let elapsed=opened?4.8:0,progress=opened?1:0,active=opened;
 const smooth=t=>t*t*t*(t*(t*6-15)+10),p=new THREE.Vector3();
 function update(dt,wanted){
  active ||= wanted;
  if(active&&started===null)started=performance.now();
  elapsed=active?Math.min(4.8,(performance.now()-started)/1000):0;progress=smooth(Math.min(1,elapsed/4.2));
  daylight.value=smooth(THREE.MathUtils.clamp((elapsed-.4)/4.3,0,1));
  // Finish the light transition after the hand movement has settled.
  if(progress===1)daylight.value=THREE.MathUtils.damp(daylight.value,1,3,dt);
  if(elapsed===lastElapsed)return;lastElapsed=elapsed;
  for(const {o,attr,points,inv} of parts){
   for(let i=0;i<points.length;i++){
    p.copy(points[i]);const left=p.x<2,outer=left?1.05:3.01,inner=left?1.48:2.61;
    const u=THREE.MathUtils.clamp((p.x-outer)/(inner-outer),0,1),height=THREE.MathUtils.clamp((p.y-.89)/1.83,0,1);
    // Hem follows the upper pulling point with a small delay and soft sway.
    const local=smooth(THREE.MathUtils.clamp(Math.min(1,elapsed/4.2)-(1-height)*.055*Math.sin(Math.PI*Math.min(1,elapsed/4.2)),0,1));
    const closedInner=left?2.025:1.995;
    p.x=outer+(THREE.MathUtils.lerp(closedInner,inner,local)-outer)*u;
    p.z=-4.18+(p.z+4.18)*THREE.MathUtils.lerp(.38,1,local)+Math.sin(u*9+elapsed*3.1)*Math.sin(Math.PI*Math.min(1,elapsed/4.2))*.022*(1-height);
    p.y+=Math.sin(u*8+elapsed*2.4)*Math.sin(Math.PI*Math.min(1,elapsed/4.2))*.012*(1-height);
    p.applyMatrix4(inv);attr.setXYZ(i,p.x,p.y,p.z);
   }
   attr.needsUpdate=true;o.geometry.computeVertexNormals();
  }
 }
 update(0,opened);
 return {update,stats:()=>({progress,daylight:daylight.value,parts:parts.length,opened:active}),get moving(){return active&&daylight.value<.999;}};
}

import {daylight} from './daylight.js';
import {foregroundVolumes} from './foregroundHalftone.js';
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
 // The window is a portal through its actual room-side opening, not a
 // billboard: every visible fragment's sightline must cross that opening.
 const vertex=`varying vec3 vHtWorld;void main(){vHtWorld=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
 const visibility=`varying vec3 vHtWorld;
 uniform float htPixelRatio;
 uniform vec4 uWalls;
 uniform float portalFade;
 float portalVisibility(){
  if(cameraPosition.z<=-4.29)discard;
  vec3 sight=vHtWorld-cameraPosition;
  if(sight.z>=0.)discard;
  float t=(-4.29-cameraPosition.z)/sight.z;
  if(t<0.||t>1.)discard;
  vec3 entry=cameraPosition+t*sight;
  if(entry.x<1.11||entry.x>2.90||entry.y<.71||entry.y>2.75)discard;
  // Use the same window furniture and north-wall fade as the room passes.
  float fade=portalFade;
  if(fade>.997)discard;
  vec2 grid=mat2(.70710678,-.70710678,.70710678,.70710678)*(gl_FragCoord.xy/max(htPixelRatio,1.))/7.;
  if(fade>.001&&length(fract(grid)-.5)>mix(.711,.135,fade))discard;
  return fade;
 }
 `;
 const uniforms={roomDaylight:daylight,portalFade:{value:0},view:{value:target.texture},resolution:{value:new THREE.Vector2(1,1)}};
 const material=new THREE.ShaderMaterial({uniforms,vertexShader:vertex,fragmentShader:`uniform sampler2D view;uniform float roomDaylight;uniform vec2 resolution;${visibility}void main(){portalVisibility();gl_FragColor=texture2D(view,gl_FragCoord.xy/resolution);gl_FragColor.rgb*=roomDaylight;}`,side:THREE.FrontSide,toneMapped:false});
 const normal=new THREE.ShaderMaterial({uniforms,vertexShader:vertex,fragmentShader:`${visibility}void main(){float fade=portalVisibility();gl_FragColor=vec4(0.,0.,0.,1.-fade*.5);}`,side:THREE.FrontSide});
 const portals=[];
 const add=(w,h,p,rot)=>{const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),material);m.position.set(...p);m.rotation.y=rot;m.userData.daylightPortal=true;m.userData.portalNormal=normal;model.add(m);m.updateWorldMatrix(true,false);m.userData.corners=[[-w/2,h/2,0],[w/2,h/2,0],[w/2,-h/2,0],[-w/2,-h/2,0]].map(p=>new THREE.Vector3(...p).applyMatrix4(m.matrixWorld));m.userData.facing=new THREE.Vector3(0,0,1).transformDirection(m.matrixWorld);portals.push(m);};
 add(1.79,2.04,[2.005,1.73,-5.02],0);add(.74,2.04,[1.11,1.73,-4.65],Math.PI/2);add(.74,2.04,[2.90,1.73,-4.65],-Math.PI/2);
 const aperture=new THREE.Box3(new THREE.Vector3(1.11,.71,-4.30),new THREE.Vector3(2.90,2.75,-4.28));
 const frustum=new THREE.Frustum(),matrix=new THREE.Matrix4(),size=new THREE.Vector2();
 const opening=[new THREE.Vector3(1.11,2.75,-4.29),new THREE.Vector3(2.90,2.75,-4.29),new THREE.Vector3(2.90,.71,-4.29),new THREE.Vector3(1.11,.71,-4.29)];
 const openingCenter=new THREE.Vector3(2.005,1.73,-4.29);
 function clipPolygon(points,plane){
  const out=[];
  for(let i=0;i<points.length;i++){
   const a=points[i],b=points[(i+1)%points.length],da=plane.distanceToPoint(a),db=plane.distanceToPoint(b);
   if(da>=0)out.push(a);
   if((da>=0)!==(db>=0))out.push(a.clone().lerp(b,da/(da-db)));
  }
  return out;
 }
 const windowGroup=foregroundVolumes.find(v=>v.id==='window');
 const windowCenter=new THREE.Vector3(...windowGroup.min).add(new THREE.Vector3(...windowGroup.max)).multiplyScalar(.5);
 const viewDirection=new THREE.Vector3(),s=THREE.MathUtils.smoothstep;
 let frames=0,visible=false,wallUniform,foregroundUniforms;
 function updateFade(camera){
  // Same group-center formula as htAmount; the whole bay shares one screen.
  viewDirection.copy(camera.position).sub(new THREE.Vector3(1.75,.95,-2.15)).normalize();
  const horizontal=Math.hypot(viewDirection.x,viewDirection.z);
  const front=horizontal>0?((windowCenter.x-1.75)*viewDirection.x+(windowCenter.z+2.15)*viewDirection.z)/horizontal:0;
  const top=s(viewDirection.y,.65,.95);
  const furniture=foregroundUniforms.htEnabled.value>.5?Math.max(s(front,-.12,.68),top)*Math.max(s(horizontal,.12,.55),top):0;
  uniforms.portalFade.value=Math.max(wallUniform.value.z,furniture);
 }
 return {
  bindVisibility(walls,foreground){wallUniform=walls;foregroundUniforms=foreground;Object.assign(uniforms,foreground,{uWalls:walls,htProtect:{value:0}});},
  stats(){return {visible,frames,fade:uniforms.portalFade.value,portals:portals.map(p=>p.visible)};},
  render(renderer,camera){
   updateFade(camera);camera.updateMatrixWorld();matrix.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);frustum.setFromProjectionMatrix(matrix);
   visible=daylight.value>.001&&camera.position.z>-4.29&&uniforms.portalFade.value<.997&&frustum.intersectsBox(aperture);
   const clipping=visible?opening.map((p,i)=>{const plane=new THREE.Plane().setFromCoplanarPoints(camera.position,p,opening[(i+1)%4]);if(plane.distanceToPoint(openingCenter)<0)plane.negate();return plane;}).concat(frustum.planes):[];
   let any=false;
   for(const portal of portals){
    let polygon=portal.userData.corners;
    let inside=visible&&portal.userData.facing.dot(camera.position.clone().sub(portal.position))>0;
    if(inside)for(const plane of clipping){polygon=clipPolygon(polygon,plane);if(polygon.length<3){inside=false;break;}}
    portal.visible=inside;any ||= inside;
   }
   visible=any;
   // No exterior render pass, texture resize or scene traversal from outside.
   if(!visible)return;
   renderer.getDrawingBufferSize(size);if(target.width!==size.x||target.height!==size.y){target.setSize(size.x,size.y);uniforms.resolution.value.copy(size);}
   const previous=renderer.getRenderTarget();renderer.setRenderTarget(target);renderer.clear();renderer.render(scene,camera);renderer.setRenderTarget(previous);frames++;
  },
  dispose(){target.dispose();material.dispose();normal.dispose();scene.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});}
 };
}

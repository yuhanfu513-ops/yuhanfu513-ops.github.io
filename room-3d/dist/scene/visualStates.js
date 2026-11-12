import * as THREE from 'three';
import {objects} from '../content/objects.js';
const wallFragment=`
uniform vec4 uWalls;
varying vec3 vRoomWorld;
float wallVisibility(){
 float a=0.;
 if(vRoomWorld.x<.04)a=max(a,uWalls.x);
 if(vRoomWorld.x>3.46)a=max(a,uWalls.y);
 if(vRoomWorld.z< -4.26)a=max(a,uWalls.z);
 if(vRoomWorld.z>-.04)a=max(a,uWalls.w);
 float lift=smoothstep(.045,.43,vRoomWorld.y);
 float keep=1.-a*lift;
 return keep;
}
`;
function injectCut(material,wallUniform,ceiling=false){
 material.onBeforeCompile=shader=>{
  shader.uniforms.uWalls=wallUniform;
  shader.vertexShader='varying vec3 vRoomWorld;\n'+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>',`#include <project_vertex>
  vec4 roomP=vec4(transformed,1.);
  #ifdef USE_INSTANCING
  roomP=instanceMatrix*roomP;
  #endif
  vRoomWorld=(modelMatrix*roomP).xyz;`);
  shader.fragmentShader=wallFragment+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <clipping_planes_fragment>',`#include <clipping_planes_fragment>
  float wallAlpha=${ceiling?'0.':'wallVisibility()'};
  if(wallAlpha<.003)discard;`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <alphatest_fragment>', 'diffuseColor.a *= wallAlpha;\n#include <alphatest_fragment>');
  if(material.isMeshNormalMaterial)shader.fragmentShader=shader.fragmentShader.replace('diffuseColor.a );','diffuseColor.a * wallAlpha );');
 };
 material.transparent=true;material.depthWrite=material.isMeshNormalMaterial;
 material.customProgramCacheKey=()=>ceiling?'room-roof-v1':'room-wall-v1';material.needsUpdate=true;
}
const vertex=`varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`;
const fragment=`precision highp float;
uniform sampler2D tColor,tNormal,tDepth;
uniform mat4 invProjection,camWorld;
uniform vec2 pixel,viewport;
uniform float time,debugView,modal;
uniform vec3 zoneCenter[3],zoneRadius[3],storyCenter[3],storyRadius[3];
uniform vec3 lit,explored;
varying vec2 vUv;
float ripple(vec3 p){return sin(p.x*5.1+time*.31)*sin(p.z*4.7-time*.27)*sin(p.y*5.8+time*.21)*.07;}
float zone(vec3 p,vec3 c,vec3 r){float d=length((p-c)/r);return 1.-smoothstep(.72,1.15,d+ripple(p));}
void main(){
 float depth=texture2D(tDepth,vUv).x;
 if(depth>=.999999){gl_FragColor=vec4(0.,0.,0.,1.);return;}
 vec4 vp=invProjection*vec4(vUv*2.-1.,depth*2.-1.,1.);vp/=vp.w;
 vec3 world=(camWorld*vp).xyz;
 vec3 color=texture2D(tColor,vUv).rgb*1.12;
 color=clamp((color*(2.51*color+.03))/(color*(2.43*color+.59)+.14),0.,1.);
 vec3 n=texture2D(tNormal,vUv).xyz;
 float edge=0.;float dz=0.;
 for(int i=0;i<4;i++){
  vec2 off=i==0?vec2(pixel.x,0.):i==1?vec2(-pixel.x,0.):i==2?vec2(0.,pixel.y):vec2(0.,-pixel.y);
  vec3 nb=texture2D(tNormal,vUv+off).xyz;
  edge=max(edge,length(n-nb));
  float db=texture2D(tDepth,vUv+off).x;
  vec4 other=invProjection*vec4((vUv+off)*2.-1.,db*2.-1.,1.);
  dz=max(dz,abs(other.z/other.w-vp.z)/max(.5,-vp.z));
 }
 edge=max(smoothstep(.07,.32,edge),smoothstep(.002,.012,dz));
 float reveal=0.,colorMask=0.;
 for(int i=0;i<3;i++){
  reveal=max(reveal,zone(world,zoneCenter[i],zoneRadius[i])*lit[i]);
  colorMask=max(colorMask,zone(world,storyCenter[i],storyRadius[i])*explored[i]);
 }
 float fill=(.018+.025*max(n.z,.0));
 vec3 ink=vec3(fill+edge*.78);
 vec3 outColor=mix(ink*reveal,color,colorMask);
 if(debugView>1.5)outColor=color;else if(debugView>.5)outColor=ink;
 gl_FragColor=vec4(outColor*mix(1.,.035,modal),1.);
 #include <colorspace_fragment>
}`;
export class VisualStates{
 constructor(renderer,scene,camera,model,mobile){
  this.renderer=renderer;this.scene=scene;this.camera=camera;this.entries=[];
  this.walls={value:new THREE.Vector4()};this.direction=new THREE.Vector3();this.center=new THREE.Vector3(1.75,1,-2.15);
  this.composedRT=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType});
  this.colorRT=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType});
  this.normalRT=new THREE.WebGLRenderTarget(1,1,{minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter});
  this.normalRT.samples=mobile?0:2;
  this.normalRT.depthTexture=new THREE.DepthTexture(1,1,THREE.UnsignedIntType);
  model.traverse(o=>{
   if(!o.isMesh)return;
   const name=o.userData.sourceName||o.name,m=o.material;
   if(o.userData.exterior){o.visible=false;return;}
   const ceiling=/^Ceiling/.test(name);
   const architectural=/Warm ivory painted plaster/.test(m.name)||ceiling||(/Ivory satin joinery_cutaway/.test(m.name));
   const normal=new THREE.MeshNormalMaterial({side:m.side});
   if(architectural){o.material=m.clone();injectCut(o.material,this.walls,ceiling);injectCut(normal,this.walls,ceiling);o.castShadow=false;}
   this.entries.push({object:o,color:o.material,normal,skip:m.transparent&&m.opacity<.2});
  });
  const ls=['left','desk','bedside'],ss=['cello','boots','laptop'];
  this.uniforms={tColor:{value:this.colorRT.texture},tNormal:{value:this.normalRT.texture},tDepth:{value:this.normalRT.depthTexture},invProjection:{value:camera.projectionMatrixInverse},camWorld:{value:camera.matrixWorld},pixel:{value:new THREE.Vector2()},viewport:{value:new THREE.Vector2()},time:{value:0},debugView:{value:0},modal:{value:0},zoneCenter:{value:ls.map(k=>new THREE.Vector3(...objects[k].zone))},zoneRadius:{value:ls.map(k=>new THREE.Vector3(...objects[k].radius))},storyCenter:{value:ss.map(k=>new THREE.Vector3(...objects[k].anchor))},storyRadius:{value:ss.map(k=>new THREE.Vector3(...objects[k].radius))},lit:{value:new THREE.Vector3()},explored:{value:new THREE.Vector3()}};
  this.quadScene=new THREE.Scene();this.quadCamera=new THREE.Camera();this.quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),new THREE.ShaderMaterial({uniforms:this.uniforms,vertexShader:vertex,fragmentShader:fragment,depthTest:false,depthWrite:false,toneMapped:false}));this.quadScene.add(this.quad);
  this.blurScene=new THREE.Scene();this.blurQuad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),new THREE.ShaderMaterial({uniforms:{tex:{value:this.composedRT.texture},pixel:this.uniforms.pixel,strength:this.uniforms.modal},vertexShader:vertex,fragmentShader:`uniform sampler2D tex;uniform vec2 pixel;uniform float strength;varying vec2 vUv;void main(){vec2 s=pixel*strength*2.6;vec3 c=texture2D(tex,vUv).rgb*.2;c+=texture2D(tex,vUv+vec2(s.x,0.)).rgb*.12;c+=texture2D(tex,vUv-vec2(s.x,0.)).rgb*.12;c+=texture2D(tex,vUv+vec2(0.,s.y)).rgb*.12;c+=texture2D(tex,vUv-vec2(0.,s.y)).rgb*.12;c+=texture2D(tex,vUv+s).rgb*.08;c+=texture2D(tex,vUv-s).rgb*.08;c+=texture2D(tex,vUv+vec2(s.x,-s.y)).rgb*.08;c+=texture2D(tex,vUv+vec2(-s.x,s.y)).rgb*.08;gl_FragColor=vec4(c,1.);
#include <colorspace_fragment>
}`,depthTest:false,depthWrite:false,toneMapped:false}));this.blurScene.add(this.blurQuad);
 }
 update(time,dt,state){
  const u=this.uniforms;u.time.value=time;u.modal.value=THREE.MathUtils.damp(u.modal.value,state.activeStory?1:0,5,dt);
  this.direction.copy(this.camera.position).sub(this.center).normalize();
  const d=this.direction,s=THREE.MathUtils.smoothstep;this.walls.value.set(s(-d.x,.02,.40),s(d.x,.02,.40),s(-d.z,.02,.40),s(d.z,.02,.40));
  ['left','desk','bedside'].forEach((k,i)=>{const target=state.illuminatedLights.has(k)?1:0;u.lit.value.setComponent(i,THREE.MathUtils.damp(u.lit.value.getComponent(i),target,5,dt))});
  ['cello','boots','laptop'].forEach((k,i)=>{u.explored.value.setComponent(i,THREE.MathUtils.damp(u.explored.value.getComponent(i),state.exploredObjects.has(k)?1:0,4,dt))});
 }
 resize(w,h){this.composedRT.setSize(w,h);this.colorRT.setSize(w,h);this.normalRT.setSize(w,h);this.uniforms.pixel.value.set(1/w,1/h);this.uniforms.viewport.value.set(w,h);}
 render(){
  const r=this.renderer,u=this.uniforms;
  const reveal=u.debugView.value>0||u.lit.value.lengthSq()>.0001||u.explored.value.lengthSq()>.0001;
  if(!reveal){r.setRenderTarget(null);r.clear();return;}
  if(u.explored.value.lengthSq()>.0001||u.debugView.value>1.5){r.setRenderTarget(this.colorRT);r.clear();r.render(this.scene,this.camera);}
  for(const e of this.entries){e.object.material=e.normal;if(e.skip)e.object.visible=false;}
  r.setRenderTarget(this.normalRT);r.clear();r.render(this.scene,this.camera);
  for(const e of this.entries){e.object.material=e.color;if(e.skip)e.object.visible=true;}
  if(u.modal.value>.002){r.setRenderTarget(this.composedRT);r.clear();r.render(this.quadScene,this.quadCamera);r.setRenderTarget(null);r.clear();r.render(this.blurScene,this.quadCamera)}else{r.setRenderTarget(null);r.clear();r.render(this.quadScene,this.quadCamera);}
 }
 dispose(){this.composedRT.dispose();this.blurQuad.geometry.dispose();this.blurQuad.material.dispose();this.colorRT.dispose();this.normalRT.dispose();this.entries.forEach(e=>e.normal.dispose());this.quad.geometry.dispose();this.quad.material.dispose();}
}

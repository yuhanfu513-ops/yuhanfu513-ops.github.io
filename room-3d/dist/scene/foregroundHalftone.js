import * as THREE from 'three';
import {objects} from '../content/objects.js';
// Measured spatial groups: merged materials can contain unrelated props, so never
// fade a whole material or trust its first exported source name.
export const foregroundVolumes=[
 {id:'bookcase',min:[-.01,.18,-2.88],max:[.48,2.85,-.88]},
 {id:'wardrobe',min:[2.70,.18,-4.32],max:[3.53,2.84,-3.48]},
 {id:'headboard',min:[3.29,.34,-1.60],max:[3.54,1.56,-.02]},
 {id:'radiatorAndFrame',min:[0,.18,-3.80],max:[.18,2.12,-2.82]},
 {id:'window',min:[1.10,.18,-5.02],max:[2.91,2.84,-3.94]},
 {id:'chestAndPoster',min:[.12,.18,-4.30],max:[1.17,2.65,-3.78]},
 {id:'door',min:[-.10,.30,-.86],max:[1.20,2.35,.18]},
 {id:'airConditioner',min:[0,2.30,-3.79],max:[.42,2.70,-2.83]}
];
const protectedIds=['left','desk','bedside','cello','boots','laptop'];
export function createForegroundUniforms(renderer){return {
 htEnabled:{value:1},htPixelRatio:{value:renderer.getPixelRatio()},
 htMin:{value:foregroundVolumes.map(v=>new THREE.Vector3(...v.min))},htMax:{value:foregroundVolumes.map(v=>new THREE.Vector3(...v.max))},
 htProtectedMin:{value:protectedIds.map(id=>new THREE.Vector3(...objects[id].min).addScalar(-.025))},htProtectedMax:{value:protectedIds.map(id=>new THREE.Vector3(...objects[id].max).addScalar(.025))}
};}
const pars=`
varying vec3 vHtWorld;
uniform float htEnabled,htPixelRatio;
uniform vec3 htMin[8],htMax[8],htProtectedMin[6],htProtectedMax[6];
float htInside(vec3 p,vec3 lo,vec3 hi){return step(lo.x,p.x)*step(lo.y,p.y)*step(lo.z,p.z)*step(p.x,hi.x)*step(p.y,hi.y)*step(p.z,hi.z);}
float htAmount(vec3 p){
 if(htEnabled<.5)return 0.;
 for(int i=0;i<6;i++){if(htInside(p,htProtectedMin[i],htProtectedMax[i])>.5)return 0.;}
 float eligible=0.;for(int i=0;i<8;i++)eligible=max(eligible,htInside(p,htMin[i],htMax[i]));
 if(eligible<.5)return 0.;
 vec3 view=normalize(cameraPosition-vec3(1.75,.95,-2.15));
 float front=dot(p.xz-vec2(1.75,-2.15),normalize(view.xz));
 return smoothstep(-.12,.68,front)*smoothstep(.12,.55,length(view.xz))*smoothstep(.18,.43,p.y);
}
`;
export function applyForegroundHalftone(material,uniforms,normal=false){
 const before=material.onBeforeCompile,cache=material.customProgramCacheKey.bind(material);
 material.onBeforeCompile=shader=>{
  before(shader);Object.assign(shader.uniforms,uniforms);
  shader.vertexShader='varying vec3 vHtWorld;\n'+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>',`#include <project_vertex>
  vec4 htP=vec4(transformed,1.);
  #ifdef USE_INSTANCING
  htP=instanceMatrix*htP;
  #endif
  vHtWorld=(modelMatrix*htP).xyz;`);
  shader.fragmentShader=pars+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <clipping_planes_fragment>',`#include <clipping_planes_fragment>
  float htFade=htAmount(vHtWorld);
  // A shared, 45-degree Ben-Day screen opens real depth holes through every
  // foreground layer. It is identical in color and normal/depth rendering.
  vec2 htScreen=gl_FragCoord.xy/max(htPixelRatio,1.);
  vec2 htGrid=mat2(.70710678,-.70710678,.70710678,.70710678)*htScreen/7.;
  float htDistance=length(fract(htGrid)-.5);
  float htRadius=mix(.711,.135,htFade);
  if(htFade>.001 && htDistance>htRadius)discard;`);
  if(normal){const end=shader.fragmentShader.lastIndexOf('}');shader.fragmentShader=shader.fragmentShader.slice(0,end)+'\n gl_FragColor.a=1.-htFade*.5;\n'+shader.fragmentShader.slice(end);}
 };
 material.customProgramCacheKey=()=>cache()+'-foreground-benday-v1';material.needsUpdate=true;
}

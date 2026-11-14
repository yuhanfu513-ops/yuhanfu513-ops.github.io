import {daylight,nightLamps} from './daylight.js';
import {blenderLookTexture,blenderLookGLSL} from './blenderLook.js';
// Irradiance is baked in Cycles with the source daylight, warm lamps and bounce
// lighting. Keep it separate from albedo and normals; moving highlights stay PBR.
export function applyBakedMaterial(material){
 const range=material.userData.bakedIrradiance;
 if(typeof material.userData.sourceSheenWeight==='number'&&'sheen' in material)material.sheen=material.userData.sourceSheenWeight;

 if(range&&material.emissiveMap){material.lightMap=material.emissiveMap;material.emissiveMap=null;material.emissive.setScalar(0);material.emissiveIntensity=0;}
 if(material.userData.warmTranslucentShade){material.emissive.setRGB(.28,.18,.075);material.emissiveIntensity=1;}
 if(range&&material.lightMap)material.lightMapIntensity=range;
 const previous=material.onBeforeCompile,oldKey=material.customProgramCacheKey.bind(material);
 material.onBeforeCompile=(shader,renderer)=>{
  previous(shader,renderer);shader.uniforms.blenderLookLut=blenderLookTexture;
  shader.uniforms.roomDaylight=daylight;shader.uniforms.nightLamps=nightLamps;
  shader.vertexShader='varying vec3 vLightingWorld;\n'+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>',`#include <project_vertex>
   vec4 lightingP=vec4(transformed,1.);
   #ifdef USE_INSTANCING
   lightingP=instanceMatrix*lightingP;
   #endif
   vLightingWorld=(modelMatrix*lightingP).xyz;`);
  shader.fragmentShader='varying vec3 vLightingWorld;uniform float roomDaylight;uniform vec3 nightLamps;\n'+blenderLookGLSL+'\n'+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <tonemapping_fragment>',`#ifdef TONE_MAPPING
 gl_FragColor.rgb=sourceBlenderLook(gl_FragColor.rgb);
#endif`);
  if(range&&material.lightMap)shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_end>',`#include <lights_fragment_end>
  #ifdef USE_LIGHTMAP
   reflectedLight.directDiffuse=vec3(0.);
   vec3 warmNight=vec3(.006,.004,.002);
   warmNight+=vec3(1.,.52,.19)*nightLamps.x*.24/(.08+pow(distance(vLightingWorld,vec3(.90,1.75,-4.03)),2.));
   warmNight+=vec3(1.,.64,.31)*nightLamps.y*.30/(.08+pow(distance(vLightingWorld,vec3(3.12,1.39,-2.79)),2.));
   warmNight+=vec3(1.,.55,.22)*nightLamps.z*.26/(.08+pow(distance(vLightingWorld,vec3(3.23,1.29,-1.74)),2.));
   reflectedLight.indirectDiffuse=mix(warmNight,${/V4 boot|Shoes |Storage warm white lacquer|Storage raised moulding|Ivory satin joinery/.test(material.name)?'max(texture2D(lightMap,vLightMapUv).rgb*lightMapIntensity,vec3(.48))':'texture2D(lightMap,vLightMapUv).rgb*lightMapIntensity'},roomDaylight)*diffuseColor.rgb*(1.-metalnessFactor);
  #endif`);
 };
 material.customProgramCacheKey=()=>oldKey()+'-cycles-night-day-v3-'+(/V4 boot|Shoes |Storage warm white lacquer|Storage raised moulding|Ivory satin joinery/.test(material.name)?'footwear':'room');material.needsUpdate=true;return Boolean(range&&material.lightMap);
}

export function fitTextureBudget(model,renderer,mobile){
 const seen=new Set(),resized=new Map();let count=0;
 model.traverse(o=>{
  if(!o.isMesh)return;
  for(const texture of Object.values(o.material)){
   if(!texture?.isTexture||seen.has(texture))continue;seen.add(texture);
   const source=texture.image;if(!source)continue;
   const cap=mobile?2048:4096,scale=Math.min(1,cap/Math.max(source.width,source.height));
   if(scale<1){
    let canvas=resized.get(source);
    if(!canvas){canvas=document.createElement('canvas');canvas.width=Math.round(source.width*scale);canvas.height=Math.round(source.height*scale);canvas.getContext('2d').drawImage(source,0,0,canvas.width,canvas.height);resized.set(source,canvas);}
    texture.image=canvas;texture.needsUpdate=true;count++;
   }
   texture.anisotropy=Math.min(mobile?2:8,renderer.capabilities.getMaxAnisotropy());
  }
 });
 return {textures:seen.size,resized:count,maxDimension:mobile?2048:4096};
}

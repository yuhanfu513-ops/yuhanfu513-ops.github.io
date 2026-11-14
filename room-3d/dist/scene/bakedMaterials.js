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
  shader.fragmentShader=blenderLookGLSL+'\n'+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <tonemapping_fragment>',`#ifdef TONE_MAPPING
 gl_FragColor.rgb=sourceBlenderLook(gl_FragColor.rgb);
#endif`);
  if(range&&material.lightMap)shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_end>',`#include <lights_fragment_end>
  #ifdef USE_LIGHTMAP
   reflectedLight.directDiffuse=vec3(0.);
   reflectedLight.indirectDiffuse=${/V4 boot|Shoes |Storage warm white lacquer|Storage raised moulding|Ivory satin joinery/.test(material.name)?'max(texture2D(lightMap,vLightMapUv).rgb*lightMapIntensity,vec3(.48))':'texture2D(lightMap,vLightMapUv).rgb*lightMapIntensity'}*diffuseColor.rgb*(1.-metalnessFactor);
  #endif`);
 };
 material.customProgramCacheKey=()=>oldKey()+'-cycles-irradiance-v2-'+(/V4 boot|Shoes |Storage warm white lacquer|Storage raised moulding|Ivory satin joinery/.test(material.name)?'footwear':'room');material.needsUpdate=true;return Boolean(range&&material.lightMap);
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

import * as THREE from 'three';

export const aperture = {value: 0};
export const floorSunWeight = {value: 0.8};
const atlas = {value: null};
const texel = {value: new THREE.Vector2()};

export async function loadReceiverLights(mobile) {
  const file = mobile ? 'receiver-light-mobile.webp' : 'receiver-light.webp';
  const response = await fetch(new URL('../assets/' + file, import.meta.url));
  if (!response.ok) throw new Error('无法载入地板光照贴图');
  // RGB stores log irradiance, alpha is independent solar visibility. Decode
  // without premultiplication, including on pixels almost entirely in shadow.
  const bitmap = await createImageBitmap(await response.blob(), {
    imageOrientation: 'flipY', premultiplyAlpha: 'none', colorSpaceConversion: 'none'
  });
  const texture = new THREE.Texture(bitmap);
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  texel.value.set(4 / bitmap.width, 2 / bitmap.height);
  atlas.value = texture;
  texture.addEventListener('dispose', () => bitmap.close());
}
export function disposeReceiverLights() {
  atlas.value?.dispose();
  atlas.value = null;
}

const sampling = `
uniform sampler2D receiverAtlas;
uniform vec2 receiverTexel;
uniform float curtainAperture, floorSunWeight;
vec4 readReceiver(vec2 uv,float tile) {
  vec2 offset=vec2(mod(tile,4.),floor(tile/4.));
  vec4 data=texture2D(receiverAtlas,(uv+offset)/vec2(4.,2.));
  return vec4((exp2(data.rgb*10.)-1.)/32.,(255.*data.a-1.)/254.);
}
`;
export function receiverKind(name) {
  if (/Floor walnut board tone/.test(name)) return 'floor';
  if (/Ivory satin joinery/.test(name)) return 'bay';
  return '';
}
export function applyReceiverLights(shader,kind) {
  Object.assign(shader.uniforms, {
    receiverAtlas:atlas,receiverTexel:texel,curtainAperture:aperture,floorSunWeight
  });
  const floor = kind === 'floor';
  shader.fragmentShader = sampling + shader.fragmentShader;
  const select = floor ? 'true' :
    'vLightingWorld.x>1.04 && vLightingWorld.x<2.86 && vLightingWorld.y<.82 && vLightingWorld.z< -4.229 && vLightingWorld.z> -4.27';
  const uv = floor ?
    'vec2(vLightingWorld.x/3.5, -vLightingWorld.z/4.30)' :
    'vec2((vLightingWorld.x-1.05)/1.8,vLightingWorld.y/.84)';
  const ymin = floor ? '0.' : '.8', ymax = floor ? '.8' : '1.';
  const setup = `
    bool receivesLayers = ${select};
    vec3 receiverDiffuse=vec3(0.);
    float solarVisibility=1.;
    float ambientVisibility=1.;
    if(receivesLayers) {
      vec2 uv=clamp(${uv},0.,1.);
      uv.y=mix(${ymin},${ymax},uv.y);
      uv=clamp(uv,vec2(0.,${ymin})+receiverTexel*.5,vec2(1.,${ymax})-receiverTexel*.5);
      vec4 leftLamp=readReceiver(uv,0.);
      ambientVisibility=leftLamp.a;
      receiverDiffuse = leftLamp.rgb*nightLamps.x
                      + readReceiver(uv,1.).rgb*nightLamps.y
                      + readReceiver(uv,2.).rgb*nightLamps.z;
      float frame=clamp(curtainAperture,0.,1.)*4.;
      float index=min(3.,floor(frame));
      vec4 windowLight=mix(readReceiver(uv,3.+index),readReceiver(uv,4.+index),frame-index);
      vec4 closed=readReceiver(uv,3.);
      // The closed blind still scatters sky light in Cycles. Admit this broad
      // component gently, independently of the moving direct sun boundary.
      receiverDiffuse+=max(vec3(0.),windowLight.rgb-closed.rgb*(1.-roomDaylight));
      solarVisibility=windowLight.a;
    }`;
  // Only the room sun uses a directional light. Its baked shadow replaces the
  // generic map on these receivers and is available on mobile as well.
  const chunk=THREE.ShaderChunk.lights_fragment_begin.replace(
    /(getDirectionalLightInfo\( directionalLight, directLight \);[\s\S]*?#endif)/,
    `$1\n if(receivesLayers)directLight.color=directionalLight.color*solarVisibility*${floor?'floorSunWeight':'1.'};`
  );
  shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_begin>',setup+'\n'+chunk);
  // Replace the old combined bake including its night estimate. Leave the
  // source wood, normal, coat, and all three warm lights' specular terms intact.
  shader.fragmentShader=shader.fragmentShader.replace('#include <aomap_fragment>',
    `#include <aomap_fragment>
    if(receivesLayers){
      // The environment probe sees no furniture. Mask its reflection locally
      // so it cannot wash out the contacts that Cycles already resolved.
      reflectedLight.indirectSpecular*=ambientVisibility;
      #ifdef USE_CLEARCOAT
      clearcoatSpecularIndirect*=ambientVisibility;
      #endif
      reflectedLight.directDiffuse=vec3(0.);
      reflectedLight.indirectDiffuse=receiverDiffuse*diffuseColor.rgb*(1.-metalnessFactor);
    }`);
}

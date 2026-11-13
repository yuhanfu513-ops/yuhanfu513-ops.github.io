import * as THREE from 'three';
export const blenderLookTexture={value:null};
export async function loadBlenderLook(){
 const texture=await new THREE.TextureLoader().loadAsync('./assets/blender-look.png');
 texture.colorSpace=THREE.SRGBColorSpace;texture.generateMipmaps=false;texture.minFilter=THREE.LinearFilter;texture.magFilter=THREE.LinearFilter;
 blenderLookTexture.value=texture;return texture;
}
// Blender 5.2's own OCIO output: AgX / Medium High Contrast / exposure +0.65.
// 32 cubed samples, log2 shaper [-12,+6] stops, tiled into a 1024 x 32 image.
export const blenderLookGLSL=`
uniform sampler2D blenderLookLut;
vec3 sourceBlenderLook(vec3 radiance){
 vec3 c=clamp((log2(max(radiance,vec3(.000244140625)))+12.)/18.,0.,1.)*31.;
 float b=floor(c.b),bn=min(b+1.,31.);
 vec2 uv0=vec2((b*32.+c.r+.5)/1024.,(c.g+.5)/32.);
 vec2 uv1=vec2((bn*32.+c.r+.5)/1024.,(c.g+.5)/32.);
 return mix(texture2D(blenderLookLut,uv0).rgb,texture2D(blenderLookLut,uv1).rgb,c.b-b);
}`;

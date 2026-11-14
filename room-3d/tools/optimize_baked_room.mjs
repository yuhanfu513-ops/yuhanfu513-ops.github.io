import {NodeIO} from '../node_modules/@gltf-transform/core/dist/index.js';
import {ALL_EXTENSIONS} from '../node_modules/@gltf-transform/extensions/dist/index.js';
import {dedup,weld,prune,textureCompress,meshopt} from '../node_modules/@gltf-transform/functions/dist/index.js';
import {MeshoptEncoder,MeshoptDecoder} from '../node_modules/meshoptimizer/index.js';
import sharp from '../node_modules/sharp/dist/index.mjs';
import fs from 'node:fs/promises';
await MeshoptEncoder.ready;await MeshoptDecoder.ready;
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder});
const doc=await io.read(new URL('./baked-room/room-baked-raw.glb',import.meta.url).pathname);
// Keep semantic glass separate from cabinet panes after material deduplication.
for(const m of doc.getRoot().listMaterials()){
 if(/transparent lamp chimney/.test(m.getName()))m.setExtras({...m.getExtras(),lampChimney:true});
 // The source red upper's procedural atlas was washed out. Retain the baked
 // surface normals and irradiance, with its original linear red base colour.
 if(/mottled red woven upper/.test(m.getName()))m.setBaseColorTexture(null).setBaseColorFactor([.50,.025,.014,1]).setExtras({...m.getExtras(),redBootUpper:true});
}
await doc.transform(dedup(),weld(),prune(),textureCompress({encoder:sharp,targetFormat:'webp',quality:95,resize:[2048,2048],slots:/normalTexture/}),textureCompress({encoder:sharp,targetFormat:'webp',quality:92,resize:[4096,4096],slots:/^(?!normalTexture).*$/}),meshopt({encoder:MeshoptEncoder,level:'medium'}));
const root=doc.getRoot();const audit=root.listMaterials().map(m=>({name:m.getName(),extras:m.getExtras(),normal:!!m.getNormalTexture(),emissive:!!m.getEmissiveTexture(),lightUv:m.getEmissiveTextureInfo()?.getTexCoord()}));
await fs.writeFile(new URL('./baked-room/export-audit.json',import.meta.url),JSON.stringify({materials:audit,textures:root.listTextures().map(t=>({name:t.getName(),size:t.getSize(),bytes:t.getImage().byteLength})),meshes:root.listMeshes().length},null,2));
await io.write(new URL('../dist/assets/room-baked.glb',import.meta.url).pathname,doc);console.log('BAKED_GLB_READY',audit.length,root.listTextures().length);

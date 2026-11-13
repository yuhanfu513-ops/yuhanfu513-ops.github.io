import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {createStore} from './interaction/store.js';
import {objects} from './content/objects.js';
import {stories} from './content/stories.js';
import {loadBlenderLook} from './scene/blenderLook.js';
import {applyBakedMaterial,fitTextureBudget} from './scene/bakedMaterials.js';
import {VisualStates} from './scene/visualStates.js';
import {createRegistry,simpleLamps} from './scene/objectRegistry.js';
import {setupStoryPanel} from './ui/storyPanel.js';
const $=s=>document.querySelector(s),mobile=matchMedia('(max-width:700px)').matches,touch=matchMedia('(pointer:coarse)').matches,reduced=matchMedia('(prefers-reduced-motion:reduce)').matches;
const store=createStore(),state=store.state,api={loaded:false,errors:[],state:()=>store.snapshot()};window.roomExplorer=api;
let renderer,scene,camera,controls,model,visual,registry,basic,lights=[],presentationScene,presentationCamera,presentationObject=null,dirty=true,raf=0,lastTime=0,lastRender=0,paused=false,closing=false;
let fullRoom=false;
let pointerX=-200,pointerY=-200,cursorX=-200,cursorY=-200,pressed=false,hoverId=null,dragStart=null;
const center=new THREE.Vector3(1.75,.95,-2.15),projected=new THREE.Vector3(),pointer=new THREE.Vector2(),ray=new THREE.Raycaster(),hitPoint=new THREE.Vector3();
const zoneBoxes=Object.fromEntries(['left','desk','bedside'].map(id=>{const s=objects[id];return[id,new THREE.Box3(new THREE.Vector3(...s.zone).sub(new THREE.Vector3(...s.radius)),new THREE.Vector3(...s.zone).add(new THREE.Vector3(...s.radius))) ]}));
const buttons=new Map(),menus=new Map(),cursor=$('#cursor'),lampIds=['left','desk','bedside'],storyIds=['cello','boots','laptop'];
const panel=setupStoryPanel(store,id=>{setHover(null);closing=false;controls&&(controls.enabled=false);presentationObject=null;if(presentationScene)for(const child of [...presentationScene.children])if(child.userData.story)presentationScene.remove(child);if(registry?.[id]?.presentation){presentationObject=registry[id].presentation;presentationObject.userData.story=true;presentationScene.add(presentationObject);fitPresentation(id)}dirty=true},()=>{closing=true;controls&&(controls.enabled=true);dirty=true});
function interact(id,source){if(fullRoom&&stories[id])store.light(stories[id].unlockLight);if(objects[id]?.type==='lamp'){store.light(id);$('#status').textContent=objects[id].label+'已点亮';dirty=true}else panel.open(id,source)}
function updateUI(){
 $('#progress-count').textContent=String(state.exploredObjects.size).padStart(2,'0')+' / 03';$('#help').hidden=!state.helpUnlocked;document.body.classList.toggle('started',state.illuminatedLights.size>0);
 $('#invitation').textContent=state.helpUnlocked?'你已经认识了我的三个故事。':state.illuminatedLights.size?'点开被灯光照亮的物品。':'找到一盏灯，慢慢认识我。';
 for(const [id,b]of buttons){const isStory=objects[id].type==='story',unlocked=!isStory||fullRoom||state.illuminatedLights.has(stories[id].unlockLight);b.disabled=!unlocked;b.classList.toggle('visited',state.exploredObjects.has(id));if(!isStory)b.setAttribute('aria-pressed',String(state.illuminatedLights.has(id)));menus.get(id).disabled=!unlocked;}
 dirty=true;
}
for(const [id,spec]of Object.entries(objects)){
 const label=spec.label||stories[id].title,b=document.createElement('button');b.className='hotspot '+spec.type;b.dataset.id=id;b.setAttribute('aria-label',spec.type==='lamp'?'点亮'+label:'阅读'+label);b.innerHTML='<span></span>';b.firstChild.textContent=label;
 b.onclick=()=>interact(id,b);b.onpointerenter=()=>setHover(id);b.onpointerleave=()=>setHover(null);b.onfocus=()=>setHover(id);b.onblur=()=>setHover(null);$('#hotspots').append(b);buttons.set(id,b);
 const menu=document.createElement('button');menu.textContent=label;menu.dataset.action=id;menu.onclick=()=>{interact(id,menu);$('#access-list').hidden=true;$('#access-toggle').setAttribute('aria-expanded','false')};$('#access-list').append(menu);menus.set(id,menu);
}
store.subscribe(updateUI);updateUI();$('#help').onclick=()=>panel.open('help',$('#help'));
$('#access-toggle').onclick=()=>{const b=$('#access-list');b.hidden=!b.hidden;$('#access-toggle').setAttribute('aria-expanded',String(!b.hidden));if(!b.hidden)b.querySelector('button:not(:disabled)').focus()};
function setHover(id){hoverId=id;store.hover(id);dirty=true}
function resetCamera(){if(!camera)return;camera.position.copy(center).add(new THREE.Vector3(5.8,5.3,7.6).multiplyScalar(mobile?1.48:1));controls.target.copy(center);camera.fov=43;camera.updateProjectionMatrix();controls.update();dirty=true}
function setFullRoom(on){fullRoom=on;if(controls){controls.minDistance=on?3.6:5.3;controls.update();}if(visual)visual.uniforms.fullColor.value=on?1:0;$('#room-look').setAttribute('aria-pressed',String(on));$('#room-look').textContent=on?'故事探索':'房间原貌';document.body.classList.toggle('full-room',on);updateUI();dirty=true}
$('#room-look').onclick=()=>setFullRoom(!fullRoom);
$('.signature').onclick=e=>{e.preventDefault();resetCamera()};$('#reset-camera').onclick=resetCamera;
function fitPresentation(id){
 const rect=$('#showcase').getBoundingClientRect(),box=registry[id].box,size=box.getSize(new THREE.Vector3()),r=Math.max(size.x,size.y,size.z);
 presentationCamera.aspect=rect.width/Math.max(1,rect.height);presentationCamera.fov=34;presentationCamera.position.set(id==='laptop'?-1.3:0,id==='boots'?.7:.1,id==='laptop'?1.1:1.7).normalize().multiplyScalar(r*(mobile?2.15:2.3));presentationCamera.lookAt(0,0,0);presentationCamera.updateProjectionMatrix();
}
function fallback(error){api.errors.push(String(error));console.error(error);$('#loading').classList.add('done');$('#fallback').hidden=false;$('#hotspots').hidden=true;document.body.classList.remove('custom-cursor');for(const id of storyIds){const b=document.createElement('button');b.textContent=stories[id].title;b.onclick=()=>{store.light(stories[id].unlockLight);panel.open(id,b)};$('#fallback-links').append(b)}}
try{
 renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:location.hash.includes('figmacapture'),powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio,mobile?1.25:1.5));renderer.setSize(innerWidth,innerHeight);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.AgXToneMapping;renderer.toneMappingExposure=1.12;renderer.info.autoReset=false;renderer.shadowMap.enabled=!mobile;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.shadowMap.autoUpdate=false;$('#viewer').append(renderer.domElement);
 scene=new THREE.Scene();scene.background=new THREE.Color(0);camera=new THREE.PerspectiveCamera(43,innerWidth/innerHeight,.08,70);controls=new OrbitControls(camera,renderer.domElement);controls.enablePan=false;controls.enableDamping=true;controls.dampingFactor=.075;controls.minDistance=5.3;controls.maxDistance=17;controls.minPolarAngle=.06;controls.maxPolarAngle=Math.PI*.87;controls.addEventListener('change',()=>dirty=true);resetCamera();
 const env=new RoomEnvironment(),pmrem=new THREE.PMREMGenerator(renderer);scene.environment=pmrem.fromScene(env,.04).texture;scene.environmentIntensity=.45;env.dispose();pmrem.dispose();
 scene.add(new THREE.HemisphereLight('#e4eeff','#a08b6b',.65),new THREE.AmbientLight('#fff1dc',.25));
 const sun=new THREE.DirectionalLight('#fff0d7',1.3);sun.position.set(2.4,4.6,-8);sun.target.position.set(1.2,0,-.6);sun.castShadow=!mobile;sun.shadow.mapSize.set(1024,1024);Object.assign(sun.shadow.camera,{left:-4,right:4,top:4,bottom:-4,near:.1,far:20});sun.shadow.bias=-.0002;sun.shadow.normalBias=.001;scene.add(sun,sun.target);
 await loadBlenderLook();
 const meta=await fetch('./assets/room-meta.json').then(r=>r.json());
 const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);const gltf=await loader.loadAsync(new URLSearchParams(location.search).has('legacy')?'./assets/room-v9.glb':'./assets/room-baked.glb',e=>{$('#load-bar').style.width=Math.min(92,e.total?e.loaded/e.total*92:e.loaded/112000)+'%'});model=gltf.scene;scene.add(model);
 model.traverse(o=>{if(!o.isMesh)return;const m=o.material;o.castShadow=!o.userData.exterior;o.receiveShadow=true;if(!m.userData.bakedIrradiance&&/warm taupe looped plush/i.test(m.name)){m.map=null;m.color.setRGB(.245,.20,.13);m.roughness=.94}if(/clear window panes/i.test(m.name)){m.transparent=true;m.opacity=.07;m.color.set('#c6dddf');m.roughness=.15;m.metalness=.1;if('transmission'in m)m.transmission=0}if(/bunny|plush|softly blended|soft cream face|pink face/i.test(m.name)){o.castShadow=false;o.receiveShadow=false}if(m.transparent||m.opacity<.7){o.castShadow=false;m.depthWrite=false;m.side=THREE.DoubleSide}if(m.map)m.map.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy())});
 api.textureBudget=fitTextureBudget(model,renderer,mobile);
 const bakedSet=new Set();model.traverse(o=>{if(o.isMesh&&!bakedSet.has(o.material)){applyBakedMaterial(o.material);bakedSet.add(o.material)}});
 registry=createRegistry(model);
 for(const id of lampIds){const word=id==='left'?'chest amber':id==='desk'?'desk task':'bedside 2700K',spec=meta.lamps.find(l=>l.name.includes(word));const l=new THREE.PointLight('#ffb067',0,4,2);l.position.fromArray(spec.position);l.userData.id=id;l.userData.base=id==='desk'?4:id==='left'?2:3;scene.add(l);lights.push(l)}
 visual=new VisualStates(renderer,scene,camera,model,mobile);basic=new THREE.Scene();basic.add(simpleLamps());basic.background=null;
 const glowCanvas=document.createElement('canvas');glowCanvas.width=64;glowCanvas.height=64;const ctx=glowCanvas.getContext('2d'),gradient=ctx.createRadialGradient(32,32,0,32,32,32);gradient.addColorStop(0,'rgba(255,207,132,1)');gradient.addColorStop(.12,'rgba(255,173,78,.8)');gradient.addColorStop(.45,'rgba(255,141,55,.18)');gradient.addColorStop(1,'rgba(255,141,55,0)');ctx.fillStyle=gradient;ctx.fillRect(0,0,64,64);const glowTexture=new THREE.CanvasTexture(glowCanvas);for(const id of lampIds){const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTexture,transparent:true,depthTest:false,depthWrite:false,toneMapped:false}));sprite.position.set(...objects[id].anchor);sprite.scale.setScalar(id==='left'?.20:.25);sprite.userData={id,glow:true};basic.add(sprite)}
 presentationScene=new THREE.Scene();presentationScene.environment=scene.environment;presentationScene.environmentIntensity=.7;presentationScene.add(new THREE.HemisphereLight('#fff1d8','#7a6c5d',2));const key=new THREE.DirectionalLight('#ffe1b1',3);key.position.set(-3,4,5);presentationScene.add(key);presentationCamera=new THREE.PerspectiveCamera(34,1,.01,20);
 resize();$('#load-text').textContent='正在准备灯光与故事…';$('#load-bar').style.width='97%';await renderer.compileAsync(scene,camera);renderer.shadowMap.needsUpdate=true;visual.render();api.loaded=true;document.body.dataset.ready='true';$('#loading').classList.add('done');
 Object.assign(api,{setFullRoom,bakedMaterials:()=>{const result={lightmapped:0,normalMapped:0};model.traverse(o=>{if(o.isMesh){if(o.material.lightMap)result.lightmapped++;if(o.material.normalMap)result.normalMapped++}});return result},registry:()=>Object.fromEntries(Object.entries(registry).map(([id,r])=>[id,{meshes:r.meshes?.map(x=>x.name),bounds:r.box?{min:r.box.min.toArray(),max:r.box.max.toArray()}:null}])),getCamera:()=>camera.position.toArray(),getStats:()=>({calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures}),setCamera:(p)=>{camera.position.fromArray(p);camera.lookAt(center);controls.update();dirty=true},debugView:v=>{visual.uniforms.debugView.value=v;dirty=true},wallOpacity:()=>visual.walls.value.toArray(),setHalftone:on=>{visual.foreground.htEnabled.value=on?1:0;dirty=true},activate:id=>interact(id),close:()=>panel.close(),getScreenPosition:id=>{projected.copy(registry[id].anchor).project(camera);return[(projected.x*.5+.5)*innerWidth,(-projected.y*.5+.5)*innerHeight]},resetCamera});
 if(location.hash.includes('figmacapture'))lampIds.forEach(id=>store.light(id));
 requestFrame();
}catch(e){fallback(e)}
function resize(){if(!renderer)return;camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);const dpr=renderer.getPixelRatio();visual?.resize(Math.floor(innerWidth*dpr),Math.floor(innerHeight*dpr));if(state.activeStory&&registry?.[state.activeStory])fitPresentation(state.activeStory);dirty=true}
addEventListener('resize',resize);
function updateHotspots(){for(const [id,b]of buttons){projected.copy(registry[id].anchor).project(camera);const visible=projected.z<1&&Math.abs(projected.x)<1.05&&Math.abs(projected.y)<1.05&&!b.disabled;b.hidden=!visible;b.style.left=(projected.x*.5+.5)*innerWidth+'px';b.style.top=(-projected.y*.5+.5)*innerHeight+'px'}}
// Only interactive targets take part in picking; foreground ink dots never intercept clicks.
function pick(e){if(!registry||state.activeStory)return null;const rect=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);ray.setFromCamera(pointer,camera);let nearest=Infinity,id=null;
 for(const [key,spec]of Object.entries(objects)){if(spec.type==='story'&&!fullRoom&&!state.illuminatedLights.has(stories[key].unlockLight))continue;const box=registry[key].box;if(ray.ray.intersectBox(box,hitPoint)){const d=ray.ray.origin.distanceToSquared(hitPoint);if(d<nearest){nearest=d;id=key}}}return id;}
addEventListener('pointermove',e=>{pointerX=e.clientX;pointerY=e.clientY;if(!visual||state.activeStory)return;if(e.target===renderer.domElement)setHover(pick(e));else if(!e.target.closest('.hotspot'))setHover(null)},{passive:true});
addEventListener('pointerdown',e=>{pressed=true;cursor.classList.add('pressed');dragStart={x:e.clientX,y:e.clientY,target:e.target}});
addEventListener('pointerup',e=>{pressed=false;cursor.classList.remove('pressed');if(dragStart&&e.target===renderer?.domElement&&Math.hypot(e.clientX-dragStart.x,e.clientY-dragStart.y)<6){const id=pick(e);if(id)interact(id,buttons.get(id))}dragStart=null});
addEventListener('pointercancel',()=>{pressed=false;dragStart=null;cursor.classList.remove('pressed')});
addEventListener('keydown',e=>{if(e.key.toLowerCase()==='r'&&!state.activeStory)resetCamera()});
function updateCursor(dt){if(touch)return;const a=reduced?1:1-Math.exp(-28*dt);cursorX+=(pointerX-cursorX)*a;cursorY+=(pointerY-cursorY)*a;cursor.style.left=cursorX+'px';cursor.style.top=cursorY+'px';const show=Boolean(!state.activeStory&&hoverId&&(!stories[hoverId]||fullRoom||state.illuminatedLights.has(stories[hoverId].unlockLight)));state.pointerMode=show?'circle':'default';cursor.classList.toggle('shown',show);document.body.classList.toggle('custom-cursor',show);}
function requestFrame(){raf=requestAnimationFrame(frame)}
function frame(ms){requestFrame();if(paused)return;const t=ms/1000,dt=Math.min(t-lastTime,.05);lastTime=t;const changed=controls.update(dt);updateCursor(dt);
 const anim=fullRoom||state.illuminatedLights.size>0||state.activeStory;
 if(!dirty&&!changed&&!anim)return;if(!dirty&&!changed&&t-lastRender<(mobile?1/30:1/45))return;lastRender=t;
 visual.update(t,dt,state);for(const l of lights)l.intensity=THREE.MathUtils.damp(l.intensity,(fullRoom||state.illuminatedLights.has(l.userData.id))?l.userData.base:0,5,dt);
 renderer.info.reset();visual.render();renderer.autoClear=false;renderer.clearDepth();
 basic.traverse(o=>{if(o.userData.glow){o.visible=fullRoom||state.illuminatedLights.has(o.userData.id);o.material.opacity=fullRoom?1:visual.uniforms.lit.value.getComponent(lampIds.indexOf(o.userData.id))}else if(o.isMesh){const id=o.userData.id;o.visible=!fullRoom&&!state.illuminatedLights.has(id)}});renderer.render(basic,camera);renderer.autoClear=true;updateHotspots();
 if(state.activeStory&&state.activeStory!=='help'&&presentationObject){const rect=$('#showcase').getBoundingClientRect();renderer.setScissorTest(true);renderer.setScissor(rect.left,innerHeight-rect.bottom,rect.width,rect.height);renderer.setViewport(rect.left,innerHeight-rect.bottom,rect.width,rect.height);renderer.autoClear=false;renderer.clearDepth();presentationObject.rotation.y=reduced?0:Math.sin(t*.24)*.08;presentationObject.position.y=reduced?0:Math.sin(t*.55)*.008;renderer.render(presentationScene,presentationCamera);renderer.autoClear=true;renderer.setScissorTest(false);renderer.setViewport(0,0,innerWidth,innerHeight)}
 dirty=false;
}
document.addEventListener('visibilitychange',()=>{paused=document.hidden;if(!paused){lastTime=performance.now()/1000;dirty=true}});
addEventListener('pagehide',e=>{if(e.persisted){paused=true;return}cancelAnimationFrame(raf);panel.dispose();controls?.dispose();visual?.dispose();if(scene){const gs=new Set(),ms=new Set(),ts=new Set();scene.traverse(o=>{if(o.geometry)gs.add(o.geometry);if(o.material){for(const m of Array.isArray(o.material)?o.material:[o.material]){ms.add(m);for(const v of Object.values(m))if(v?.isTexture)ts.add(v)}}});gs.forEach(g=>g.dispose());ms.forEach(m=>m.dispose());ts.forEach(t=>t.dispose());scene.environment?.dispose()}renderer?.dispose()});
addEventListener('pageshow',e=>{if(e.persisted){paused=false;dirty=true}});

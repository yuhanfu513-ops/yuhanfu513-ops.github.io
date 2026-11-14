export const STORAGE_KEY='bill-room-exploration-v2';
const lightIds=['left','desk','bedside'],storyIds=['cello','boots','laptop'];
export function createStore(){
  const state={curtainOpened:false,illuminatedLights:new Set(),exploredObjects:new Set(),hoveredObject:null,activeStory:null,helpUnlocked:false,pointerMode:'default'};
  const url=new URL(location.href);
  try{if(url.searchParams.get('reset')==='1'){localStorage.removeItem(STORAGE_KEY);url.searchParams.delete('reset');history.replaceState(null,'',url);}else{const saved=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');if(saved){if(saved.version!==2||!Array.isArray(saved.illuminatedLights)||!Array.isArray(saved.exploredObjects))throw Error('Invalid progress');state.curtainOpened=saved.curtainOpened===true;state.illuminatedLights=new Set(saved.illuminatedLights.filter(x=>lightIds.includes(x)));state.exploredObjects=new Set(saved.exploredObjects.filter(x=>storyIds.includes(x)&&state.illuminatedLights.has(x==='laptop'?'desk':'left')));}}}catch{try{localStorage.removeItem(STORAGE_KEY)}catch{}}
  state.helpUnlocked=state.exploredObjects.size===3;
  const listeners=new Set();
  function emit(){state.helpUnlocked=state.exploredObjects.size===3;try{localStorage.setItem(STORAGE_KEY,JSON.stringify({version:2,curtainOpened:state.curtainOpened,illuminatedLights:[...state.illuminatedLights],exploredObjects:[...state.exploredObjects]}))}catch{}listeners.forEach(fn=>fn(state));}
  return {state,openCurtain(){state.curtainOpened=true;emit()},subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn)},light(id){if(!lightIds.includes(id))return;state.illuminatedLights.add(id);emit()},open(id){if(id==='help'&&!state.helpUnlocked)return false;if(id!=='help'){if(!storyIds.includes(id)||!state.illuminatedLights.has(id==='laptop'?'desk':'left'))return false;state.exploredObjects.add(id)}state.activeStory=id;emit();return true},close(){state.activeStory=null;emit()},hover(id){state.hoveredObject=id},snapshot:()=>({...state,illuminatedLights:[...state.illuminatedLights],exploredObjects:[...state.exploredObjects]})};
}

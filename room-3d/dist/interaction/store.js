export const STORAGE_KEY='bill-room-exploration-v2';
export const progressSteps=[
  {id:'left',label:'小灯',type:'light'},
  {id:'boots',label:'红色球鞋',type:'story'},
  {id:'cello',label:'琴',type:'story'},
  {id:'desk',label:'桌上台灯',type:'light'},
  {id:'laptop',label:'电脑',type:'story'},
  {id:'bedside',label:'床头灯',type:'light'},
  {id:'curtain',label:'窗帘',type:'curtain'}
];
const lightIds=['left','desk','bedside'],storyIds=['cello','boots','laptop'];
const validIds=new Set(progressSteps.map(step=>step.id));
const requiredLight=id=>id==='laptop'?'desk':'left';
export function createStore(){
  const state={curtainOpened:false,illuminatedLights:new Set(),exploredObjects:new Set(),hoveredObject:null,activeStory:null,helpUnlocked:false,pointerMode:'default',currentStep:null,history:{}};
  const url=new URL(location.href);
  const capture=()=>({curtainOpened:state.curtainOpened,illuminatedLights:[...state.illuminatedLights],exploredObjects:[...state.exploredObjects]});
  function restore(snapshot){
    state.curtainOpened=snapshot.curtainOpened===true;
    state.illuminatedLights=new Set((snapshot.illuminatedLights||[]).filter(x=>lightIds.includes(x)));
    state.exploredObjects=new Set((snapshot.exploredObjects||[]).filter(x=>storyIds.includes(x)&&state.illuminatedLights.has(requiredLight(x))));
  }
  try{
    if(url.searchParams.get('reset')==='1'){localStorage.removeItem(STORAGE_KEY);url.searchParams.delete('reset');history.replaceState(null,'',url);}
    else {
      const saved=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');
      if(saved){
        if(saved.version!==2||!Array.isArray(saved.illuminatedLights)||!Array.isArray(saved.exploredObjects))throw Error('Invalid progress');
        restore(saved);
        if(saved.history&&typeof saved.history==='object'){
          for(const [id,snapshot] of Object.entries(saved.history)){
            if(validIds.has(id)&&snapshot&&Array.isArray(snapshot.illuminatedLights)&&Array.isArray(snapshot.exploredObjects))state.history[id]=snapshot;
          }
          state.currentStep=validIds.has(saved.currentStep)?saved.currentStep:null;
        }else{
          // Older saves have no event order. Reconstruct the available steps in
          // the displayed order, while retaining the original current state.
          const original=capture();
          state.illuminatedLights.clear();state.exploredObjects.clear();state.curtainOpened=false;
          for(const step of progressSteps){
            if(step.type==='light'&&original.illuminatedLights.includes(step.id))state.illuminatedLights.add(step.id);
            else if(step.type==='story'&&original.exploredObjects.includes(step.id))state.exploredObjects.add(step.id);
            else if(step.type==='curtain'&&original.curtainOpened)state.curtainOpened=true;
            else continue;
            state.history[step.id]=capture();state.currentStep=step.id;
          }
          restore(original);
        }
      }
    }
  }catch{try{localStorage.removeItem(STORAGE_KEY)}catch{}}
  const listeners=new Set();
  function emit(){
    state.helpUnlocked=state.exploredObjects.size===3;
    try{localStorage.setItem(STORAGE_KEY,JSON.stringify({version:2,...capture(),history:state.history,currentStep:state.currentStep}));}catch{}
    listeners.forEach(fn=>fn(state));
  }
  function record(id){state.currentStep=id;state.history[id]=capture();emit();}
  state.helpUnlocked=state.exploredObjects.size===3;
  return {
    state,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn)},
    openCurtain(){state.curtainOpened=true;record('curtain')},
    light(id){if(!lightIds.includes(id))return;state.illuminatedLights.add(id);record(id)},
    open(id){
      if(id==='help'&&!state.helpUnlocked)return false;
      if(id!=='help'){
        if(!storyIds.includes(id)||!state.illuminatedLights.has(requiredLight(id)))return false;
        state.exploredObjects.add(id);state.activeStory=id;record(id);return true;
      }
      state.activeStory=id;emit();return true;
    },
    goTo(id){
      const snapshot=state.history[id];if(!snapshot)return false;
      restore(snapshot);state.activeStory=null;state.currentStep=id;emit();return true;
    },
    close(){state.activeStory=null;emit()},
    hover(id){state.hoveredObject=id},
    snapshot:()=>({...state,illuminatedLights:[...state.illuminatedLights],exploredObjects:[...state.exploredObjects]})
  };
}

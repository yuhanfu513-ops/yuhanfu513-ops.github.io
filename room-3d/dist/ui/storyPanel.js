import {stories,helpContent} from '../content/stories.js';
export function setupStoryPanel(store,onOpen,onClose){
 const dialog=document.querySelector('#story-dialog'),title=document.querySelector('#story-title'),body=document.querySelector('#story-scroll');
 let previous=null,closeTimer=null;
 function fades(){body.classList.toggle('has-above',body.scrollTop>2);body.classList.toggle('has-below',body.scrollTop+body.clientHeight<body.scrollHeight-2)}
 body.addEventListener('scroll',fades,{passive:true});body.addEventListener('keydown',e=>{const steps={ArrowDown:46,ArrowUp:-46,PageDown:body.clientHeight*.8,PageUp:-body.clientHeight*.8};if(e.key==='End'||e.key==='Home'||e.key in steps){e.preventDefault();body.scrollTop=e.key==='End'?body.scrollHeight:e.key==='Home'?0:body.scrollTop+steps[e.key];fades()}});const observer=new ResizeObserver(fades);observer.observe(body);
 function open(id,source){if(!store.open(id))return;clearTimeout(closeTimer);previous=source||document.activeElement;
  const help=id==='help';dialog.classList.toggle('help',help);title.textContent=help?'How can I help':stories[id].title;body.replaceChildren();
  document.documentElement.style.setProperty('--orange',help?'#ff8943':stories[id].color);
  if(help){for(const entry of helpContent){const h=document.createElement('h3');h.textContent=entry.title;const p=document.createElement('p');p.textContent=entry.body;body.append(h,p)}}else{for(const text of stories[id].paragraphs){const p=document.createElement('p');p.textContent=text;body.append(p)}}
  document.querySelector('#story-kicker').textContent=help?'LET’S MAKE SOMETHING TOGETHER':'A PIECE OF MY STORY';
  const showcase=document.querySelector('#showcase');showcase.hidden=help;showcase.replaceChildren();if(!help){const image=new Image();image.src='./assets/story-'+id+'.png';image.alt=stories[id].title;showcase.append(image);}dialog.showModal();document.body.classList.add('story-open');body.scrollTop=0;
  // One browser layout boundary starts CSS transitions; animation lives in the main render loop.
  void dialog.offsetWidth;dialog.classList.add('visible');document.querySelector('#close-story').focus();fades();onOpen(id);
 }
 function close(){if(!dialog.open)return;dialog.classList.remove('visible');document.body.classList.remove('story-open');onClose();closeTimer=setTimeout(()=>{dialog.close();store.close();document.documentElement.style.setProperty('--orange','#ff8943');previous?.focus?.({preventScroll:true})},matchMedia('(prefers-reduced-motion:reduce)').matches?0:600)}
 document.querySelector('#close-story').onclick=close;dialog.addEventListener('cancel',e=>{e.preventDefault();close()});
 dialog.addEventListener('keydown',e=>{if(e.key==='Tab'){const els=[document.querySelector('#close-story'),body];if(e.shiftKey&&document.activeElement===els[0]){e.preventDefault();els[1].focus()}else if(!e.shiftKey&&document.activeElement===els[1]){e.preventDefault();els[0].focus()}}});
 return {open,close,dispose:()=>{observer.disconnect();clearTimeout(closeTimer)}};
}

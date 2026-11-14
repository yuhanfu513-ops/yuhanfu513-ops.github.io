import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
await fs.mkdir('../work/web-qa',{recursive:true});await fs.mkdir('../work/figma-room-assets',{recursive:true});
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-angle=metal']});
const results=[];
for(const mobile of [false,true]){
 const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},deviceScaleFactor:mobile?2:1,hasTouch:mobile,isMobile:mobile}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 await page.goto('http://127.0.0.1:4173/?reset=1');await page.waitForFunction(()=>window.roomExplorer?.loaded,{timeout:90000});
 // Disable overlay hit boxes: exercise the canvas ray picking through furniture.
 await page.addStyleTag({content:'#hotspots{pointer-events:none!important}#hotspots button{pointer-events:none!important}'});
 const pose=p=>mobile?p.map((v,i)=>[1.75,.95,-2.15][i]+(v-[1.75,.95,-2.15][i])*2):p;
 await page.evaluate(p=>roomExplorer.setCamera(p),pose([-5,3,-2]));await page.waitForTimeout(900);
 const clicked=[];
 for(const id of ['left','desk','bedside']){
  const xy=await page.evaluate(id=>roomExplorer.getScreenPosition(id),id);await page.mouse.click(...xy);await page.waitForTimeout(500);
  assert((await page.evaluate(()=>roomExplorer.state())).illuminatedLights.includes(id),`canvas lamp ${id}`);clicked.push(id);
 }
 for(const id of ['cello','boots','laptop']){
  const xy=await page.evaluate(id=>roomExplorer.getScreenPosition(id),id);await page.mouse.click(...xy);await page.waitForTimeout(600);
  assert.equal((await page.evaluate(()=>roomExplorer.state())).activeStory,id,`canvas story ${id}`);clicked.push(id);await page.keyboard.press('Escape');await page.waitForTimeout(650);
 }
 for(const [name,pos] of [['west',[-5,3,-2]],['east',[8,2,-1]],['north',[5,3,-9]]]){
  await page.evaluate(p=>roomExplorer.setCamera(p),pose(pos));await page.waitForTimeout(600);
  for(const enabled of [false,true]){await page.evaluate(on=>roomExplorer.setHalftone(on),enabled);await page.waitForTimeout(300);await page.screenshot({path:`../work/web-qa/halftone-${mobile?'mobile':'desktop'}-${name}-${enabled?'on':'off'}.png`});}
 }
 // Hidden portals deliberately allocate their GPU geometry only on first use.
 // Check repeated visits after each tested view has actually been rendered.
 const stats=await page.evaluate(()=>roomExplorer.getStats());
 for(const pos of [[-5,3,-2],[8,2,-1],[5,3,-9]]){
  await page.evaluate(p=>roomExplorer.setCamera(p),pose(pos));
  for(const enabled of [false,true]){await page.evaluate(on=>roomExplorer.setHalftone(on),enabled);await page.waitForTimeout(150);}
 }
 assert.equal((await page.evaluate(()=>roomExplorer.getStats())).geometries,stats.geometries);
 if(!mobile){
  await page.addStyleTag({content:'header,.opening,footer,#hotspots,#cursor{visibility:hidden!important}'});
  for(const [name,pos]of [['west',[-5,3,-2]],['east',[8,2,-1]]]){await page.evaluate(p=>roomExplorer.setCamera(p),pose(pos));await page.waitForTimeout(500);await page.screenshot({path:`../work/figma-room-assets/halftone-${name}.png`})}
 }
 assert.deepEqual(errors,[]);results.push({mobile,canvasClicks:clicked,errors,stableGeometryCount:stats.geometries});await page.close();
}
await fs.writeFile('../work/web-qa/halftone-tests.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));await browser.close();

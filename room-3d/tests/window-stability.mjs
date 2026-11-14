import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import sharp from 'sharp';
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-angle=metal']});
const results=[];
try{
for(const mobile of [false,true]){
 const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},isMobile:mobile,hasTouch:mobile}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto('http://127.0.0.1:4173/?reset=1');await page.waitForFunction(()=>window.roomExplorer?.loaded,{timeout:150000});await page.evaluate(()=>roomExplorer.setFullRoom(true));
 await page.addStyleTag({content:'header,.opening,footer,#hotspots,#cursor{visibility:hidden!important}'});
 const states=[];
 for(const [name,pos,expected]of [['window',[1.8,1.9,.4],true],['cabinet',[6,2.6,-1.8],null],['side',[7,3,-4],false],['back',[2,2,-9],false],['outside-bay',[2,2,-4.6],false],['high',[2,9,-6],false],['return-window',[1.8,1.9,.4],true]]){
  await page.evaluate(p=>roomExplorer.setCamera(p),pos);await page.waitForTimeout(750);
  const a=await page.evaluate(()=>roomExplorer.getVisibilityDiagnostics());await page.waitForTimeout(250);const b=await page.evaluate(()=>roomExplorer.getVisibilityDiagnostics());
  if(expected!==null)assert.equal(a.exterior.visible,expected,`${name} portal visibility`);
  if(!a.exterior.visible)assert.equal(a.exterior.frames,b.exterior.frames,`${name}: exterior rendering must stop`);
  else assert(b.exterior.frames>a.exterior.frames,`${name}: daylight resumes`);
  if(!mobile)await page.screenshot({path:`../work/web-qa/stability-after-${name}.png`});
  states.push({name,...b});
 }
 let flickerPixels=0,cabinetFlickerPixels=0;
 if(!mobile){
  // Subpixel movement should not cause large dark/light patches on fabric.
  await page.evaluate(()=>roomExplorer.setCamera([1.8,1.9,.4]));await page.waitForTimeout(1100);
  const a=await sharp(await page.screenshot()).extract({left:540,top:0,width:130,height:300}).removeAlpha().raw().toBuffer();
  await page.evaluate(()=>roomExplorer.setCamera([1.8001,1.9,.4]));await page.waitForTimeout(700);
  const b=await sharp(await page.screenshot()).extract({left:540,top:0,width:130,height:300}).removeAlpha().raw().toBuffer();
  for(let i=0;i<a.length;i+=3)if(Math.max(Math.abs(a[i]-b[i]),Math.abs(a[i+1]-b[i+1]),Math.abs(a[i+2]-b[i+2]))>65)flickerPixels++;
  assert(flickerPixels<390,'No fabric dark/light patch flicker on subpixel orbit');
  await page.evaluate(()=>roomExplorer.setCamera([6,2.6,-1.8]));await page.waitForTimeout(700);
  const c=await sharp(await page.screenshot()).extract({left:390,top:0,width:460,height:550}).removeAlpha().raw().toBuffer();
  await page.evaluate(()=>roomExplorer.setCamera([6.0001,2.6,-1.8]));await page.waitForTimeout(700);
  const d=await sharp(await page.screenshot()).extract({left:390,top:0,width:460,height:550}).removeAlpha().raw().toBuffer();
  for(let i=0;i<c.length;i+=3)if(Math.max(Math.abs(c[i]-d[i]),Math.abs(c[i+1]-d[i+1]),Math.abs(c[i+2]-d[i+2]))>65)cabinetFlickerPixels++;
  assert(cabinetFlickerPixels<2530,'No cabinet dark/light patch flicker on subpixel orbit');
 }
 for(const pos of [[1.75,.95,-2.149],[1.75,.95,1000]]){
  await page.evaluate(p=>roomExplorer.setCamera(p),pos);await page.waitForTimeout(500);const camera=await page.evaluate(()=>roomExplorer.getCamera());assert(Math.abs(camera[2]-pos[2])<.01,'Zoom remains unrestricted');
 }
 assert.deepEqual(errors,[]);results.push({mobile,states,flickerPixels,cabinetFlickerPixels,errors});await page.close();
}
await fs.writeFile('../work/web-qa/window-stability-tests.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));
}finally{await browser.close();}

import {chromium} from 'playwright';import assert from 'node:assert/strict';import fs from 'node:fs/promises';
await fs.mkdir('../work/web-qa',{recursive:true});
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-angle=metal']});const results=[];
for(const mobile of [false,true]){
 const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},deviceScaleFactor:1,hasTouch:mobile,isMobile:mobile});const page=await context.newPage(),errors=[],loads=[];
 page.on('pageerror',e=>errors.push(e.stack));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});page.on('request',r=>{if(r.url().endsWith('.glb'))loads.push(r.url())});
 await page.goto('http://127.0.0.1:4173/?reset=1&keep=yes');await page.waitForFunction(()=>window.roomExplorer?.loaded,{timeout:90000});await page.waitForTimeout(1200);assert(!page.url().includes('reset='));assert(page.url().includes('keep=yes'));
 assert.equal((await page.evaluate(()=>roomExplorer.state())).exploredObjects.length,0);assert.equal(await page.locator('#help').isVisible(),false);assert.equal(await page.locator('[data-id=cello]').isDisabled(),true);
 await page.evaluate(()=>roomExplorer.activate('cello'));assert.equal(await page.locator('#story-dialog').isVisible(),false);
 await page.screenshot({path:`../work/web-qa/accept-${mobile?'mobile':'desktop'}-dark.png`});
 if(!mobile){const before=await page.evaluate(()=>roomExplorer.getCamera());await page.mouse.move(620,600);await page.mouse.down();await page.mouse.move(900,620,{steps:15});await page.mouse.up();await page.waitForTimeout(600);const after=await page.evaluate(()=>roomExplorer.getCamera());assert(Math.abs(before[0]-after[0])>.2);await page.click('#reset-camera');await page.waitForTimeout(700)}
 // Use actual DOM controls. Touch gets the same accessible alternate entrances.
 await page.click('#access-toggle');await page.click('[data-action=left]');await page.waitForTimeout(1200);
 assert.equal(await page.locator('[data-id=cello]').isDisabled(),false);assert.equal(await page.locator('[data-id=laptop]').isDisabled(),true);
 for(const id of ['desk','bedside']){await page.click('#access-toggle');await page.click(`[data-action=${id}]`)}await page.waitForTimeout(1400);
 await page.screenshot({path:`../work/web-qa/accept-${mobile?'mobile':'desktop'}-lit.png`});
 if(!mobile){await page.mouse.move(120,200);await page.waitForTimeout(180);assert.equal(await page.evaluate(()=>getComputedStyle(document.body).cursor),'auto');assert.equal(await page.locator('#cursor').evaluate(e=>e.classList.contains('shown')),false);const xy=await page.evaluate(()=>roomExplorer.getScreenPosition('left'));await page.mouse.move(...xy);await page.waitForTimeout(200);assert.equal(await page.locator('#cursor').evaluate(e=>e.classList.contains('shown')),true);await page.mouse.move(120,200);await page.waitForTimeout(180);assert.equal(await page.locator('#cursor').evaluate(e=>e.classList.contains('shown')),false);assert.equal(await page.evaluate(()=>typeof roomExplorer.trail),'undefined');}
 for(const id of ['cello','boots','laptop']){
  await page.click('#access-toggle');await page.click(`[data-action=${id}]`);await page.waitForTimeout(1000);assert.equal(await page.locator('#story-title').textContent(),{cello:'曾经的理想',boots:'红色的球鞋',laptop:'第一次创造'}[id]);
  const body=page.locator('#story-scroll');assert((await body.textContent()).length>200);await body.focus();await page.keyboard.press('End');await page.waitForTimeout(150);const scroll=await body.evaluate(e=>({top:e.scrollTop,h:e.scrollHeight,c:e.clientHeight,bottom:e.classList.contains('has-below')}));assert(scroll.h<=scroll.c||scroll.top>0);assert.equal(scroll.bottom,false);await page.keyboard.press('Home');await page.waitForTimeout(150);
  await page.screenshot({path:`../work/web-qa/accept-${mobile?'mobile':'desktop'}-${id}.png`});await page.keyboard.press('Escape');await page.waitForTimeout(750);assert.equal(await page.locator('#story-dialog').isVisible(),false);
 }
 assert.equal(await page.locator('#help').isVisible(),true);await page.click('#help');assert.equal(await page.locator('#story-title').textContent(),'How can I help');await page.waitForTimeout(800);await page.screenshot({path:`../work/web-qa/accept-${mobile?'mobile':'desktop'}-help.png`});await page.keyboard.press('Escape');await page.waitForTimeout(750);
 const beforeMemory=await page.evaluate(()=>roomExplorer.getStats());
 for(let i=0;i<4;i++){await page.evaluate(()=>roomExplorer.activate('laptop'));await page.waitForTimeout(100);await page.evaluate(()=>roomExplorer.close());await page.waitForTimeout(650)}
 const afterMemory=await page.evaluate(()=>roomExplorer.getStats());assert(afterMemory.geometries<=beforeMemory.geometries+2);assert.equal(loads.length,1);
 await page.reload();await page.waitForFunction(()=>roomExplorer.loaded,{timeout:90000});assert.equal((await page.evaluate(()=>roomExplorer.state())).exploredObjects.length,3);
 if(!mobile){await page.evaluate(()=>roomExplorer.debugView(2));for(const [name,p,expected]of [['se',[7.5,6,5.5],[1,3]],['sw',[-5.5,6,5.5],[0,3]],['nw',[-5.5,6,-9],[0,2]],['ne',[7.5,6,-9],[1,2]]]){await page.evaluate(p=>roomExplorer.setCamera(p),p);await page.waitForTimeout(700);const walls=await page.evaluate(()=>roomExplorer.wallOpacity());assert(expected.every(i=>walls[i]>.95));await page.screenshot({path:`../work/web-qa/walls-${name}.png`})}}
 await page.evaluate(()=>localStorage.setItem('bill-room-exploration-v2','{broken'));await page.reload();await page.waitForFunction(()=>roomExplorer.loaded,{timeout:90000});assert.equal((await page.evaluate(()=>roomExplorer.state())).exploredObjects.length,0);
 results.push({mobile,errors,glbLoadsPerInitialSession:loads.length-2,memory:afterMemory});assert.deepEqual(errors,[]);await context.close();
}
// Explicit no-WebGL fallback still offers stories.
const p=await browser.newPage();await p.addInitScript(()=>{const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(t,...a){if(t.startsWith('webgl'))return null;return get.call(this,t,...a)}});await p.goto('http://127.0.0.1:4173');await p.waitForSelector('#fallback:not([hidden])');await p.click('#fallback-links button');await p.waitForTimeout(700);assert.equal(await p.locator('#story-dialog').isVisible(),true);results.push({webglFallback:true});
await fs.writeFile('../work/web-qa/exploration-tests.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));await browser.close();

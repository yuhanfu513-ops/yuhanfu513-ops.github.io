import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-angle=metal']});
const results=[];
for(const mobile of [false,true]){
 const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},deviceScaleFactor:mobile?2:1,hasTouch:mobile,isMobile:mobile}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 await page.goto('http://127.0.0.1:4173/?reset=1');await page.waitForFunction(()=>window.roomExplorer?.loaded,{timeout:150000});
 const maps=await page.evaluate(()=>roomExplorer.bakedMaterials());assert(maps.lightmapped>30);assert(maps.normalMapped>20);
 const before=await page.evaluate(()=>roomExplorer.state());await page.click('#room-look');await page.waitForTimeout(1600);assert.equal(await page.locator('#room-look').getAttribute('aria-pressed'),'true');assert.equal(await page.locator('.opening').evaluate(e=>getComputedStyle(e).visibility),'hidden');
 assert.deepEqual((await page.evaluate(()=>roomExplorer.state())).exploredObjects,before.exploredObjects);
 await page.mouse.move(100,760);await page.screenshot({path:`../work/web-qa/baked-${mobile?'mobile':'desktop'}-whole.png`});
 await page.click('#access-toggle');await page.click('[data-action=laptop]');await page.waitForTimeout(800);assert.equal((await page.evaluate(()=>roomExplorer.state())).activeStory,'laptop');await page.keyboard.press('Escape');await page.waitForTimeout(750);
 await page.click('#room-look');assert.equal(await page.locator('#room-look').getAttribute('aria-pressed'),'false');
 for(let i=0;i<3;i++){await page.click('#room-look');await page.waitForTimeout(120);}
 await page.setViewportSize(mobile?{width:420,height:860}:{width:1280,height:900});await page.waitForTimeout(600);
 results.push({mobile,maps,textureBudget:await page.evaluate(()=>roomExplorer.textureBudget),stats:await page.evaluate(()=>roomExplorer.getStats()),errors});assert.deepEqual(errors,[]);await page.close();
}
await fs.writeFile('../work/web-qa/baked-tests.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));await browser.close();

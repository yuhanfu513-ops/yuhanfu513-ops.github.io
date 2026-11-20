import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const out=process.env.ROOM_QA_DIR;
if(out)await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--use-angle=metal']});
try {
  for(const mobile of [false,true]){
    const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:900,height:700},isMobile:mobile,hasTouch:mobile});
    const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
    await page.addInitScript(()=>{
      const now=performance.now.bind(performance);
      performance.now=()=>window.curtainTestTime??now();
    });
    const shot=async name=>{
      if(out)await page.screenshot({path:out+'/'+(mobile?'mobile':'desktop')+'-'+name+'.png'});
    };
    await page.goto('http://127.0.0.1:4173/?reset=1');
    await page.waitForFunction(()=>window.roomExplorer?.loaded || window.roomExplorer?.errors.length,null,{timeout:120000});
    assert.deepEqual(await page.evaluate(()=>roomExplorer.errors),[]);
    await page.addStyleTag({content:'header,.opening,footer,#hotspots,#cursor,#loading.done{visibility:hidden!important}'});
    await page.evaluate(async()=>{window.testLampWeights=(await import('/scene/daylight.js')).nightLamps.value});
    const weights=()=>page.evaluate(()=>window.testLampWeights.toArray());
    await page.evaluate(()=>{roomExplorer.setCamera([1.76,2.05,-.25]);roomExplorer.activate('desk')});
    await page.waitForFunction(()=>window.testLampWeights.y>.99);
    await shot('single-ink');
    await page.evaluate(()=>roomExplorer.debugView(2)); // Inspect the material beneath the story mask.
    await shot('single');
    const single=await weights();assert.equal(single[0],0);assert.equal(single[2],0);
    await page.evaluate(()=>roomExplorer.activate('left'));
    await page.waitForFunction(()=>window.testLampWeights.x>.99);
    await shot('double');
    assert.equal((await page.evaluate(()=>roomExplorer.getCurtain())).progress,0);
    await page.evaluate(()=>{window.curtainTestTime=performance.now();roomExplorer.activate('curtain')});
    await page.waitForTimeout(350);
    await page.evaluate(()=>{window.curtainTestTime+=2100});
    await page.waitForFunction(()=>Math.abs(roomExplorer.getCurtain().progress-.5)<.015);
    await shot('half');
    await page.evaluate(()=>{window.curtainTestTime+=3000;roomExplorer.activate('bedside');roomExplorer.setFullRoom(true)});
    await page.waitForFunction(()=>roomExplorer.getCurtain().progress===1 && window.testLampWeights.z>.99);
    await page.evaluate(()=>roomExplorer.debugView(0));
    await shot('open');
    if(!mobile && out){
      for(const gain of [1,.8,.6,0]){
        await page.evaluate(async g=>{(await import('/scene/receiverLights.js')).floorSunWeight.value=g},gain);
        await page.waitForTimeout(200);
        await shot('gain-'+gain);
      }
      await page.evaluate(async()=>{(await import('/scene/receiverLights.js')).floorSunWeight.value=.8});
    }
    await page.evaluate(()=>roomExplorer.setCamera([3.20,1.70,-1.0]));
    await page.waitForTimeout(350);
    await shot('side');
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({mobile,single,open:await weights(),errors}));
    await page.close();
  }
}finally{await browser.close()}

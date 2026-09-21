// Optional real-browser acceptance checks. CI installs pinned Playwright first.
import {spawn} from 'node:child_process';import fs from 'node:fs/promises';import assert from 'node:assert/strict';
const {chromium}=await import(process.env.ONTOTRAIL_PLAYWRIGHT_MODULE||'playwright');
const port=4318;const server=spawn(process.execPath,['scripts/serve.mjs','--dist'],{env:{...process.env,PORT:String(port)},stdio:'pipe'});
let browser;
try{
 await new Promise((resolve,reject)=>{let output='';const timer=setTimeout(()=>reject(Error('Server startup timeout')),15000);server.stdout.on('data',s=>{output+=s;if(output.includes('http://localhost:')){clearTimeout(timer);resolve();}});server.on('exit',code=>{clearTimeout(timer);reject(Error('Server exited '+code));});});
 browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1080},acceptDownloads:true});const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto(`http://127.0.0.1:${port}/`);await page.getByRole('button',{name:'Explore live demo'}).click();await page.waitForSelector('.metric-number');
 assert.match(await page.locator('.metric-number').first().innerText(),/2/);
 await fs.mkdir('test-results',{recursive:true});await page.screenshot({path:'test-results/control-tower-desktop.png',fullPage:true});
 await page.getByRole('button',{name:'Model disruption'}).click();
 await page.locator('#recovery-switch').check();assert.match(await page.locator('#scenario-preview').innerText(),/81,000/);
 await page.getByRole('button',{name:'Apply scenario'}).click();
 await page.getByRole('button',{name:'Save active scenario'}).click();await page.locator('#scenario-name').fill('Browser acceptance scenario');await page.locator('#save-form').getByRole('button',{name:'Save scenario',exact:true}).click();
 assert.equal(await page.locator('.saved-card').count(),1);
 await page.getByRole('button',{name:'Zero all delays'}).click();await page.getByRole('button',{name:'Apply scenario'}).click();assert.match(await page.locator('#scenario-preview').innerText(),/₹0/);
 await page.getByRole('button',{name:'Load scenario',exact:true}).click();assert.match(await page.locator('#scenario-preview').innerText(),/81,000/);
 const downloadPromise=page.waitForEvent('download');await page.locator('.footer').getByRole('button',{name:'Export scenario'}).click();const file=await downloadPromise;assert.equal(file.suggestedFilename(),'ontotrail-scenario.json');
 await page.locator('[data-nav="orders"]').click();await page.locator('#order-query').fill('ORD-1003');await page.locator('#order-search').getByRole('button',{name:'Search'}).click();assert.equal(await page.locator('tbody tr').count(),1);
 await page.getByRole('button',{name:'ORD-1003',exact:true}).click();assert.match(await page.locator('#detail-dialog').innerText(),/ALT-01/);await page.keyboard.press('Escape');assert.equal(await page.locator('#detail-dialog').evaluate(el=>el.open),false);
 await page.locator('[data-action="assistant"]').click();await page.locator('#question').fill('Compare recovery options');await page.locator('#ask-form').getByRole('button',{name:'Ask',exact:true}).click();assert.match(await page.locator('.assistant-answer').innerText(),/81,000/);await page.keyboard.press('Escape');
 await page.locator('[data-nav="network"]').click();await page.locator('#part-select').selectOption('PT-02');assert.match(await page.locator('.network-graph').getAttribute('aria-label'),/Sensor assembly/);
 await page.locator('[data-nav="evidence"]').click();await page.locator('#evidence-query').fill('Aruna');await page.locator('#evidence-search').getByRole('button',{name:'Search'}).click();assert.equal(await page.locator('.document-card').count(),1);
 await page.setViewportSize({width:390,height:844});await page.locator('[data-action="menu"]').click();await page.locator('[data-nav="overview"]').click();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'test-results/control-tower-mobile.png',fullPage:true});
 await page.locator('[data-action="menu"]').click();await page.locator('[data-nav="scenarios"]').click();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'test-results/scenario-mobile.png',fullPage:true});
 const url=page.url();await page.reload();await page.waitForSelector('#scenario-preview');assert.equal(page.url(),url);assert.match(await page.locator('#scenario-preview').innerText(),/81,000/);
 assert.deepEqual(errors,[]);console.log('Browser checks passed: scenario, recovery, save/load, export, search, order dialog, assistant, network, evidence, mobile overflow, reload.');
}finally{if(browser)await browser.close();server.kill('SIGTERM');}

import {initWelcome} from './ui/welcome.js';
import {APP,VIEWS} from './config.js';
import {dataset as d} from './domain/data.js';
import {validateDataset,validateScenario} from './domain/validation.js';
import {evaluate,baseline,example} from './domain/engine.js';
import {decodeScenario,encodeScenario,fingerprint,scenarioFile,parseScenarioFile} from './domain/scenario.js';
import {answer} from './domain/assistant.js';
import {askAnalyst} from './services/analyst.js';
import {readWorkspace,writeWorkspace,downloadFile} from './services/storage.js';
import {icon} from './ui/icons.js';
import {escape as e,money,date,orderCSV} from './ui/format.js';
import {viewMap,orderDetail,evidenceButtons,scenarioSummary,scenarioPreview} from './ui/views.js';

const $=s=>document.querySelector(s);const clone=s=>structuredClone(s);
let storage;try{storage=window.localStorage;}catch{storage={getItem(){throw Error('Unavailable');},setItem(){throw Error('Unavailable');}};}
const persisted=readWorkspace(storage,d),initial=decodeScenario(location.search,d);
let scenario=initial.scenario,result,draft=clone(scenario),saved=persisted.saved,activity=persisted.activity;
let view=Object.hasOwn(VIEWS,location.hash.slice(1))?location.hash.slice(1):'overview';
const ui={query:'',status:'all',priority:'all',sort:'due',page:1,partId:d.parts[0].id,evidenceQuery:'',compareId:''};
let notificationTimer;let dialogFocus;let chatCount=0;
const navIcons={overview:'grid',orders:'orders',network:'network',scenarios:'sliders',evidence:'file',about:'info'};
function toast(message){$('#toast').textContent=message;$('#toast').classList.add('show');clearTimeout(notificationTimer);notificationTimer=setTimeout(()=>$('#toast').classList.remove('show'),5000);}
function persist(){if(!writeWorkspace(storage,saved,activity))toast('Browser storage is unavailable. Export your scenario before closing this page.');}
function log(text){activity.unshift({text,at:new Date().toISOString()});activity=activity.slice(0,APP.maxActivity);persist();}
function updateURL(){try{history.replaceState(null,'',`${location.pathname}?${encodeScenario(scenario,d)}#${view}`);}catch{toast('Scenario URL could not be updated. Use Export scenario instead.');}}
function shell(){
 $('#shell').innerHTML=`<aside class="sidebar" id="sidebar"><a href="#overview" class="brand" aria-label="OntoTrail control tower"><img src="/assets/favicon.svg" alt="" width="34" height="34"><span>OntoTrail<small>SUPPLY CHAIN INTELLIGENCE</small></span></a><div class="workspace-label">PLANNING WORKSPACE</div><nav aria-label="Main navigation">${Object.entries(VIEWS).map(([id,label])=>`<a class="nav-item" href="#${id}" data-nav="${id}">${icon(navIcons[id])}<span>${label}</span>${id==='orders'?'<span id="nav-risk-count" class="nav-count"></span>':''}</a>`).join('')}</nav><div class="sidebar-bottom"><div class="workspace-avatar">BA</div><div><strong>Protected workspace</strong><span>Client workspace</span></div></div><div class="sidebar-version">OntoTrail v${APP.version}<span>Client workspace</span></div></aside><div class="main-wrap"><header class="topbar"><div class="topbar-left"><button class="icon-button mobile-menu" data-action="menu" aria-label="Toggle navigation" aria-expanded="false" aria-controls="sidebar">${icon('menu')}</button><span class="breadcrumb">Workspace <span>/</span> <strong id="current-view"></strong></span></div><form id="global-search" class="global-search">${icon('search')}<label class="sr-only" for="global-query">Find an order</label><input id="global-query" name="query" placeholder="Find an order…" maxlength="100"><button type="submit" class="sr-only">Search</button></form><div class="header-actions"><span class="demo-indicator"><i></i>CoCo CLI Hackathon</span><button class="assistant-button" data-action="assistant">${icon('chat')}<span>Ask OntoTrail</span></button><button class="text-button" data-auth-logout>Log out</button></div></header><div class="notice-bar"><span>${icon('clock')}Protected client workspace · CoCo CLI Hackathon</span><button class="text-button" data-action="go-about">Model scope ${icon('info')}</button></div><main id="main" tabindex="-1"><div id="page-error" class="page-error" role="alert" hidden></div><div id="view-root"></div></main><footer class="footer"><span>Connect the dots. Trace the answers.</span><div><button class="text-button" data-action="share">${icon('share')}Share scenario</button><button class="text-button" data-action="export">${icon('download')}Export scenario</button></div></footer></div><input type="file" id="import-file" class="sr-only" accept="application/json,.json" aria-label="Import an OntoTrail scenario">`;
}
function render(){
 try {$('#view-root').innerHTML=viewMap[view]({d,result,draft,saved,activity,ui});$('#current-view').textContent=VIEWS[view];$('#nav-risk-count').textContent=result.metrics.atRisk;document.querySelectorAll('[data-nav]').forEach(n=>{const active=n.dataset.nav===view;n.classList.toggle('active',active);if(active)n.setAttribute('aria-current','page');else n.removeAttribute('aria-current');});document.title=`OntoTrail · ${VIEWS[view]}`;$('#page-error').hidden=true;$('#assistant-context').textContent=`Current: ${scenarioSummary(scenario,d)} · ${scenario.bufferDays}-day buffer`;}
 catch(err){console.error('View rendering failed',err);$('#view-root').replaceChildren();$('#page-error').hidden=false;$('#page-error').innerHTML='<h2>This view could not be displayed</h2><p>Your last valid scenario is retained. Return to the control tower or reload the page.</p><button class="secondary" data-action="go-overview">Control tower</button>';}
}
function navigate(next){if(!Object.hasOwn(VIEWS,next))return;if(view!==next&&view==='scenarios')draft=clone(scenario);view=next;$('#sidebar').classList.remove('mobile-open');$('.mobile-menu').setAttribute('aria-expanded','false');if(location.hash!==`#${view}`)history.pushState(null,'',`${location.pathname}?${encodeScenario(scenario,d)}#${view}`);render();$('#main').focus({preventScroll:true});window.scrollTo({top:0,behavior:'instant'});}
/** Commit only after validation and calculation succeed. */
function applyScenario(candidate,label){const next=validateScenario(candidate,d);const computed=evaluate(d,next);scenario=next;result=computed;draft=clone(next);log(label);updateURL();render();toast('Scenario applied. All views now use these assumptions.');}
function openDetail(html){if(!$('#detail-dialog').open)dialogFocus=document.activeElement;$('#detail-content').innerHTML=html;if(!$('#detail-dialog').open)$('#detail-dialog').showModal();}
function closeDialog(id){$('#'+id).close();if(dialogFocus?.isConnected)dialogFocus.focus();}
function openOrder(id){const o=result.rows.find(o=>o.id===id);if(o)openDetail(orderDetail(o,d));else toast('This order is not in the current dataset.');}
function sourceRecord(id){
 const found=[...d.suppliers,...d.parts,...d.inventory,...d.shipments,...d.documents,...d.recoveryQuotes].find(r=>r.id===id);
 if(id.startsWith('ORD-')){openOrder(id);return;}
 if(!found){toast('Source not found in this dataset.');return;}
 const pairs=Object.entries(found).filter(([key])=>!['id','text','title','name'].includes(key));
 const labels={partId:'Component',partIds:'Components supplied',supplierId:'Supplier',documentId:'Supporting document',shipmentId:'Shipment',quantity:'Units',eta:'Original arrival date',premiumPaise:'Premium per unit',city:'Location',date:'Source date'};
 const field=(key,value)=>{if(key==='premiumPaise')return money(value);if((Array.isArray(value)?value:[value]).every(v=>typeof v==='string'&&/^(SUP|PT|SHP|DOC|ALT|INV)-/.test(v)))return evidenceButtons(Array.isArray(value)?value:[value]);return e(Array.isArray(value)?value.join(', '):value);};
 openDetail(`<div class="dialog-head"><div><span class="eyebrow">SOURCE RECORD · ${e(id)}</span><h2 id="detail-title">${e(found.title||found.name||id)}</h2></div><button class="icon-button" data-close="detail-dialog" aria-label="Close source record">${icon('close')}</button></div><div class="detail-body">${found.text?`<p class="document-body">${e(found.text)}</p>`:''}<dl class="preview-list">${pairs.map(([key,value])=>`<div><dt>${e(labels[key]||key)}</dt><dd>${field(key,value)}</dd></div>`).join('')}</dl><p class="helper">Synthetic source record. Arrival dates here are original values, before scenario delays.</p></div>`);
}
function saveDialog(){if(saved.length>=APP.maxSaved){toast('You have 20 saved scenarios. Delete one before saving another.');return;}openDetail(`<div class="dialog-head"><h2 id="detail-title">Save this scenario</h2><button class="icon-button" data-close="detail-dialog" aria-label="Close">${icon('close')}</button></div><form id="save-form" class="detail-body"><p>Keep these assumptions on this browser. Export a JSON file for a portable copy.</p><label class="field-label" for="scenario-name">Scenario name</label><input id="scenario-name" class="text-input" name="name" required maxlength="80" placeholder="e.g. Aruna delay with recovery" autofocus><p class="helper">${e(scenarioSummary(scenario,d))}</p><div class="form-actions"><button type="button" class="secondary" data-close="detail-dialog">Cancel</button><button class="primary">Save scenario</button></div></form>`);$('#scenario-name').focus();}
function exportScenario(s=scenario,name='OntoTrail scenario'){downloadFile('ontotrail-scenario.json',JSON.stringify(scenarioFile(s,d,name),null,2));toast('Scenario exported as JSON.');}

function analystNumber(value){const n=Number(value);return Number.isFinite(n)?n:null;}
function analystFormat(column,value){const n=analystNumber(value);if(n===null)return e(value??'—');const key=String(column).toUpperCase();if(/INR|EXPOSURE|VALUE|REVENUE|COST|PREMIUM|AMOUNT/.test(key))return `₹${new Intl.NumberFormat('en-IN',{maximumFractionDigits:0}).format(n)}`;return new Intl.NumberFormat('en-IN',{maximumFractionDigits:2}).format(n);}
function analystLabel(column){return String(column).replaceAll('_',' ').toLowerCase().replace(/\b\w/g,c=>c.toUpperCase());}
function analystModel(result){
 const columns=result?.columns||[],rows=result?.rows||[];const numeric=columns.filter(c=>rows.some(r=>analystNumber(r[c])!==null));const dimensions=columns.filter(c=>!numeric.includes(c));
 const metric=numeric.find(c=>/EXPOSURE|VALUE|REVENUE|COST|AMOUNT|COUNT|QUANTITY|UNITS|DAYS|RATE|PERCENT/.test(String(c).toUpperCase()))||numeric[0];
 const dimension=dimensions.find(c=>!/SCENARIO/.test(String(c).toUpperCase()))||dimensions[0];return {columns,rows,numeric,dimensions,metric,dimension};
}
function analystNarrative(question,result){
 const m=analystModel(result);if(!m.rows.length)return 'No matching records were returned for this question.';
 if(m.metric&&m.dimension){const sorted=[...m.rows].filter(r=>analystNumber(r[m.metric])!==null).sort((a,b)=>analystNumber(b[m.metric])-analystNumber(a[m.metric]));if(sorted.length){const top=sorted[0];const second=sorted[1];return `${e(top[m.dimension]??'The leading result')} has the highest ${e(analystLabel(m.metric).toLowerCase())} at <strong>${analystFormat(m.metric,top[m.metric])}</strong>${second?`, followed by ${e(second[m.dimension])} at <strong>${analystFormat(m.metric,second[m.metric])}</strong>`:''}.`;}}
 if(m.metric&&m.rows.length===1)return `The result is <strong>${analystFormat(m.metric,m.rows[0][m.metric])}</strong>.`;
 return `I found <strong>${m.rows.length}</strong> matching records for your question.`;
}
function analystFilters(result,id){const m=analystModel(result);const dims=m.dimensions.filter(c=>new Set(m.rows.map(r=>String(r[c]??''))).size>1).slice(0,3);if(!dims.length)return '';return `<div class="analyst-filters" data-result-id="${id}">${dims.map(c=>{const vals=[...new Set(m.rows.map(r=>String(r[c]??'')).filter(Boolean))].sort();return `<label>${e(analystLabel(c))}<select data-analyst-filter="${e(c)}"><option value="">All</option>${vals.map(v=>`<option>${e(v)}</option>`).join('')}</select></label>`}).join('')}</div>`;}
function analystTable(result,id){const m=analystModel(result);if(!m.rows.length)return '';return `<div class="analyst-table-wrap"><table class="analyst-table" data-analyst-table="${id}"><thead><tr>${m.columns.map(c=>`<th>${e(analystLabel(c))}</th>`).join('')}</tr></thead><tbody>${m.rows.slice(0,50).map(r=>`<tr>${m.columns.map(c=>`<td data-col="${e(c)}" data-raw="${e(r[c]??'')}">${analystFormat(c,r[c])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;}
function analystChart(result,id){const m=analystModel(result);if(!m.metric||!m.dimension)return '';const items=m.rows.map(r=>({label:String(r[m.dimension]??''),value:analystNumber(r[m.metric]),scenario:m.dimensions.includes('SCENARIO')?String(r.SCENARIO??''):''})).filter(x=>x.label&&x.value!==null).sort((a,b)=>b.value-a.value).slice(0,10);if(items.length<2)return '';const max=Math.max(...items.map(x=>Math.abs(x.value)),1);return `<section class="analyst-viz" data-analyst-chart="${id}"><div class="viz-head"><div><span class="eyebrow">DYNAMIC VISUALIZATION</span><strong>${e(analystLabel(m.metric))} by ${e(analystLabel(m.dimension))}</strong></div><span>${items.length} shown</span></div><div class="bar-chart">${items.map(x=>`<div class="bar-row" data-chart-label="${e(x.label)}"><span title="${e(x.label)}">${e(x.label)}</span><div class="bar-track"><i style="width:${Math.max(2,Math.abs(x.value)/max*100).toFixed(1)}%"></i></div><b>${analystFormat(m.metric,x.value)}</b></div>`).join('')}</div></section>`;}
function applyAnalystFilters(container){const selects=[...container.querySelectorAll('[data-analyst-filter]')];const table=container.querySelector('[data-analyst-table]');if(!table)return;for(const tr of table.tBodies[0].rows){const show=selects.every(sel=>!sel.value||[...tr.cells].some(td=>td.dataset.col===sel.dataset.analystFilter&&td.dataset.raw===sel.value));tr.hidden=!show;}const visible=new Set([...table.tBodies[0].rows].filter(r=>!r.hidden).map(r=>[...r.cells][0]?.dataset.raw));container.querySelectorAll('[data-chart-label]').forEach(row=>{if(selects.length)row.hidden=false;});}

function showAssistant(){if($('#detail-dialog').open)$('#detail-dialog').close();$('#assistant-dialog').showModal();$('#question').focus();}
async function ask(q){
 const question=q.trim();if(!question)return;if(!$('#assistant-dialog').open)showAssistant();if(!chatCount)$('#chat-log').replaceChildren();
 const block=document.createElement('article');block.className='chat-pair';block.innerHTML=`<p class="user-question">${e(question)}</p><div class="assistant-answer"><div class="answer-heading">${icon('chat')}<strong>Asking Snowflake Cortex Analyst…</strong></div><p>Grounding your question in the OntoTrail semantic view.</p></div>`;$('#chat-log').append(block);chatCount++;$('#question').value='';$('#question').disabled=true;$('#ask-form button').disabled=true;$('#chat-log').scrollTop=$('#chat-log').scrollHeight;
 try{
  const a=await askAnalyst(question);const rid=`analyst-${Date.now()}`;const resultHtml=a.result?.rows?.length?`${analystFilters(a.result,rid)}${analystChart(a.result,rid)}${analystTable(a.result,rid)}`:'';
  const sql=a.sql?`<details class="analyst-sql"><summary>Audit trail · View generated SQL</summary><pre>${e(a.sql)}</pre></details>`:'';
  const warning=a.executionWarning?`<p class="analyst-warning">${e(a.executionWarning)}</p>`:'';
  const suggestions=a.suggestions?.length?`<div class="analyst-suggestions"><span>Explore next</span>${a.suggestions.map(s=>`<button type="button" data-question="${e(s)}">${e(s)}</button>`).join('')}</div>`:'';
  block.querySelector('.assistant-answer').innerHTML=`<div class="answer-heading">${icon('chat')}<strong>OntoTrail Intelligence</strong><span class="live-pill">LIVE · SNOWFLAKE CORTEX</span></div><p class="direct-answer">${analystNarrative(question,a.result||{columns:[],rows:[]})}</p>${resultHtml}${warning}${sql}${suggestions}<small>Grounded in ONTOTRAIL_ANALYST · Request ${e(a.requestId||'Snowflake')}</small>`;
 }catch(err){
  const local=answer(question,d,result);block.querySelector('.assistant-answer').innerHTML=`<div class="answer-heading">${icon('chat')}<strong>Local fallback · ${e(local.title)}</strong></div><p>${e(local.text)}</p>${evidenceButtons(local.ids)}<small>Cortex Analyst unavailable: ${e(err.message||'connection error')}</small>`;
 }finally{$('#question').disabled=false;$('#ask-form button').disabled=false;$('#question').focus();$('#chat-log').scrollTop=$('#chat-log').scrollHeight;}
}
function previewDraft(){try{const valid=validateScenario(draft,d);$('#scenario-preview').innerHTML=scenarioPreview(d,valid);$('#draft-error').textContent='';$('#scenario-form button[type="submit"]').disabled=false;}catch(err){$('#draft-error').textContent=err.message;$('#scenario-form button[type="submit"]').disabled=true;}}
function confirmDelete(id){const s=saved.find(x=>x.id===id);if(!s)return;openDetail(`<div class="dialog-head"><h2 id="detail-title">Delete saved scenario?</h2><button class="icon-button" data-close="detail-dialog" aria-label="Close">${icon('close')}</button></div><div class="detail-body"><p>This removes “${e(s.name)}” from this browser. The active scenario is unchanged.</p><div class="form-actions"><button class="secondary" data-close="detail-dialog">Cancel</button><button class="primary destructive" data-confirm-delete="${e(id)}">Delete scenario</button></div></div>`);}
async function share(){if(!/^https?:$/.test(location.protocol)){toast('Use a deployed URL to share a link, or export the scenario JSON.');return;}const url=`${location.origin}${location.pathname}?${encodeScenario(scenario,d)}#${view}`;try{await navigator.clipboard.writeText(url);toast('Scenario link copied.');}catch{openDetail(`<div class="dialog-head"><h2 id="detail-title">Copy this scenario link</h2><button class="icon-button" data-close="detail-dialog" aria-label="Close">${icon('close')}</button></div><div class="detail-body"><label class="field-label" for="share-url">Link with exact assumptions</label><input id="share-url" class="text-input" value="${e(url)}" readonly><p class="helper">Copy the selected text. Saved scenario names and browser activity are not included.</p></div>`);$('#share-url').select();}}
function showClear(){openDetail(`<div class="dialog-head"><h2 id="detail-title">Clear local planning data?</h2><button class="icon-button" data-close="detail-dialog" aria-label="Close">${icon('close')}</button></div><div class="detail-body"><p>This deletes saved scenarios and activity from this browser. Export anything you need first. The active scenario remains available.</p><div class="form-actions"><button class="secondary" data-close="detail-dialog">Cancel</button><button class="primary destructive" data-action="confirm-clear">Clear local data</button></div></div>`);}
const actions={
 'go-scenarios':()=>navigate('scenarios'),'go-orders':()=>navigate('orders'),'go-about':()=>navigate('about'),'go-overview':()=>navigate('overview'),
 'menu':()=>{const open=$('#sidebar').classList.toggle('mobile-open');$('.mobile-menu').setAttribute('aria-expanded',String(open));},
 'assistant':showAssistant,'share':share,'save':saveDialog,'export':()=>exportScenario(),
 'export-csv':()=>{downloadFile('ontotrail-orders.csv',orderCSV(result),'text/csv;charset=utf-8');toast('All orders exported for the active scenario.');},
 'draft-baseline':()=>{draft=baseline(d);render();toast('Preview reset to zero delays. Apply to update the workspace.');},
 'draft-reset':()=>{draft=clone(scenario);render();toast('Unapplied changes discarded.');},
 'import':()=>$('#import-file').click(),
 'clear-local':showClear,'confirm-clear':()=>{saved=[];activity=[];ui.compareId='';persist();closeDialog('detail-dialog');render();toast('Saved scenarios and local activity cleared.');}
};
document.addEventListener('click',event=>{const target=event.target.closest('button,a');if(!target)return;
 try{
  if(target.dataset.close){closeDialog(target.dataset.close);return;}
  if(target.dataset.order){openOrder(target.dataset.order);return;}
  if(target.dataset.source){event.preventDefault();if($('#assistant-dialog').open)$('#assistant-dialog').close();sourceRecord(target.dataset.source);return;}
  if(target.dataset.nav){event.preventDefault();navigate(target.dataset.nav);return;}
  if(target.dataset.question){ask(target.dataset.question);return;}
  if(target.dataset.action){event.preventDefault();const action=actions[target.dataset.action];if(action)Promise.resolve(action()).catch(()=>toast('The action could not be completed. Please try again.'));return;}
  if(target.dataset.load){const savedItem=saved.find(x=>x.id===target.dataset.load);if(savedItem)applyScenario(savedItem.scenario,`Loaded scenario: ${savedItem.name}`);return;}
  if(target.dataset.delete){confirmDelete(target.dataset.delete);return;}
  if(target.dataset.confirmDelete){saved=saved.filter(s=>s.id!==target.dataset.confirmDelete);if(ui.compareId===target.dataset.confirmDelete)ui.compareId='';log('Deleted a saved scenario');closeDialog('detail-dialog');render();toast('Saved scenario deleted.');return;}
  if(target.dataset.exportSaved){const s=saved.find(x=>x.id===target.dataset.exportSaved);if(s)exportScenario(s.scenario,s.name);return;}
  if(target.dataset.pageStep){ui.page=Math.max(1,ui.page+Number(target.dataset.pageStep));render();}
 }catch(err){toast(err.message||'Action could not be completed.');}
});
document.addEventListener('submit',event=>{event.preventDefault();const form=event.target;
 try{
  if(form.id==='ask-form'){void ask($('#question').value);return;}
  if(form.id==='global-search'){ui.query=$('#global-query').value.trim();ui.page=1;ui.status='all';ui.priority='all';navigate('orders');return;}
  if(form.id==='order-search'){ui.query=$('#order-query').value.trim();ui.page=1;render();return;}
  if(form.id==='evidence-search'){ui.evidenceQuery=$('#evidence-query').value.trim();render();return;}
  if(form.id==='scenario-form'){applyScenario(draft,'Applied scenario assumptions');return;}
  if(form.id==='save-form'){const name=$('#scenario-name').value.trim();if(!name||name.length>80){toast('Enter a scenario name of 1–80 characters.');return;}if(saved.length>=APP.maxSaved)throw Error('Maximum of 20 saved scenarios reached.');const item={id:crypto.randomUUID(),name,createdAt:new Date().toISOString(),scenario:clone(scenario)};saved.unshift(item);log(`Saved scenario: ${name}`);closeDialog('detail-dialog');render();toast('Scenario saved on this browser.');}
 }catch(err){toast(err.message||'The form could not be submitted.');}
});
document.addEventListener('input',event=>{const t=event.target;
 if(t.dataset.delay){draft.delays[t.dataset.delay]=Number(t.value);document.querySelector(`[data-delay-number="${t.dataset.delay}"]`).value=t.value;previewDraft();}
 if(t.dataset.delayNumber){const n=t.value===''?NaN:Number(t.value);draft.delays[t.dataset.delayNumber]=n;if(Number.isFinite(n)&&n>=0&&n<=14)document.querySelector(`[data-delay="${t.dataset.delayNumber}"]`).value=n;previewDraft();}
});
document.addEventListener('change',async event=>{const t=event.target;
 try{
  if(t.dataset.analystFilter){applyAnalystFilters(t.closest('.assistant-answer'));return;}
  if(t.dataset.filter){ui[t.dataset.filter]=t.value;ui.page=1;render();}
  if(t.id==='recovery-switch'){draft.recovery=t.checked;previewDraft();}
  if(t.id==='buffer-days'){draft.bufferDays=Number(t.value);previewDraft();}
  if(t.id==='part-select'){ui.partId=t.value;render();}
  if(t.id==='compare-select'){ui.compareId=t.value;render();}
  if(t.id==='import-file'){const file=t.files?.[0];if(!file)return;if(file.size>25000)throw Error('Scenario files must be smaller than 25 KB.');const parsed=parseScenarioFile(await file.text(),d);applyScenario(parsed.scenario,`Imported scenario: ${parsed.name}`);navigate('scenarios');t.value='';}
 }catch(err){toast(err.message||'This change could not be applied.');if(t.id==='import-file')t.value='';}
});
window.addEventListener('popstate',()=>{const parsed=decodeScenario(location.search,d);scenario=parsed.scenario;result=evaluate(d,scenario);draft=clone(scenario);view=Object.hasOwn(VIEWS,location.hash.slice(1))?location.hash.slice(1):'overview';render();if(parsed.warning)toast(parsed.warning);});
window.addEventListener('hashchange',()=>{const next=location.hash.slice(1);if(Object.hasOwn(VIEWS,next)&&next!==view)navigate(next);});
for(const dlg of document.querySelectorAll('dialog'))dlg.addEventListener('click',event=>{if(event.target===dlg){const b=dlg.getBoundingClientRect();if(event.clientX<b.left||event.clientX>b.right||event.clientY<b.top||event.clientY>b.bottom)dlg.close();}});
try{validateDataset(d);result=evaluate(d,scenario);shell();render();initWelcome();if(initial.warning||persisted.warning)toast(initial.warning||persisted.warning);}
catch(err){$('#shell').innerHTML=`<main class="fatal"><h1>OntoTrail could not load its dataset</h1><p>Calculations are unavailable until the source records are corrected.</p><p>${e(err.message)}</p><ul>${(err.issues||[]).map(s=>`<li>${e(s)}</li>`).join('')}</ul></main>`;console.error(err);}

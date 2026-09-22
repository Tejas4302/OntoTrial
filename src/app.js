import {initWelcome} from './ui/welcome.js';
import {APP,VIEWS} from './config.js';
import {dataset as d} from './domain/data.js';
import {validateDataset,validateScenario} from './domain/validation.js';
import {evaluate,baseline,example} from './domain/engine.js';
import {decodeScenario,encodeScenario,fingerprint,scenarioFile,parseScenarioFile} from './domain/scenario.js';
import {answer} from './domain/assistant.js';
import {askAnalyst} from './services/analyst.js';
import {readWorkspace,writeWorkspace,downloadFile} from './services/storage.js';
import {readDecisions,writeDecisions,nextDecisionId,addDecisionActivity} from './services/decisions.js';
import {notifyDecision} from './services/notifications.js';
import {icon} from './ui/icons.js';
import {escape as e,money,date,orderCSV} from './ui/format.js';
import {viewMap,orderDetail,evidenceButtons,scenarioSummary,scenarioPreview} from './ui/views.js';

const $=s=>document.querySelector(s);const clone=s=>structuredClone(s);
let storage;try{storage=window.localStorage;}catch{storage={getItem(){throw Error('Unavailable');},setItem(){throw Error('Unavailable');}};}
const persisted=readWorkspace(storage,d),initial=decodeScenario(location.search,d);
let scenario=initial.scenario,result,draft=clone(scenario),saved=persisted.saved,activity=persisted.activity,decisions=readDecisions(storage);
let view=Object.hasOwn(VIEWS,location.hash.slice(1))?location.hash.slice(1):'analyst';
const ui={query:'',status:'all',priority:'all',sort:'due',page:1,partId:d.parts[0].id,evidenceQuery:'',compareId:''};
let notificationTimer;let dialogFocus;let chatCount=0;const decisionInsights=new Map();
let analystWorkspace={projects:[],threads:[],activeThreadId:''};
const navIcons={analyst:'chat',overview:'grid',orders:'orders',network:'network',scenarios:'sliders',evidence:'file',decisions:'check',governance:'shield',profile:'info',about:'info'};
function toast(message){$('#toast').textContent=message;$('#toast').classList.add('show');clearTimeout(notificationTimer);notificationTimer=setTimeout(()=>$('#toast').classList.remove('show'),5000);}
function persist(){if(!writeWorkspace(storage,saved,activity))toast('Browser storage is unavailable. Export your scenario before closing this page.');}
function persistDecisions(){if(!writeDecisions(storage,decisions))toast('Decision updates could not be saved in this browser.');}
function log(text){activity.unshift({text,at:new Date().toISOString()});activity=activity.slice(0,APP.maxActivity);persist();}
function updateURL(){try{history.replaceState(null,'',`${location.pathname}?${encodeScenario(scenario,d)}#${view}`);}catch{toast('Scenario URL could not be updated. Use Export scenario instead.');}}
function shell(){
 $('#shell').innerHTML=`<aside class="sidebar" id="sidebar"><div class="sidebar-brand-row"><a href="#analyst" class="brand" aria-label="OntoTrail AI Analyst"><span class="brand-mark-shell"><img class="brand-logo-mark" src="/assets/ontotrail-mark.png" alt=""></span><span class="brand-wordmark">OntoTrail</span></a><button class="sidebar-collapse-button" data-action="sidebar-collapse" type="button" aria-label="Collapse sidebar" aria-pressed="false" title="Collapse sidebar">‹</button></div><div class="workspace-label">PLANNING WORKSPACE</div><nav aria-label="Main navigation">${Object.entries(VIEWS).filter(([id])=>!['profile','about'].includes(id)).map(([id,label])=>`<a class="nav-item" href="#${id}" data-nav="${id}">${icon(navIcons[id])}<span>${label}</span>${id==='orders'?'<span id="nav-risk-count" class="nav-count"></span>':''}</a>`).join('')}</nav><button class="sidebar-bottom sidebar-profile" data-action="go-profile" type="button" aria-label="Open profile"><div class="workspace-avatar">BA</div><div><strong>Protected workspace</strong><span>Client workspace</span></div><span class="sidebar-profile-arrow">›</span></button><div class="sidebar-version">OntoTrail v${APP.version}<span>Client workspace</span></div></aside><div class="main-wrap"><header class="topbar"><div class="topbar-left"><button class="icon-button mobile-menu" data-action="menu" aria-label="Toggle navigation" aria-expanded="false" aria-controls="sidebar">${icon('menu')}</button><span class="breadcrumb">Workspace <span>/</span> <strong id="current-view"></strong></span></div><form id="global-search" class="global-search">${icon('search')}<label class="sr-only" for="global-query">Find an order</label><input id="global-query" name="query" placeholder="Find an order…" maxlength="100"><button type="submit" class="sr-only">Search</button></form><div class="header-actions"><span class="demo-indicator"><i></i>CoCo CLI Hackathon</span><span class="role-badge" data-role-badge></span><button class="secondary small" data-client-users hidden>Manage users</button><button class="secondary small" data-action="go-about">Workspace guide</button><button class="text-button" data-auth-logout>Log out</button></div></header><div class="notice-bar"><span>${icon('clock')}Protected client workspace · CoCo CLI Hackathon</span><button class="text-button" data-action="go-about">Model scope ${icon('info')}</button></div><main id="main" tabindex="-1"><div id="page-error" class="page-error" role="alert" hidden></div><div id="view-root"></div></main><footer class="footer"><span>Connect the dots. Trace the answers.</span><div><button class="text-button" data-action="share">${icon('share')}Share scenario</button><button class="text-button" data-action="export">${icon('download')}Export scenario</button></div></footer></div><input type="file" id="import-file" class="sr-only" accept="application/json,.json" aria-label="Import an OntoTrail scenario">`;
}
function sidebarCollapsed(){try{return storage.getItem('ontotrail_sidebar_collapsed')==='1';}catch{return false;}}
function applySidebarState(collapsed=sidebarCollapsed()){const sidebar=$('#sidebar');if(!sidebar)return;sidebar.classList.toggle('collapsed',collapsed);document.body.classList.toggle('sidebar-collapsed',collapsed);const btn=sidebar.querySelector('[data-action="sidebar-collapse"]');if(btn){btn.setAttribute('aria-pressed',String(collapsed));btn.setAttribute('aria-label',collapsed?'Expand sidebar':'Collapse sidebar');btn.title=collapsed?'Expand sidebar':'Collapse sidebar';}}
function toggleSidebar(){const collapsed=!$('#sidebar').classList.contains('collapsed');try{storage.setItem('ontotrail_sidebar_collapsed',collapsed?'1':'0');}catch{}applySidebarState(collapsed);}
function render(){
 try {$('#view-root').innerHTML=viewMap[view]({d,result,draft,saved,activity,ui,decisions,analystWorkspace});$('#current-view').textContent=VIEWS[view];$('#nav-risk-count').textContent=result.metrics.atRisk;document.querySelectorAll('[data-nav]').forEach(n=>{const active=n.dataset.nav===view;n.classList.toggle('active',active);if(active)n.setAttribute('aria-current','page');else n.removeAttribute('aria-current');});document.title=`OntoTrail · ${VIEWS[view]}`;document.body.classList.toggle('analyst-mode',view==='analyst');$('#page-error').hidden=true;if($('#assistant-context'))$('#assistant-context').textContent=`Current: ${scenarioSummary(scenario,d)} · ${scenario.bufferDays}-day buffer`;if($('#analyst-context'))$('#analyst-context').textContent=`Current scenario: ${scenarioSummary(scenario,d)} · ${scenario.bufferDays}-day buffer`;if(view==='analyst')restoreAnalystThread();}
 catch(err){console.error('View rendering failed',err);$('#view-root').replaceChildren();$('#page-error').hidden=false;$('#page-error').innerHTML='<h2>This view could not be displayed</h2><p>Your last valid scenario is retained. Return to the control tower or reload the page.</p><button class="secondary" data-action="go-overview">Control tower</button>';}
}
function navigate(next){if(!Object.hasOwn(VIEWS,next))return;if(view!==next&&view==='analyst')persistAnalystThread();if(view!==next&&view==='scenarios')draft=clone(scenario);view=next;$('#sidebar').classList.remove('mobile-open');$('.mobile-menu').setAttribute('aria-expanded','false');if(location.hash!==`#${view}`)history.pushState(null,'',`${location.pathname}?${encodeScenario(scenario,d)}#${view}`);render();$('#main').focus({preventScroll:true});window.scrollTo({top:0,behavior:'instant'});}
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
function analystFormat(column,value){const n=analystNumber(value);if(n===null)return e(value??'—');const key=String(column).toUpperCase();if(/INR|EXPOSURE|VALUE|REVENUE|COST|PREMIUM|AMOUNT/.test(key))return `₹${new Intl.NumberFormat('en-IN',{maximumFractionDigits:0}).format(n)}`;if(/PCT|PERCENT|RATE/.test(key))return `${new Intl.NumberFormat('en-IN',{maximumFractionDigits:2}).format(n)}%`;if(/DAYS?/.test(key))return `${new Intl.NumberFormat('en-IN',{maximumFractionDigits:2}).format(n)} days`;if(/COUNT|QUANTITY|UNITS/.test(key))return new Intl.NumberFormat('en-IN',{maximumFractionDigits:0}).format(n);return new Intl.NumberFormat('en-IN',{maximumFractionDigits:2}).format(n);}
function analystLabel(column){return String(column).replaceAll('_',' ').toLowerCase().replace(/\b\w/g,c=>c.toUpperCase());}
function analystModel(result){
 const columns=result?.columns||[],rows=result?.rows||[];const numeric=columns.filter(c=>rows.some(r=>analystNumber(r[c])!==null));const dimensions=columns.filter(c=>!numeric.includes(c));
 const metric=numeric.find(c=>/EXPOSURE|VALUE|REVENUE|COST|AMOUNT|COUNT|QUANTITY|UNITS|DAYS|RATE|PERCENT/.test(String(c).toUpperCase()))||numeric[0];
 const dimension=dimensions.find(c=>!/SCENARIO/.test(String(c).toUpperCase()))||dimensions[0];return {columns,rows,numeric,dimensions,metric,dimension};
}
function analystNarrative(question,result,cortexText=''){
 const m=analystModel(result);if(!m.rows.length)return 'No matching records were returned for this question.';
 const q=String(question||'');const asksLowest=/\b(lowest|minimum|min\.?|smallest|least|bottom)\b/i.test(q);const asksHighest=/\b(highest|maximum|max\.?|largest|most|top)\b/i.test(q);
 const scenarioCol=m.columns.find(c=>String(c).toUpperCase()==='SCENARIO');
 if(scenarioCol&&m.metric&&m.rows.length>=2){
  const rows=m.rows.filter(r=>analystNumber(r[m.metric])!==null);
  if(rows.length>=2){
   const parts=rows.slice(0,4).map(r=>`<strong>${e(r[scenarioCol])}</strong>: ${analystFormat(m.metric,r[m.metric])}`);
   let delta='';
   const disruption=rows.find(r=>String(r[scenarioCol]).toUpperCase()==='ARUNA_4D');
   const recovery=rows.find(r=>String(r[scenarioCol]).toUpperCase()==='ARUNA_4D_RECOVERY');
   if(disruption&&recovery){const a=analystNumber(disruption[m.metric]),b=analystNumber(recovery[m.metric]);if(a!==null&&b!==null&&a!==0){const change=a-b;const pct=change/a*100;delta=` Recovery reduces ${e(analystLabel(m.metric).toLowerCase())} by <strong>${analystFormat(m.metric,change)}</strong> (${new Intl.NumberFormat('en-IN',{maximumFractionDigits:1}).format(pct)}%).`;}}
   return `${parts.join(' · ')}.${delta}`;
  }
 }
 if(m.metric&&m.dimension){
  const rows=[...m.rows].filter(r=>analystNumber(r[m.metric])!==null);
  const sorted=rows.sort((a,b)=>asksLowest?analystNumber(a[m.metric])-analystNumber(b[m.metric]):analystNumber(b[m.metric])-analystNumber(a[m.metric]));
  if(sorted.length){
   const first=sorted[0],second=sorted[1],third=sorted[2];const qualifier=asksLowest?'lowest':asksHighest?'highest':'leading';
   let text=`<strong>${e(first[m.dimension]??'The leading result')}</strong> has the ${qualifier} ${e(analystLabel(m.metric).toLowerCase())} at <strong>${analystFormat(m.metric,first[m.metric])}</strong>`;
   if(second)text+=`, followed by <strong>${e(second[m.dimension])}</strong> at ${analystFormat(m.metric,second[m.metric])}`;
   if(third&&/rank|top|highest|lowest|least|most|bottom/i.test(q))text+=` and <strong>${e(third[m.dimension])}</strong> at ${analystFormat(m.metric,third[m.metric])}`;
   return text+'.';
  }
 }
 if(m.metric&&m.rows.length===1)return `The result is <strong>${analystFormat(m.metric,m.rows[0][m.metric])}</strong>.`;
 const cleaned=String(cortexText||'').replace(/this is our interpretation of your question[:\s-]*/ig,'').trim();
 if(cleaned)return e(cleaned);
 return `I found <strong>${m.rows.length}</strong> matching records for your question.`;
}
function splitCompoundQuestion(question){
 const q=String(question||'').trim();
 const patterns=[/[,;]?\s+(?:and\s+)?what (?:action|actions|should we do|should we take|do you recommend).*$/i,/[,;]?\s+(?:and\s+)?(?:recommend|suggest) (?:an )?(?:action|actions|next steps?).*$/i,/[,;]?\s+(?:and\s+)?how (?:can|should) we (?:reduce|mitigate|address|respond to).*$/i];
 for(const re of patterns){const m=q.match(re);if(m&&m.index>12)return {analysisQuestion:q.slice(0,m.index).trim().replace(/[?,;]+$/,'?'),wantsRecommendation:true};}
 return {analysisQuestion:q,wantsRecommendation:/\b(action|recommend|suggest|mitigat|reduce risk|next step)\b/i.test(q)};
}
function semanticScenarioName(){
 const delayed=Object.entries(scenario.delays||{}).filter(([,days])=>Number(days)>0);const aruna=d.suppliers[0]?.id;
 if(!delayed.length&&!scenario.recovery)return 'BASELINE';
 if(delayed.length===1&&delayed[0][0]===aruna&&Number(delayed[0][1])===4)return scenario.recovery?'ARUNA_4D_RECOVERY':'ARUNA_4D';
 return '';
}
function contextualizeAnalystQuestion(question){
 const q=String(question||'').trim();
 if(/\b(BASELINE|ARUNA_4D|ARUNA_4D_RECOVERY)\b/i.test(q))return q;
 const scenarioSensitive=/\b(exposure|risk|delay|late|shortage|inventory|days of inventory|fill rate|on[- ]?time|otd|recovery|landed cost|cost|order value|affected|impact|disruption|mitigation)\b/i.test(q);
 if(!scenarioSensitive)return q;
 const s=semanticScenarioName();
 return s?`${q} Use scenario ${s}.`:q;
}
function recommendationFor(question,result){
 const m=analystModel(result);if(!m.rows.length)return null;
 const dim=String(m.dimension||'').toUpperCase();const metric=m.metric;const sorted=metric?[...m.rows].filter(r=>analystNumber(r[metric])!==null).sort((a,b)=>analystNumber(b[metric])-analystNumber(a[metric])):m.rows;const top=sorted[0]||{};const name=String(top[m.dimension]||'the highest-risk item');const value=metric?analystFormat(metric,top[metric]):'';
 let title=`Review and mitigate ${name} exposure`,action=`Review the highest-impact records for ${name}, assign an owner and validate the mitigation in the recovery scenario before execution.`,owner='Supply Planning';
 if(/SUPPLIER|VENDOR/.test(dim)){title=`Qualify alternate source for ${name}`;action=`Qualify an alternate source for the exposed components supplied by ${name}, prioritize the highest-value affected orders and simulate a partial demand shift before approval.`;owner='Procurement Lead';}
 else if(/PLANT|FACTORY|LOCATION/.test(dim)){title=`Rebalance exposure at ${name}`;action=`Review alternate production capacity and inbound supply options for ${name}, then model the lowest-risk production reallocation in the recovery scenario.`;owner='Operations Lead';}
 else if(/PRODUCT|PART|COMPONENT/.test(dim)){title=`Mitigate ${name} component risk`;action=`Prioritize replenishment and alternate sourcing for ${name}, protect the highest-value customer orders and validate recovery capacity.`;owner='Supply Planning';}
 else if(/CUSTOMER|CLIENT|BUYER/.test(dim)){title=`Protect commitments for ${name}`;action=`Prioritize the exposed orders for ${name}, confirm revised supply dates and align procurement and logistics actions to protect the highest-value commitments.`;owner='Customer Operations';}
 else if(/ORDER/.test(dim)){title=`Recover ${name}`;action=`Trace the shortage path for ${name}, confirm the fastest feasible recovery source and assign execution ownership for the due-date risk.`;owner='Supply Planning';}
 return {title,action,owner,summary:`${name}${value?` is the leading exposure at ${value}`:''}.`,expectedImpact:'Reduce modeled exposure and protect customer commitments'};
}
function analystFilters(result,id){const m=analystModel(result);const dims=m.dimensions.filter(c=>new Set(m.rows.map(r=>String(r[c]??''))).size>1).slice(0,3);if(!dims.length)return '';return `<div class="analyst-filters" data-result-id="${id}">${dims.map(c=>{const vals=[...new Set(m.rows.map(r=>String(r[c]??'')).filter(Boolean))].sort();return `<label>${e(analystLabel(c))}<select data-analyst-filter="${e(c)}"><option value="">All</option>${vals.map(v=>`<option>${e(v)}</option>`).join('')}</select></label>`}).join('')}</div>`;}
function analystTable(result,id){const m=analystModel(result);if(!m.rows.length)return '';return `<div class="analyst-table-wrap"><table class="analyst-table" data-analyst-table="${id}"><thead><tr>${m.columns.map(c=>`<th>${e(analystLabel(c))}</th>`).join('')}</tr></thead><tbody>${m.rows.slice(0,50).map(r=>`<tr>${m.columns.map(c=>`<td data-col="${e(c)}" data-raw="${e(r[c]??'')}">${analystFormat(c,r[c])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;}
function analystChart(result,id,question=''){const m=analystModel(result);if(!m.metric||!m.dimension)return '';const asc=/\b(lowest|minimum|min\.?|smallest|least|bottom)\b/i.test(String(question));const items=m.rows.map(r=>({label:String(r[m.dimension]??''),value:analystNumber(r[m.metric]),scenario:m.dimensions.includes('SCENARIO')?String(r.SCENARIO??''):''})).filter(x=>x.label&&x.value!==null).sort((a,b)=>asc?a.value-b.value:b.value-a.value).slice(0,10);if(items.length<2)return '';const max=Math.max(...items.map(x=>Math.abs(x.value)),1);return `<section class="analyst-viz" data-analyst-chart="${id}"><div class="viz-head"><div><span class="eyebrow">DYNAMIC VISUALIZATION</span><strong>${e(analystLabel(m.metric))} by ${e(analystLabel(m.dimension))}</strong></div><span>${items.length} shown</span></div><div class="bar-chart">${items.map(x=>`<div class="bar-row" data-chart-label="${e(x.label)}"><span title="${e(x.label)}">${e(x.label)}</span><div class="bar-track"><i style="width:${Math.max(2,Math.abs(x.value)/max*100).toFixed(1)}%"></i></div><b>${analystFormat(m.metric,x.value)}</b></div>`).join('')}</div></section>`;}
function applyAnalystFilters(container){const selects=[...container.querySelectorAll('[data-analyst-filter]')];const table=container.querySelector('[data-analyst-table]');if(!table)return;for(const tr of table.tBodies[0].rows){const show=selects.every(sel=>!sel.value||[...tr.cells].some(td=>td.dataset.col===sel.dataset.analystFilter&&td.dataset.raw===sel.value));tr.hidden=!show;}const visible=new Set([...table.tBodies[0].rows].filter(r=>!r.hidden).map(r=>[...r.cells][0]?.dataset.raw));container.querySelectorAll('[data-chart-label]').forEach(row=>{if(selects.length)row.hidden=false;});}

function showAssistant(){navigate('analyst');requestAnimationFrame(()=>$('#analyst-question')?.focus());}
function analystUI(){return {log:$('#analyst-chat-log')||$('#chat-log'),input:$('#analyst-question')||$('#question'),form:$('#analyst-ask-form')||$('#ask-form')};}
const wait=ms=>new Promise(r=>setTimeout(r,ms));
function analystProgressMarkup(){return `<div class="answer-heading">${icon('chat')}<strong>OntoTrail Intelligence</strong><span class="live-pill">LIVE · SNOWFLAKE CORTEX</span></div><div class="analyst-progress" aria-live="polite"><div class="analyst-progress-line"><span class="analyst-spinner" aria-hidden="true"></span><strong data-progress-label>Understanding your question…</strong></div><div class="analyst-progress-steps"><span class="active">Interpret</span><i></i><span>Govern</span><i></i><span>Query</span><i></i><span>Answer</span></div></div>`;}
function setAnalystProgress(answerEl,label,step){const labelEl=answerEl.querySelector('[data-progress-label]');if(labelEl)labelEl.textContent=label;answerEl.querySelectorAll('.analyst-progress-steps span').forEach((el,i)=>el.classList.toggle('active',i<=step));}
async function revealNarrative(container,html){
 const target=container.querySelector('[data-stream-text]');if(!target)return;
 const scratch=document.createElement('div');scratch.innerHTML=html;const text=scratch.textContent||'';
 target.textContent='';target.classList.add('streaming');
 const words=text.split(/(\s+)/);let out='';
 for(let i=0;i<words.length;i++){out+=words[i];target.textContent=out;if(i%4===0)await wait(18);}
 target.innerHTML=html;target.classList.remove('streaming');
}
function analystWorkspaceKey(){const s=window.__ONTOTRAIL_SESSION||{};const identity=String(s.email||`${s.tenant||'workspace'}:${s.role||'user'}`).toLowerCase().replace(/[^a-z0-9_-]+/g,'_');return `ontotrail_analyst_workspace_v1_${identity}`;}
function blankAnalystThread(projectId=''){const now=new Date().toISOString();return {id:crypto.randomUUID(),title:'New chat',projectId,createdAt:now,updatedAt:now,html:''};}
function normalizeAnalystWorkspace(raw){
 const ws=raw&&typeof raw==='object'?raw:{};
 ws.projects=Array.isArray(ws.projects)?ws.projects:[];
 ws.threads=Array.isArray(ws.threads)?ws.threads:[];
 if(!ws.threads.length)ws.threads=[blankAnalystThread()];
 if(!ws.activeThreadId||!ws.threads.some(t=>t.id===ws.activeThreadId))ws.activeThreadId=ws.threads[0].id;
 return ws;
}
function loadAnalystWorkspace(){
 try{const raw=storage.getItem(analystWorkspaceKey());analystWorkspace=normalizeAnalystWorkspace(raw?JSON.parse(raw):null);}catch{analystWorkspace=normalizeAnalystWorkspace(null);}
}
function saveAnalystWorkspace(){try{storage.setItem(analystWorkspaceKey(),JSON.stringify(analystWorkspace));}catch{}}
function activeAnalystThread(){return analystWorkspace.threads.find(t=>t.id===analystWorkspace.activeThreadId)||analystWorkspace.threads[0];}
function persistAnalystThread(){
 const log=$('#analyst-chat-log'),thread=activeAnalystThread();if(!log||!thread)return;
 try{const pairs=[...log.querySelectorAll('.chat-pair')];while(pairs.length>30){pairs.shift()?.remove();}thread.html=log.innerHTML;thread.updatedAt=new Date().toISOString();saveAnalystWorkspace();}catch{}
}
function restoreAnalystThread(){
 if(view!=='analyst')return;const log=$('#analyst-chat-log'),thread=activeAnalystThread();if(!log||!thread)return;
 if(thread.html){log.innerHTML=thread.html;chatCount=log.querySelectorAll('.chat-pair').length;log.querySelectorAll('[data-decision-insight]').forEach(btn=>{btn.disabled=true;btn.title='Re-run this question to create a new decision from the latest evidence.';});if(chatCount)log.scrollTop=log.scrollHeight;}else chatCount=0;
}
function newAnalystChat(projectId=''){
 persistAnalystThread();const thread=blankAnalystThread(projectId);analystWorkspace.threads.unshift(thread);analystWorkspace.activeThreadId=thread.id;saveAnalystWorkspace();chatCount=0;render();requestAnimationFrame(()=>$('#analyst-question')?.focus());
}
function selectAnalystThread(id){if(!analystWorkspace.threads.some(t=>t.id===id))return;persistAnalystThread();analystWorkspace.activeThreadId=id;saveAnalystWorkspace();chatCount=0;render();}
function projectDialog(){
 openDetail(`<div class="dialog-head"><div><span class="eyebrow">AI ANALYST</span><h2 id="detail-title">Create project</h2><p>Group related chat threads into one working space.</p></div><button class="icon-button" data-close="detail-dialog" aria-label="Close">×</button></div><form id="project-form" class="detail-body"><label class="field-label">Project name<input class="text-input" name="name" required maxlength="60" placeholder="e.g. Aruna recovery analysis" autofocus></label><div class="form-actions"><button type="button" class="secondary" data-close="detail-dialog">Cancel</button><button class="primary">Create project</button></div></form>`);
}
function createAnalystProject(name){const clean=String(name||'').trim();if(!clean)return;const p={id:crypto.randomUUID(),name:clean,createdAt:new Date().toISOString()};analystWorkspace.projects.push(p);const t=blankAnalystThread(p.id);analystWorkspace.threads.unshift(t);analystWorkspace.activeThreadId=t.id;saveAnalystWorkspace();closeDialog('detail-dialog');chatCount=0;navigate('analyst');}
function clearAnalystHistory(){const thread=activeAnalystThread();if(!thread)return;thread.html='';thread.title='New chat';thread.updatedAt=new Date().toISOString();saveAnalystWorkspace();chatCount=0;if(view==='analyst'){render();toast('Current chat cleared.');}}
async function ask(q){
 const question=q.trim();if(!question)return;if(view!=='analyst')navigate('analyst');const chat=analystUI();if(!chatCount){chat.log?.replaceChildren();const thread=activeAnalystThread();if(thread&&thread.title==='New chat'){thread.title=question.length>52?`${question.slice(0,49)}…`:question;saveAnalystWorkspace();}}
 const {analysisQuestion,wantsRecommendation}=splitCompoundQuestion(question);
 const block=document.createElement('article');block.className='chat-pair';block.innerHTML=`<p class="user-question">${e(question)}</p><div class="assistant-answer">${analystProgressMarkup()}</div>`;chat.log?.append(block);chatCount++;if(chat.input){chat.input.value='';chat.input.disabled=true;}const askButton=chat.form?.querySelector('button[type="submit"]');if(askButton)askButton.disabled=true;if(chat.log)chat.log.scrollTop=chat.log.scrollHeight;
 try{
  const answerEl=block.querySelector('.assistant-answer');
  const governedQuestion=contextualizeAnalystQuestion(analysisQuestion);
  await wait(220);setAnalystProgress(answerEl,'Mapping your question to governed business terms…',1);
  const progressTimer1=setTimeout(()=>setAnalystProgress(answerEl,'Querying Snowflake Cortex Analyst…',2),650);
  const progressTimer2=setTimeout(()=>setAnalystProgress(answerEl,'Preparing the governed answer…',3),1500);
  const a=await askAnalyst(governedQuestion);clearTimeout(progressTimer1);clearTimeout(progressTimer2);setAnalystProgress(answerEl,'Preparing the governed answer…',3);const rid=`analyst-${Date.now()}`;const hasRows=Boolean(a.result?.rows?.length);const resultHtml=hasRows?`${analystFilters(a.result,rid)}${analystChart(a.result,rid,question)}${analystTable(a.result,rid)}`:'';
  const sql=a.sql?`<details class="analyst-sql"><summary>Audit trail · View generated SQL</summary><pre>${e(a.sql)}</pre></details>`:'';
  const warning=a.executionWarning?`<p class="analyst-warning">${e(a.executionWarning)}</p>`:'';
  const suggestions=a.suggestions?.length?`<div class="analyst-suggestions"><span>Explore next</span>${a.suggestions.map(s=>`<button type="button" data-question="${e(s)}">${e(s)}</button>`).join('')}</div>`:'';
  const rec=hasRows?recommendationFor(question,a.result):null;if(rec)decisionInsights.set(rid,{title:rec.title,problem:block.querySelector('.user-question')?.textContent?`${analystNarrative(question,a.result,a.text||'').replace(/<[^>]+>/g,'')}`:'',action:rec.action,owner:rec.owner,priority:'High',status:'Assigned',expectedImpact:rec.expectedImpact,source:'Cortex Analyst'});
  const recHtml=rec&&(wantsRecommendation||/EXPOSURE|RISK|DELAY|SHORTAGE/i.test(question))?`<section class="recommendation-card"><span class="eyebrow">RECOMMENDED NEXT MOVE</span><h4>${e(rec.title)}</h4><p>${e(rec.action)}</p><div><span>Suggested owner</span><strong>${e(rec.owner)}</strong></div></section>`:'';
  const decisionButton=hasRows&&rec?`<div class="analyst-actions"><button class="secondary small" data-decision-insight="${e(rid)}">${icon('check')}Create decision from insight</button></div>`:'';
  const interpretation=analysisQuestion!==question?`<p class="query-split-note">I answered the analytical part with Cortex Analyst, then generated the recommended action from the returned evidence.</p>`:'';
  const narrative=analystNarrative(question,a.result||{columns:[],rows:[]},a.text||'');
  answerEl.innerHTML=`<div class="answer-heading">${icon('chat')}<strong>OntoTrail Intelligence</strong><span class="live-pill">LIVE · SNOWFLAKE CORTEX</span></div><p class="direct-answer" data-stream-text></p><div class="analyst-reveal" hidden>${interpretation}${recHtml}${resultHtml}${warning}${decisionButton}${sql}${suggestions}<small>Grounded in ONTOTRAIL_COCO_ANALYST · Request ${e(a.requestId||'Snowflake')}</small></div>`;
  await revealNarrative(answerEl,narrative);
  const reveal=answerEl.querySelector('.analyst-reveal');if(reveal){reveal.hidden=false;requestAnimationFrame(()=>reveal.classList.add('visible'));}
 }catch(err){
  const local=answer(question,d,result);block.querySelector('.assistant-answer').innerHTML=`<div class="answer-heading">${icon('chat')}<strong>Local fallback · ${e(local.title)}</strong></div><p>${e(local.text)}</p>${evidenceButtons(local.ids)}<small>Cortex Analyst unavailable: ${e(err.message||'connection error')}</small>`;
 }finally{const current=analystUI();if(current.input){current.input.disabled=false;current.input.focus();}const btn=current.form?.querySelector('button[type="submit"]');if(btn)btn.disabled=false;if(current.log)current.log.scrollTop=current.log.scrollHeight;persistAnalystThread();}
}
function decisionDialog(seed={}){
 const today=new Date().toISOString().slice(0,10);const due=seed.due||today;
 openDetail(`<div class="dialog-head"><div><span class="eyebrow">DECISION WORKFLOW</span><h2 id="detail-title">Create decision</h2><p>Turn an insight into an owned, trackable action.</p></div><button class="icon-button" data-close="detail-dialog" aria-label="Close">${icon('close')}</button></div><form id="decision-form" class="detail-body decision-form"><section class="decision-form-section"><h3>Decision</h3><label class="field-label">Decision title<input class="text-input" name="title" required maxlength="120" value="${e(seed.title||'')}"></label><label class="field-label">Problem / evidence<textarea class="text-input decision-textarea" name="problem" required maxlength="700">${e(seed.problem||'')}</textarea></label><label class="field-label">Recommended action<textarea class="text-input decision-textarea" name="action" required maxlength="700">${e(seed.action||'')}</textarea></label></section><section class="decision-form-section"><h3>Ownership & execution</h3><div class="decision-form-grid"><label class="field-label">Owner<input class="text-input" name="owner" required maxlength="80" value="${e(seed.owner||'Supply Planning')}"></label><label class="field-label">Owner email<input class="text-input" name="ownerEmail" type="email" required maxlength="254" value="${e(seed.ownerEmail||'jury@cococli.demo')}" placeholder="owner@company.com"></label><label class="field-label">Due date<input class="text-input" name="due" type="date" required value="${e(due)}"></label><label class="field-label">Priority<select class="text-input" name="priority"><option>High</option><option ${seed.priority==='Medium'?'selected':''}>Medium</option><option ${seed.priority==='Low'?'selected':''}>Low</option></select></label><label class="field-label">Status<select class="text-input" name="status"><option>Proposed</option><option ${seed.status==='Assigned'?'selected':''}>Assigned</option><option ${seed.status==='In progress'?'selected':''}>In progress</option><option ${seed.status==='Waiting for input'?'selected':''}>Waiting for input</option><option ${seed.status==='Completed'?'selected':''}>Completed</option><option ${seed.status==='Closed'?'selected':''}>Closed</option></select></label><label class="field-label">Initial note<input class="text-input" name="note" maxlength="180" value="${e(seed.note||'')}"></label></div><label class="field-label">Expected outcome<input class="text-input" name="expectedImpact" maxlength="180" value="${e(seed.expectedImpact||'')}"></label></section><input type="hidden" name="source" value="${e(seed.source||'Manual decision')}"><div class="form-actions"><button type="button" class="secondary" data-close="detail-dialog">Cancel</button><button class="primary">Create & notify owner</button></div></form>`);
}
function createDecisionFromInsight(button){const seed=decisionInsights.get(button.dataset.decisionInsight)||{};decisionDialog(seed);}
async function sendDecisionNotification(item){
 try{const r=await notifyDecision({to:item.ownerEmail,id:item.id,title:item.title,status:item.status,priority:item.priority,due:item.due,problem:item.problem,action:item.action,workspaceUrl:`${location.origin}${location.pathname}#decisions`});item.notification={state:r.sent?'sent':'pending_configuration',at:new Date().toISOString(),message:r.message||''};addDecisionActivity(item,item.status,r.sent?`Notification sent to ${item.ownerEmail}.`:'Email notification pending configuration.');persistDecisions();return r;}catch(err){item.notification={state:'failed',at:new Date().toISOString(),message:err.message};addDecisionActivity(item,item.status,`Notification failed: ${err.message}`);persistDecisions();return {sent:false,error:err.message};}
}
function decisionDetail(item){const events=[...(item.activity||[])].reverse();openDetail(`<div class="dialog-head"><div><span class="eyebrow">${e(item.id)}</span><h2 id="detail-title">${e(item.title)}</h2><p>${e(item.owner)} · ${e(item.status)}</p></div><button class="icon-button" data-close="detail-dialog" aria-label="Close">${icon('close')}</button></div><div class="detail-body decision-detail"><section><h3>Evidence</h3><p>${e(item.problem)}</p><h3>Action</h3><p>${e(item.action)}</p></section><dl class="preview-list"><div><dt>Owner</dt><dd>${e(item.owner)}<br><small>${e(item.ownerEmail||'No email')}</small></dd></div><div><dt>Due date</dt><dd>${e(item.due)}</dd></div><div><dt>Priority</dt><dd>${e(item.priority)}</dd></div><div><dt>Notification</dt><dd>${e(item.notification?.state||'not sent')}</dd></div></dl><section class="decision-timeline"><h3>Activity timeline</h3>${events.map(ev=>`<article><i></i><div><strong>${e(ev.status)}</strong><p>${e(ev.note)}</p><time>${e(new Date(ev.at).toLocaleString('en-IN'))}</time></div></article>`).join('')}</section></div>`);}
function previewDraft(){try{const valid=validateScenario(draft,d);$('#scenario-preview').innerHTML=scenarioPreview(d,valid);$('#draft-error').textContent='';$('#scenario-form button[type="submit"]').disabled=false;}catch(err){$('#draft-error').textContent=err.message;$('#scenario-form button[type="submit"]').disabled=true;}}
function confirmDelete(id){const s=saved.find(x=>x.id===id);if(!s)return;openDetail(`<div class="dialog-head"><h2 id="detail-title">Delete saved scenario?</h2><button class="icon-button" data-close="detail-dialog" aria-label="Close">${icon('close')}</button></div><div class="detail-body"><p>This removes “${e(s.name)}” from this browser. The active scenario is unchanged.</p><div class="form-actions"><button class="secondary" data-close="detail-dialog">Cancel</button><button class="primary destructive" data-confirm-delete="${e(id)}">Delete scenario</button></div></div>`);}
async function share(){if(!/^https?:$/.test(location.protocol)){toast('Use a deployed URL to share a link, or export the scenario JSON.');return;}const url=`${location.origin}${location.pathname}?${encodeScenario(scenario,d)}#${view}`;try{await navigator.clipboard.writeText(url);toast('Scenario link copied.');}catch{openDetail(`<div class="dialog-head"><h2 id="detail-title">Copy this scenario link</h2><button class="icon-button" data-close="detail-dialog" aria-label="Close">${icon('close')}</button></div><div class="detail-body"><label class="field-label" for="share-url">Link with exact assumptions</label><input id="share-url" class="text-input" value="${e(url)}" readonly><p class="helper">Copy the selected text. Saved scenario names and browser activity are not included.</p></div>`);$('#share-url').select();}}
function showClear(){openDetail(`<div class="dialog-head"><h2 id="detail-title">Clear local planning data?</h2><button class="icon-button" data-close="detail-dialog" aria-label="Close">${icon('close')}</button></div><div class="detail-body"><p>This deletes saved scenarios and activity from this browser. Export anything you need first. The active scenario remains available.</p><div class="form-actions"><button class="secondary" data-close="detail-dialog">Cancel</button><button class="primary destructive" data-action="confirm-clear">Clear local data</button></div></div>`);}
const actions={
 'go-scenarios':()=>navigate('scenarios'),'go-orders':()=>navigate('orders'),'go-decisions':()=>navigate('decisions'),'new-decision':()=>decisionDialog(),'go-about':()=>navigate('about'),'go-profile':()=>navigate('profile'),'go-overview':()=>navigate('overview'),'go-analyst':()=>navigate('analyst'),
 'menu':()=>{const open=$('#sidebar').classList.toggle('mobile-open');$('.mobile-menu').setAttribute('aria-expanded',String(open));},'sidebar-collapse':toggleSidebar,
 'assistant':showAssistant,'new-chat':()=>newAnalystChat(),'new-project':projectDialog,'clear-chat-history':clearAnalystHistory,'share':share,'save':saveDialog,'export':()=>exportScenario(),
 'export-csv':()=>{downloadFile('ontotrail-orders.csv',orderCSV(result),'text/csv;charset=utf-8');toast('All orders exported for the active scenario.');},
 'draft-baseline':()=>{draft=baseline(d);render();toast('Preview reset to zero delays. Apply to update the workspace.');},
 'draft-reset':()=>{draft=clone(scenario);render();toast('Unapplied changes discarded.');},
 'import':()=>$('#import-file').click(),
 'clear-local':showClear,'confirm-clear':()=>{saved=[];activity=[];ui.compareId='';persist();closeDialog('detail-dialog');render();toast('Saved scenarios and local activity cleared.');}
};
document.addEventListener('click',event=>{const target=event.target.closest('button,a');if(!target)return;
 try{
  if(target.dataset.assistantExpand!==undefined){const dlg=$('#assistant-dialog');const expanded=dlg.classList.toggle('expanded');target.setAttribute('aria-pressed',String(expanded));target.setAttribute('aria-label',expanded?'Restore Ask OntoTrail':'Maximize Ask OntoTrail');target.title=expanded?'Restore':'Maximize';target.textContent=expanded?'↙':'⛶';return;}
  if(target.dataset.close){closeDialog(target.dataset.close);return;}
  if(target.dataset.order){openOrder(target.dataset.order);return;}
  if(target.dataset.source){event.preventDefault();if($('#assistant-dialog').open)$('#assistant-dialog').close();sourceRecord(target.dataset.source);return;}
  if(target.dataset.nav){event.preventDefault();navigate(target.dataset.nav);return;}
  if(target.dataset.question){ask(target.dataset.question);return;}
  if(target.dataset.threadId){event.preventDefault();selectAnalystThread(target.dataset.threadId);return;}
  if(target.dataset.projectChat!==undefined){event.preventDefault();newAnalystChat(target.dataset.projectChat);return;}
  if(target.dataset.decisionInsight){createDecisionFromInsight(target);return;}
  if(target.dataset.decisionStatus){const item=decisions.find(d=>d.id===target.dataset.decisionStatus);if(item){addDecisionActivity(item,target.dataset.nextStatus,`Status changed to ${target.dataset.nextStatus}.`);persistDecisions();void sendDecisionNotification(item);render();toast(`Decision ${item.id} moved to ${item.status}.`);}return;}
  if(target.dataset.decisionView){const item=decisions.find(d=>d.id===target.dataset.decisionView);if(item)decisionDetail(item);return;}
  if(target.dataset.decisionNotify){const item=decisions.find(d=>d.id===target.dataset.decisionNotify);if(item){void sendDecisionNotification(item).then(r=>toast(r.sent?'Owner notified by email.':'Decision saved; email provider is not configured yet.'));}return;}
  if(target.dataset.decisionDelete){decisions=decisions.filter(d=>d.id!==target.dataset.decisionDelete);persistDecisions();render();toast('Decision removed.');return;}
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
  if(form.id==='ask-form'||form.id==='analyst-ask-form'){const input=form.querySelector('input');void ask(input?.value||'');return;}
  if(form.id==='global-search'){ui.query=$('#global-query').value.trim();ui.page=1;ui.status='all';ui.priority='all';navigate('orders');return;}
  if(form.id==='order-search'){ui.query=$('#order-query').value.trim();ui.page=1;render();return;}
  if(form.id==='evidence-search'){ui.evidenceQuery=$('#evidence-query').value.trim();render();return;}
  if(form.id==='scenario-form'){applyScenario(draft,'Applied scenario assumptions');return;}
  if(form.id==='project-form'){const fd=new FormData(form);createAnalystProject(fd.get('name'));return;}
  if(form.id==='decision-form'){const fd=new FormData(form);const createdAt=new Date().toISOString();const item={id:nextDecisionId(decisions),title:String(fd.get('title')||'').trim(),problem:String(fd.get('problem')||'').trim(),action:String(fd.get('action')||'').trim(),owner:String(fd.get('owner')||'').trim(),ownerEmail:String(fd.get('ownerEmail')||'').trim(),due:String(fd.get('due')||''),priority:String(fd.get('priority')||'Medium'),status:String(fd.get('status')||'Proposed'),expectedImpact:String(fd.get('expectedImpact')||'').trim(),scenario:scenarioSummary(scenario,d),source:String(fd.get('source')||'Manual decision'),createdAt,updatedAt:createdAt,notification:{state:'not_sent'},activity:[{status:String(fd.get('status')||'Proposed'),note:String(fd.get('note')||'Decision created.').trim()||'Decision created.',at:createdAt}]};if(!item.title||!item.problem||!item.action||!item.owner||!item.ownerEmail||!item.due)throw Error('Complete the required decision fields.');decisions.unshift(item);persistDecisions();log(`Created decision ${item.id}: ${item.title}`);closeDialog('detail-dialog');navigate('decisions');void sendDecisionNotification(item).then(r=>{render();toast(r.sent?'Decision created and owner notified.':'Decision created. Configure email delivery to send notifications.');});return;}
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
  if(t.id==='thread-project-select'){const thread=activeAnalystThread();if(thread){thread.projectId=t.value;thread.updatedAt=new Date().toISOString();saveAnalystWorkspace();render();}}
  if(t.id==='import-file'){const file=t.files?.[0];if(!file)return;if(file.size>25000)throw Error('Scenario files must be smaller than 25 KB.');const parsed=parseScenarioFile(await file.text(),d);applyScenario(parsed.scenario,`Imported scenario: ${parsed.name}`);navigate('scenarios');t.value='';}
 }catch(err){toast(err.message||'This change could not be applied.');if(t.id==='import-file')t.value='';}
});
window.addEventListener('popstate',()=>{const parsed=decodeScenario(location.search,d);scenario=parsed.scenario;result=evaluate(d,scenario);draft=clone(scenario);view=Object.hasOwn(VIEWS,location.hash.slice(1))?location.hash.slice(1):'analyst';render();if(parsed.warning)toast(parsed.warning);});
window.addEventListener('hashchange',()=>{const next=location.hash.slice(1);if(Object.hasOwn(VIEWS,next)&&next!==view)navigate(next);});
for(const dlg of document.querySelectorAll('dialog'))dlg.addEventListener('click',event=>{if(event.target===dlg){const b=dlg.getBoundingClientRect();if(event.clientX<b.left||event.clientX>b.right||event.clientY<b.top||event.clientY>b.bottom)dlg.close();}});
try{validateDataset(d);result=evaluate(d,scenario);loadAnalystWorkspace();shell();applySidebarState();render();initWelcome();if(initial.warning||persisted.warning)toast(initial.warning||persisted.warning);}
catch(err){$('#shell').innerHTML=`<main class="fatal"><h1>OntoTrail could not load its dataset</h1><p>Calculations are unavailable until the source records are corrected.</p><p>${e(err.message)}</p><ul>${(err.issues||[]).map(s=>`<li>${e(s)}</li>`).join('')}</ul></main>`;console.error(err);}

window.addEventListener('ontotrail-session',()=>{loadAnalystWorkspace();if(view==='analyst')render();});

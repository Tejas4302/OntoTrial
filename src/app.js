import {initWelcome} from './ui/welcome.js';
import {APP,VIEWS} from './config.js';
import {dataset as d} from './domain/data.js';
import {validateDataset,validateScenario} from './domain/validation.js';
import {evaluate,baseline,example} from './domain/engine.js';
import {decodeScenario,encodeScenario,fingerprint,scenarioFile,parseScenarioFile} from './domain/scenario.js';
import {answer} from './domain/assistant.js';
import {askAnalyst} from './services/analyst.js';
import {loadTradeDashboard} from './services/trade.js';
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
const ui={query:'',status:'all',priority:'all',sort:'due',page:1,partId:d.parts[0].id,evidenceQuery:'',compareId:'',aiScenario:null};
let notificationTimer;let dialogFocus;let chatCount=0;const decisionInsights=new Map();
let analystWorkspace={projects:[],threads:[],activeThreadId:''};
let tradeData={loading:true,error:'',summary:null,origins:[],commodities:[],weather:[]};
const navIcons={analyst:'chat',overview:'grid',operations:'box',orders:'orders',network:'network',scenarios:'sliders',evidence:'file',decisions:'check',governance:'shield',profile:'info',about:'info'};
function toast(message){$('#toast').textContent=message;$('#toast').classList.add('show');clearTimeout(notificationTimer);notificationTimer=setTimeout(()=>$('#toast').classList.remove('show'),5000);}
function persist(){if(!writeWorkspace(storage,saved,activity))toast('Browser storage is unavailable. Export your scenario before closing this page.');}
function persistDecisions(){if(!writeDecisions(storage,decisions))toast('Decision updates could not be saved in this browser.');}
function log(text){activity.unshift({text,at:new Date().toISOString()});activity=activity.slice(0,APP.maxActivity);persist();}
function updateURL(){try{history.replaceState(null,'',`${location.pathname}?${encodeScenario(scenario,d)}#${view}`);}catch{toast('Scenario URL could not be updated. Use Export scenario instead.');}}
function shell(){
 $('#shell').innerHTML=`<aside class="sidebar" id="sidebar"><div class="sidebar-brand-row"><a href="#analyst" class="brand" aria-label="OntoTrail AI Analyst"><span class="brand-mark-shell"><img class="brand-logo-mark" src="/assets/ontotrail-mark.png" alt=""></span><span class="brand-wordmark">OntoTrail</span></a><button class="sidebar-collapse-button" data-action="sidebar-collapse" type="button" aria-label="Collapse sidebar" aria-pressed="false" title="Collapse sidebar">‹</button></div><div class="workspace-label">NOVA MOBILITY INDIA</div><nav aria-label="Main navigation">${Object.entries(VIEWS).filter(([id])=>!['profile','about'].includes(id)).map(([id,label])=>`<a class="nav-item" href="#${id}" data-nav="${id}">${icon(navIcons[id])}<span>${label}</span>${id==='orders'?'<span id="nav-risk-count" class="nav-count"></span>':''}</a>`).join('')}</nav><button class="sidebar-bottom sidebar-profile" data-action="go-profile" type="button" aria-label="Open profile"><div class="workspace-avatar">NM</div><div><strong>Nova Mobility India</strong><span>Trade risk workspace</span></div><span class="sidebar-profile-arrow">›</span></button><div class="sidebar-version">OntoTrail v${APP.version}<span>Nova Mobility India</span></div></aside><div class="main-wrap"><header class="topbar"><div class="topbar-left"><button class="icon-button mobile-menu" data-action="menu" aria-label="Toggle navigation" aria-expanded="false" aria-controls="sidebar">${icon('menu')}</button><span class="breadcrumb">Workspace <span>/</span> <strong id="current-view"></strong></span></div><form id="global-search" class="global-search">${icon('search')}<label class="sr-only" for="global-query">Find a country</label><input id="global-query" name="query" placeholder="Find a country…" maxlength="100"><button type="submit" class="sr-only">Search</button></form><div class="header-actions"><span class="demo-indicator"><i></i>Nova Mobility India</span><span class="role-badge" data-role-badge></span><button class="secondary small" data-client-users hidden>Manage users</button><button class="secondary small" data-action="go-about">Workspace guide</button><button class="text-button" data-auth-logout>Log out</button></div></header><div class="notice-bar"><span>${icon('clock')}Marketplace trade intelligence · Nova Mobility India</span><button class="text-button" data-action="go-about">Model scope ${icon('info')}</button></div><main id="main" tabindex="-1"><div id="page-error" class="page-error" role="alert" hidden></div><div id="view-root"></div></main><footer class="footer"><span>Connect the dots. Trace the answers.</span><div><button class="text-button" data-action="go-analyst">${icon('chat')}AI Analyst</button><button class="text-button" data-action="go-governance">${icon('shield')}Metric governance</button></div></footer></div><input type="file" id="import-file" class="sr-only" accept="application/json,.json" aria-label="Import an OntoTrail scenario">`;
}
function sidebarCollapsed(){try{return storage.getItem('ontotrail_sidebar_collapsed')==='1';}catch{return false;}}
function applySidebarState(collapsed=sidebarCollapsed()){const sidebar=$('#sidebar');if(!sidebar)return;sidebar.classList.toggle('collapsed',collapsed);document.body.classList.toggle('sidebar-collapsed',collapsed);const btn=sidebar.querySelector('[data-action="sidebar-collapse"]');if(btn){btn.setAttribute('aria-pressed',String(collapsed));btn.setAttribute('aria-label',collapsed?'Expand sidebar':'Collapse sidebar');btn.title=collapsed?'Expand sidebar':'Collapse sidebar';}}
function toggleSidebar(){const collapsed=!$('#sidebar').classList.contains('collapsed');try{storage.setItem('ontotrail_sidebar_collapsed',collapsed?'1':'0');}catch{}applySidebarState(collapsed);}
function render(){
 try {$('#view-root').innerHTML=viewMap[view]({d,result,draft,saved,activity,ui,decisions,analystWorkspace,tradeData});$('#current-view').textContent=VIEWS[view];$('#nav-risk-count').textContent=tradeData.origins?.filter(x=>x.weatherRiskLevel==='HIGH'||x.weatherRiskLevel==='MEDIUM').length||'';document.querySelectorAll('[data-nav]').forEach(n=>{const active=n.dataset.nav===view;n.classList.toggle('active',active);if(active)n.setAttribute('aria-current','page');else n.removeAttribute('aria-current');});document.title=`OntoTrail · ${VIEWS[view]}`;document.body.classList.toggle('analyst-mode',view==='analyst');$('#page-error').hidden=true;if($('#assistant-context'))$('#assistant-context').textContent=`Current: ${scenarioSummary(scenario,d)} · ${scenario.bufferDays}-day buffer`;if($('#analyst-context'))$('#analyst-context').textContent='Ask across countries, commodities, transport modes, trade exposure and weather risk';if(view==='analyst')restoreAnalystThread();}
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
function analystCompactUsd(n){const a=Math.abs(n);if(a>=1e9)return '$'+new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(n/1e9)+'B';if(a>=1e6)return '$'+new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(n/1e6)+'M';if(a>=1e3)return '$'+new Intl.NumberFormat('en-US',{maximumFractionDigits:1}).format(n/1e3)+'K';return '$'+new Intl.NumberFormat('en-US',{maximumFractionDigits:0}).format(n);}
function analystCompactInr(n){const a=Math.abs(n);if(a>=1e7)return '₹'+new Intl.NumberFormat('en-IN',{maximumFractionDigits:2}).format(n/1e7)+' Cr';if(a>=1e5)return '₹'+new Intl.NumberFormat('en-IN',{maximumFractionDigits:2}).format(n/1e5)+' L';if(a>=1e3)return '₹'+new Intl.NumberFormat('en-IN',{maximumFractionDigits:1}).format(n/1e3)+'K';return '₹'+new Intl.NumberFormat('en-IN',{maximumFractionDigits:0}).format(n);}
function analystFormat(column,value){
 const key=String(column).toUpperCase();
 if(/(^|_)DATE$/.test(key)){
  const raw=String(value??'').trim();
  const numeric=Number(raw);
  let dt=null;
  if(raw&&Number.isFinite(numeric)&&numeric>10000&&numeric<100000)dt=new Date(numeric*86400000);
  else if(raw&&/^\d{4}-\d{2}-\d{2}/.test(raw))dt=new Date(raw.slice(0,10)+'T00:00:00Z');
  if(dt&&!Number.isNaN(dt.getTime()))return new Intl.DateTimeFormat('en-IN',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'}).format(dt);
  return e(value??'—');
 }
 const n=analystNumber(value);if(n===null)return e(value??'—');
 if(/INR/.test(key))return analystCompactInr(n);
 if(/TRADE_VALUE|IMPORT_VALUE|EXPORT_VALUE|NOMINAL|REAL_TRADE|PO_VALUE.*USD|VALUE_USD/.test(key))return analystCompactUsd(n);
 if(/EXPOSURE|REVENUE|COST|PREMIUM|AMOUNT/.test(key))return analystCompactInr(n);
 if(/PCT|PERCENT|RATE/.test(key))return `${new Intl.NumberFormat('en-IN',{maximumFractionDigits:2}).format(n)}%`;
 if(/DAYS?/.test(key))return `${new Intl.NumberFormat('en-IN',{maximumFractionDigits:2}).format(n)} days`;
 if(/COUNT|QUANTITY|UNITS/.test(key))return new Intl.NumberFormat('en-IN',{maximumFractionDigits:0}).format(n);
 return new Intl.NumberFormat('en-IN',{maximumFractionDigits:2}).format(n);
}
function analystLabel(column){return String(column).replaceAll('_',' ').toLowerCase().replace(/\b\w/g,c=>c.toUpperCase());}
function analystCommodityLabel(value){
 const raw=String(value||'').trim();const low=raw.toLowerCase();
 const aliases=[
  [/electrical machinery.*sound recorders|electrical machinery and equipment/,'Electrical machinery & electronics'],
  [/nuclear reactors.*boilers.*machinery|machinery and mechanical appliances/,'Machinery & mechanical equipment'],
  [/organic chemicals/,'Organic chemicals'],
  [/plastics and articles/,'Plastics & plastic articles'],
  [/iron and steel/,'Iron & steel'],
  [/vehicles other than railway/,'Vehicles & automotive equipment'],
  [/optical.*photographic.*medical/,'Optical, medical & precision instruments'],
  [/pharmaceutical products/,'Pharmaceutical products']
 ];
 const hit=aliases.find(([re])=>re.test(low));if(hit)return hit[1];
 const first=raw.split(';')[0].trim();
 return first.length>68?first.slice(0,65)+'…':first;
}
function analystModel(result){
 const columns=result?.columns||[],rows=result?.rows||[];const numeric=columns.filter(c=>rows.some(r=>analystNumber(r[c])!==null));const dimensions=columns.filter(c=>!numeric.includes(c));
 const metric=numeric.find(c=>/EXPOSURE|IMPORT_VALUE|EXPORT_VALUE|TRADE_VALUE|PO_VALUE|REVENUE|COST|AMOUNT/.test(String(c).toUpperCase()))||numeric.find(c=>/PCT|PERCENT|RATE|DAYS/.test(String(c).toUpperCase()))||numeric.find(c=>/COUNT|QUANTITY|UNITS/.test(String(c).toUpperCase()))||numeric[0];
 const dimension=dimensions.find(c=>!/SCENARIO/.test(String(c).toUpperCase()))||dimensions[0];return {columns,rows,numeric,dimensions,metric,dimension};
}
function analystNarrative(question,result,cortexText='',meta={}){
 const raw=String(cortexText||'').trim();
 if(raw)return e(raw).replace(/\n/g,'<br>');
 return '<span class="muted-inline">Snowflake Cortex Analyst returned governed data without a narrative response. Review the evidence table and audit trail below.</span>';
}

function splitCompoundQuestion(question){
 const q=String(question||'').trim();
 const patterns=[/[,;]?\s+(?:and\s+)?what (?:action|actions|should we do|should we take|do you recommend).*$/i,/[,;]?\s+(?:and\s+)?(?:recommend|suggest) (?:an )?(?:action|actions|next steps?).*$/i,/[,;]?\s+(?:and\s+)?how (?:can|should) we (?:reduce|mitigate|address|respond to).*$/i];
 for(const re of patterns){const m=q.match(re);if(m&&m.index>12)return {analysisQuestion:q.slice(0,m.index).trim().replace(/[?,;]+$/,'?'),wantsRecommendation:true};}
 return {analysisQuestion:q,wantsRecommendation:/\b(action|recommend|suggest|mitigat|reduce risk|next step)\b/i.test(q)};
}
function recommendationFor(question,result){
 const m=analystModel(result);if(!m.rows.length)return null;
 if(/high[- ]risk|high operational risk/i.test(String(question||''))&&m.metric&&/HIGH_OPERATIONAL_RISK_PO_VALUE_USD/i.test(String(m.metric))&&m.rows.every(r=>(analystNumber(r[m.metric])||0)===0))return null;
 const dim=String(m.dimension||'').toUpperCase();const metric=m.metric;const sorted=metric?[...m.rows].filter(r=>analystNumber(r[metric])!==null).sort((a,b)=>analystNumber(b[metric])-analystNumber(a[metric])):m.rows;const top=sorted[0]||{};const name=String(top[m.dimension]||'the highest-risk item');const value=metric?analystFormat(metric,top[metric]):'';
 let title=`Review and mitigate ${name} exposure`,action=`Review the highest-impact records for ${name}, assign an owner and validate the mitigation in the recovery scenario before execution.`,owner='Supply Planning';
 const geoMatch=String(question||'').match(/\b(?:to|from|with)\s+([A-Z][A-Za-z .'-]{2,40})\b/);
 if(/\b(import|export|trade)\b/i.test(question)&&/\b(exposure|dependenc|concentrat|risk)\b/i.test(question)){
  const geography=geoMatch?.[1]?.replace(/\s+in\s+\d{4}.*$/i,'').trim()||name;
  title=`Review ${geography} trade concentration and dependency`;
  action=`Prioritize the largest commodity exposures linked to ${geography}, validate sea/air/land dependency, and review alternate sourcing or routing options where concentration and weather risk overlap.`;
  owner='Trade Risk Lead';
 }
 if(/SUPPLIER|VENDOR/.test(dim)){title=`Qualify alternate source for ${name}`;action=`Qualify an alternate source for the exposed components supplied by ${name}, prioritize the highest-value affected orders and simulate a partial demand shift before approval.`;owner='Procurement Lead';}
 else if(/PLANT|FACTORY|LOCATION/.test(dim)){title=`Rebalance exposure at ${name}`;action=`Review alternate production capacity and inbound supply options for ${name}, then model the lowest-risk production reallocation in the recovery scenario.`;owner='Operations Lead';}
 else if(/PRODUCT|PART|COMPONENT/.test(dim)){title=`Mitigate ${name} component risk`;action=`Prioritize replenishment and alternate sourcing for ${name}, protect the highest-value customer orders and validate recovery capacity.`;owner='Supply Planning';}
 else if(/CUSTOMER|CLIENT|BUYER/.test(dim)){title=`Protect commitments for ${name}`;action=`Prioritize the exposed orders for ${name}, confirm revised supply dates and align procurement and logistics actions to protect the highest-value commitments.`;owner='Customer Operations';}
 else if(/ORIGIN_COUNTRY|ORIGIN_ISO|COUNTRY/.test(dim)){title=`Assess trade exposure to ${name}`;action=`Review the highest-value India trade flows linked to ${name}, identify concentrated commodity and transport dependencies, and prepare mitigation where weather or concentration risk is elevated.`;owner='Trade Risk Lead';}
 else if(/CHAPTER|HEADING|HS4|COMMODITY/.test(dim)){title=`Diversify ${name} exposure`;action=`Review the largest country and transport dependencies for ${name}, identify alternative sourcing corridors and prioritize high-value flows with elevated external risk.`;owner='Category Strategy';}
 else if(/WEATHER/.test(dim)){title=`Mitigate weather-linked trade risk`;action=`Prioritize trade flows with elevated weather risk, validate the exposed countries and commodities, and assign contingency actions for the highest-value dependencies.`;owner='Logistics Risk Lead';}
 else if(/ORDER/.test(dim)){title=`Recover ${name}`;action=`Trace the shortage path for ${name}, confirm the fastest feasible recovery source and assign execution ownership for the due-date risk.`;owner='Supply Planning';}
 return {title,action,owner,summary:`${name}${value?` is the leading exposure at ${value}`:''}.`,expectedImpact:'Reduce modeled exposure and protect customer commitments'};
}
function analystFilters(result,id){const m=analystModel(result);const dims=m.dimensions.filter(c=>new Set(m.rows.map(r=>String(r[c]??''))).size>1).slice(0,3);if(!dims.length)return '';return `<div class="analyst-filters" data-result-id="${id}">${dims.map(c=>{const vals=[...new Set(m.rows.map(r=>String(r[c]??'')).filter(Boolean))].sort();return `<label>${e(analystLabel(c))}<select data-analyst-filter="${e(c)}"><option value="">All</option>${vals.map(v=>`<option>${e(v)}</option>`).join('')}</select></label>`}).join('')}</div>`;}
function analystTable(result,id){const m=analystModel(result);if(!m.rows.length)return '';return `<div class="analyst-table-wrap"><table class="analyst-table" data-analyst-table="${id}"><thead><tr>${m.columns.map(c=>`<th>${e(analystLabel(c))}</th>`).join('')}</tr></thead><tbody>${m.rows.slice(0,50).map(r=>`<tr>${m.columns.map(c=>`<td data-col="${e(c)}" data-raw="${e(r[c]??'')}">${analystFormat(c,r[c])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;}
function analystChart(result,id,question=''){const m=analystModel(result);if(!m.metric||!m.dimension)return '';const asc=/\b(lowest|minimum|min\.?|smallest|least|bottom)\b/i.test(String(question));const items=m.rows.map(r=>({label:String(r[m.dimension]??''),value:analystNumber(r[m.metric]),scenario:m.dimensions.includes('SCENARIO')?String(r.SCENARIO??''):''})).filter(x=>x.label&&x.value!==null).sort((a,b)=>asc?a.value-b.value:b.value-a.value).slice(0,10);if(items.length<2)return '';const max=Math.max(...items.map(x=>Math.abs(x.value)),1);return `<section class="analyst-viz" data-analyst-chart="${id}"><div class="viz-head"><div><span class="eyebrow">DYNAMIC VISUALIZATION</span><strong>${e(analystLabel(m.metric))} by ${e(analystLabel(m.dimension))}</strong></div><span>${items.length} shown</span></div><div class="bar-chart">${items.map(x=>`<div class="bar-row" data-chart-label="${e(analystCommodityLabel(x.label))}"><span title="${e(analystCommodityLabel(x.label))}">${e(analystCommodityLabel(x.label))}</span><div class="bar-track"><i style="width:${Math.max(2,Math.abs(x.value)/max*100).toFixed(1)}%"></i></div><b>${analystFormat(m.metric,x.value)}</b></div>`).join('')}</div></section>`;}
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
let analystStorageIdentity='';
function analystWorkspaceIdentity(session=window.__ONTOTRAIL_SESSION||{}){return String(session.email||`${session.tenant||'workspace'}:${session.role||'user'}`).toLowerCase().replace(/[^a-z0-9_-]+/g,'_');}
function analystWorkspaceKey(identity=analystStorageIdentity||analystWorkspaceIdentity()){return `ontotrail_analyst_workspace_v3_${identity}`;}
function previousAnalystWorkspaceKey(identity=analystStorageIdentity||analystWorkspaceIdentity()){return `ontotrail_analyst_workspace_v2_${identity}`;}
function legacyAnalystWorkspaceKey(identity=analystStorageIdentity||analystWorkspaceIdentity()){return `ontotrail_analyst_workspace_v1_${identity}`;}
const AUTO_ANALYST_PROJECTS=Object.freeze({
 overview:{key:'control-tower',name:'Control Tower'},
 operations:{key:'nova-operations',name:'Nova operations'},
 orders:{key:'marketplace-intel',name:'Marketplace intel'},
 network:{key:'trade-network',name:'Trade network'},
 scenarios:{key:'scenario-lab',name:'Scenario lab'},
 evidence:{key:'data-sources',name:'Data sources'},
 governance:{key:'metric-governance',name:'Metric governance'}
});
function analystProjectForView(sourceView){
 const spec=AUTO_ANALYST_PROJECTS[sourceView];if(!spec)return null;
 let project=analystWorkspace.projects.find(p=>p.systemKey===spec.key);
 if(!project){
  project=analystWorkspace.projects.find(p=>String(p.name||'').trim().toLowerCase()===spec.name.toLowerCase());
  if(project)project.systemKey=spec.key;
 }
 if(!project){
  project={id:crypto.randomUUID(),name:spec.name,systemKey:spec.key,auto:true,createdAt:new Date().toISOString()};
  analystWorkspace.projects.push(project);
 }
 return project;
}
function ensureAnalystContextForView(sourceView){
 const project=analystProjectForView(sourceView);if(!project)return null;
 persistAnalystThread();
 let thread=analystWorkspace.threads
  .filter(t=>t.projectId===project.id)
  .sort((a,b)=>new Date(b.updatedAt||b.createdAt||0)-new Date(a.updatedAt||a.createdAt||0))[0];
 if(!thread){
  thread=blankAnalystThread(project.id);
  analystWorkspace.threads.unshift(thread);
 }
 analystWorkspace.activeThreadId=thread.id;
 saveAnalystWorkspace();
 return project;
}
function openAnalystForView(sourceView){
 if(sourceView&&sourceView!=='analyst')ensureAnalystContextForView(sourceView);
 navigate('analyst');
}
function renameAnalystThread(id){
 const thread=analystWorkspace.threads.find(t=>t.id===id);if(!thread)return;
 const next=window.prompt('Rename chat',thread.title||'New chat');if(next===null)return;
 const clean=String(next).trim();if(!clean)return;
 thread.title=clean.slice(0,80);thread.updatedAt=new Date().toISOString();saveAnalystWorkspace();render();
}
function deleteAnalystThread(id){
 const thread=analystWorkspace.threads.find(t=>t.id===id);if(!thread)return;
 if(!window.confirm(`Delete chat “${thread.title||'New chat'}”? This cannot be undone.`))return;
 analystWorkspace.threads=analystWorkspace.threads.filter(t=>t.id!==id);
 if(!analystWorkspace.threads.length)analystWorkspace.threads=[blankAnalystThread()];
 if(analystWorkspace.activeThreadId===id)analystWorkspace.activeThreadId=analystWorkspace.threads[0].id;
 saveAnalystWorkspace();chatCount=0;render();toast('Chat deleted.');
}
function renameAnalystProject(id){
 const project=analystWorkspace.projects.find(p=>p.id===id);if(!project)return;
 const next=window.prompt('Rename project',project.name||'Project');if(next===null)return;
 const clean=String(next).trim();if(!clean)return;
 project.name=clean.slice(0,60);saveAnalystWorkspace();render();
}
function deleteAnalystProject(id){
 const project=analystWorkspace.projects.find(p=>p.id===id);if(!project)return;
 const count=analystWorkspace.threads.filter(t=>t.projectId===id).length;
 if(!window.confirm(`Delete project “${project.name}” and ${count} chat${count===1?'':'s'}? This cannot be undone.`))return;
 const removedIds=new Set(analystWorkspace.threads.filter(t=>t.projectId===id).map(t=>t.id));
 analystWorkspace.projects=analystWorkspace.projects.filter(p=>p.id!==id);
 analystWorkspace.threads=analystWorkspace.threads.filter(t=>t.projectId!==id);
 if(!analystWorkspace.threads.length)analystWorkspace.threads=[blankAnalystThread()];
 if(removedIds.has(analystWorkspace.activeThreadId))analystWorkspace.activeThreadId=analystWorkspace.threads[0].id;
 saveAnalystWorkspace();chatCount=0;render();toast('Project deleted.');
}

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
 const nextIdentity=analystWorkspaceIdentity();
 analystStorageIdentity=nextIdentity;
 try{
  storage.removeItem?.(legacyAnalystWorkspaceKey(nextIdentity));
  const currentRaw=storage.getItem(analystWorkspaceKey(nextIdentity));
  if(currentRaw){
   analystWorkspace=normalizeAnalystWorkspace(JSON.parse(currentRaw));
   return;
  }

  // One-time chat reset for the v3 workspace. Preserve project shells, discard all prior chat threads.
  let projects=[];
  const previousRaw=storage.getItem(previousAnalystWorkspaceKey(nextIdentity));
  if(previousRaw){
   try{
    const previous=JSON.parse(previousRaw);
    if(Array.isArray(previous?.projects))projects=previous.projects;
   }catch{}
  }
  storage.removeItem?.(previousAnalystWorkspaceKey(nextIdentity));
  analystWorkspace=normalizeAnalystWorkspace({projects,threads:[],activeThreadId:''});
  saveAnalystWorkspace();
 }catch{analystWorkspace=normalizeAnalystWorkspace(null);}
}
function saveAnalystWorkspace(){
 try{storage.setItem(analystWorkspaceKey(),JSON.stringify(analystWorkspace));return true;}
 catch{
  try{
   const activeId=analystWorkspace.activeThreadId;
   const threads=[...analystWorkspace.threads].sort((a,b)=>new Date(b.updatedAt||b.createdAt||0)-new Date(a.updatedAt||a.createdAt||0)).slice(0,24);
   const reduced={...analystWorkspace,threads:threads.map(t=>t.id===activeId?t:{...t,html:''})};
   storage.setItem(analystWorkspaceKey(),JSON.stringify(reduced));analystWorkspace=reduced;return true;
  }catch{return false;}
 }
}
function activeAnalystThread(){return analystWorkspace.threads.find(t=>t.id===analystWorkspace.activeThreadId)||analystWorkspace.threads[0];}
function compactAnalystLogHtml(log){
 const copy=log.cloneNode(true);
 const pairs=[...copy.querySelectorAll('.chat-pair')];
 while(pairs.length>16)pairs.shift()?.remove();
 copy.querySelectorAll('.analyst-table tbody').forEach(body=>[...body.rows].slice(12).forEach(row=>row.remove()));
 copy.querySelectorAll('.analyst-progress').forEach(node=>node.remove());
 copy.querySelectorAll('.analyst-reveal').forEach(node=>{node.hidden=false;});
 return copy.innerHTML;
}
function encodeDecisionSeed(seed){try{return encodeURIComponent(JSON.stringify(seed||{}));}catch{return '';}}
function decodeDecisionSeed(value){try{const seed=JSON.parse(decodeURIComponent(String(value||'')));return seed&&typeof seed==='object'?seed:null;}catch{return null;}}
function encodeAnalystPayload(value){try{return encodeURIComponent(JSON.stringify(value||{}));}catch{return '';}}
function decodeAnalystPayload(value){try{const out=JSON.parse(decodeURIComponent(String(value||'')));return out&&typeof out==='object'?out:null;}catch{return null;}}
function analystGroundingPanel(a){
 const result=a?.result||{columns:[],rows:[]};const m=analystModel(result);const hasRows=Boolean(m.rows.length);const hasSql=Boolean(a?.sql);
 const status=hasRows&&hasSql?'Fully grounded':hasRows?'Grounded result':'Data limitation';
 const metrics=m.numeric.slice(0,6).map(analystLabel);const dimensions=m.dimensions.slice(0,6).map(analystLabel);
 const intents=(a?.intents||[]).map(x=>String(x).replaceAll('_',' '));
 const cross=(a?.intents||[]).includes('cross_domain');
 return `<details class="grounding-panel"><summary><span><strong>${e(status)}</strong><small>${m.rows.length} governed row${m.rows.length===1?'':'s'} · ${e(a?.semanticDomain||'governed semantic layer')}</small></span><span class="grounding-toggle">Why this answer?</span></summary><div class="grounding-grid"><div><span>Semantic view</span><strong>${e(a?.semanticView||'—')}</strong></div><div><span>Intent${intents.length===1?'':'s'}</span><strong>${e(intents.join(' · ')||'General analysis')}</strong></div><div><span>Metrics used</span><strong>${e(metrics.join(', ')||'Derived by Cortex')}</strong></div><div><span>Dimensions used</span><strong>${e(dimensions.join(', ')||'Aggregate result')}</strong></div></div>${cross?'<p class="grounding-note">Cross-domain answer: Nova Mobility operational evidence is connected to external Marketplace trade/weather context. The two evidence types remain explicitly separated.</p>':''}<p class="grounding-note">The generated SQL remains available in the audit trail below. OntoTrail does not infer facts outside the governed result set.</p></details>`;
}
function firstResultValue(result,patterns){
 const cols=result?.columns||[];const col=cols.find(c=>patterns.some(p=>p.test(String(c).toUpperCase())));if(!col)return '';return String(result?.rows?.find(r=>r[col]!==null&&r[col]!==undefined&&String(r[col]).trim())?.[col]||'').trim();
}
function buildInvestigateQuestion(question,a){
 const result=a?.result||{columns:[],rows:[]};const nova=a?.semanticDomain==='nova-operations';
 const supplier=firstResultValue(result,[/SUPPLIER_NAME/,/VENDOR_NAME/]);
 const material=firstResultValue(result,[/MATERIAL_NAME/,/COMPONENT/,/PART_NAME/]);
 const origin=firstResultValue(result,[/ORIGIN_COUNTRY/,/^COUNTRY$/]);
 const plant=firstResultValue(result,[/PLANT_NAME/]);
 if(nova){
  if(supplier)return `For ${supplier}, trace the exposed materials, purchase orders, plants and inventory cover, then explain the linked origin-country trade dependency and current weather context where available.`;
  if(material)return `For ${material}, trace the supplying vendors, affected purchase orders and plants, then connect the exposure to origin-country transport dependency and weather context where available.`;
  if(plant)return `For ${plant}, identify the suppliers and materials driving operational risk, then connect those exposures to external country, transport and weather signals.`;
  return 'Connect the highest Nova Mobility operational exposures in this result to their origin-country trade dependency, transport context and weather signals. Show the supplier, material, PO and plant paths that matter most.';
 }
 if(origin)return `For ${origin}, trace the highest-value commodity and transport dependencies, then identify any Nova Mobility suppliers, materials, purchase orders or plants linked to that origin and explain the operational exposure.`;
 return `Investigate the leading external exposure in this result and connect it to Nova Mobility suppliers, materials, purchase orders and plants where a Marketplace match exists. Keep external trade/weather context separate from internal operational evidence.`;
}
function buildDecisionSeedFromEvidence(question,a,narrative,rec=null){
 const result=a?.result||{columns:[],rows:[]};
 const nova=a?.semanticDomain==='nova-operations';
 const supplier=firstResultValue(result,[/SUPPLIER_NAME/,/VENDOR_NAME/]);
 const material=firstResultValue(result,[/MATERIAL_NAME/,/COMPONENT/,/PART_NAME/]);
 const origin=firstResultValue(result,[/ORIGIN_COUNTRY/,/^COUNTRY$/]);
 const plant=firstResultValue(result,[/PLANT_NAME/]);
 const scratch=document.createElement('div');scratch.innerHTML=narrative||'';
 const problem=(scratch.textContent||'').trim().slice(0,700);
 if(rec){
  return {title:rec.title,problem,action:rec.action,owner:rec.owner,priority:'High',status:'Proposed',expectedImpact:rec.expectedImpact,source:'OntoTrail governed analysis'};
 }
 let subject=material||supplier||plant||origin||(nova?'Nova operational exposure':'trade exposure');
 let title=nova?`Review ${subject} continuity exposure`:`Review ${subject} risk exposure`;
 let action=nova
  ? 'Validate the current exposure, confirm whether mitigation is required, and assign the appropriate operational action using the latest supplier, PO, inventory and shipment evidence.'
  : 'Validate the governed exposure, confirm whether mitigation is required, and assign the appropriate sourcing, routing or monitoring action using the latest trade and external-risk evidence.';
 let owner=nova?'Supply Planning':'Trade Risk Lead';
 return {title,problem,action,owner,priority:'High',status:'Proposed',expectedImpact:'Convert the governed finding into an owned, traceable decision and follow-up action.',source:'OntoTrail governed analysis'};
}
function buildScenarioSeed(question,a,narrative){
 const result=a?.result||{columns:[],rows:[]};const nova=a?.semanticDomain==='nova-operations';
 const supplier=firstResultValue(result,[/SUPPLIER_NAME/,/VENDOR_NAME/]);
 const origin=firstResultValue(result,[/ORIGIN_COUNTRY/,/^COUNTRY$/]);
 const material=firstResultValue(result,[/MATERIAL_NAME/,/COMPONENT/,/PART_NAME/]);
 let title='AI-generated disruption scenario',assumption='Apply a transparent stress assumption to the leading exposure and compare the resulting risk before taking action.',scenarioQuestion='';
 if(nova&&supplier){title=`7-day delay stress · ${supplier}`;assumption=`Assume a 7-day delay to open supply from ${supplier}; evaluate affected materials, purchase orders, plants and inventory cover.`;scenarioQuestion=`Assume ${supplier} is delayed by 7 days. Which Nova Mobility materials, purchase orders and plants are most exposed, how does inventory cover change the priority, and what external origin-country weather or transport context should be monitored?`;}
 else if(nova&&material){title=`Material continuity stress · ${material}`;assumption=`Stress inbound availability for ${material} and prioritize low-cover, high-value operational exposure.`;scenarioQuestion=`Stress inbound availability for ${material}. Which suppliers, purchase orders and plants are most exposed, and what mitigation options should be evaluated using the current inventory and external Marketplace context?`;}
 else if(/sea|maritime|ocean/i.test(question)){title='15% sea-capacity stress';assumption='Apply a 15% stress to sea-linked exposure while keeping the governed baseline unchanged.';scenarioQuestion='If sea-linked exposure in this result faced a 15% capacity stress, which origins and commodities would contribute the largest exposure envelope, and what alternate sourcing or routing options should be evaluated?';}
 else if(/weather/i.test(question)){title='Weather escalation stress';assumption='Prioritize covered exposure currently linked to elevated weather signals; do not infer risk for uncovered geographies.';scenarioQuestion='Escalate the currently covered medium/high weather-risk exposure in this result. Which origins, commodities and transport dependencies should be prioritized, and what operational mitigations should be evaluated?';}
 else if(origin){title=`10% origin disruption · ${origin}`;assumption=`Apply a 10% disruption envelope to the governed exposure linked to ${origin} before substitution.`;scenarioQuestion=`For ${origin}, analyze a 10% disruption to the governed exposure in this result. Which commodities and transport dependencies drive the impact, and what mitigation options should be evaluated?`;}
 else{scenarioQuestion=`Create a transparent stress test from this governed finding: ${String(question).slice(0,220)}. Identify the exposure driver, define a simple disruption assumption, quantify the affected governed metrics, and list mitigation options without presenting the scenario as a forecast.`;}
 const scratch=document.createElement('div');scratch.innerHTML=narrative||'';const summary=(scratch.textContent||'').trim().slice(0,420);
 return {title,assumption,question:scenarioQuestion,summary,sourceQuestion:question,domain:nova?'Nova Mobility operations':'Marketplace trade risk',createdAt:new Date().toISOString()};
}
function openScenarioFromPayload(value){
 const seed=decodeAnalystPayload(value);if(!seed)return toast('Scenario context could not be restored.');
 ui.aiScenario=seed;navigate('scenarios');toast('AI scenario seed added to Scenario Lab.');
}
function decisionBriefDialog(payload){
 const data=decodeAnalystPayload(payload)||payload;if(!data)return;
 const seed=data.seed||data;const meta=data.meta||{};
 openDetail(`<div class="dialog-head"><div><span class="eyebrow">AI DECISION BRIEF</span><h2 id="detail-title">${e(seed.title||'Decision brief')}</h2><p>Governed evidence → implication → owned mitigation.</p></div><button class="icon-button" data-close="detail-dialog" aria-label="Close">${icon('close')}</button></div><div class="detail-body decision-brief-dialog"><section><span class="eyebrow">EVIDENCE</span><p>${e(seed.problem||'Governed analytical evidence from the current answer.')}</p></section><section><span class="eyebrow">RECOMMENDED ACTION</span><h3>${e(seed.action||'Review the evidence and assign a mitigation action.')}</h3><p><strong>Suggested owner:</strong> ${e(seed.owner||'Trade Risk Lead')} · <strong>Priority:</strong> ${e(seed.priority||'High')}</p></section><section><span class="eyebrow">GROUNDING</span><p>${e(meta.semanticView||'Governed semantic view')} · ${e((meta.intents||[]).join(' · ')||'governed analysis')} · ${Number(meta.rows||0)} result rows</p></section><div class="form-actions"><button class="secondary" data-close="detail-dialog">Close</button><button class="primary" data-decision-brief-create="${e(encodeDecisionSeed(seed))}">${icon('check')}Create decision</button></div></div>`);
}

function restoreDecisionInsightButtons(root){
 root.querySelectorAll('[data-decision-insight]').forEach(btn=>{
  const seed=decodeDecisionSeed(btn.dataset.decisionSeed);
  if(seed){decisionInsights.set(btn.dataset.decisionInsight,seed);btn.disabled=false;btn.title='Create a decision from this saved insight.';}
  else{btn.disabled=true;btn.title='Re-run this question to create a new decision from the latest evidence.';}
 });
}
function persistAnalystThreadFromLog(thread,log){
 if(!log||!thread)return;
 try{
  const pairs=[...log.querySelectorAll('.chat-pair')];
  while(pairs.length>16){pairs.shift()?.remove();}
  thread.html=compactAnalystLogHtml(log);
  thread.updatedAt=new Date().toISOString();
  saveAnalystWorkspace();
 }catch{}
}
function persistAnalystThread(){
 const log=$('#analyst-chat-log'),thread=activeAnalystThread();
 persistAnalystThreadFromLog(thread,log);
}
function restoreAnalystThread(){
 if(view!=='analyst')return;const log=$('#analyst-chat-log'),thread=activeAnalystThread();if(!log||!thread)return;
 if(thread.html){log.innerHTML=thread.html;chatCount=log.querySelectorAll('.chat-pair').length;log.querySelectorAll('.chat-pair').forEach(ensureChatActions);restoreDecisionInsightButtons(log);if(chatCount)log.scrollTop=log.scrollHeight;}else chatCount=0;
}
function newAnalystChat(projectId=''){
 persistAnalystThread();const thread=blankAnalystThread(projectId);analystWorkspace.threads.unshift(thread);analystWorkspace.activeThreadId=thread.id;saveAnalystWorkspace();chatCount=0;render();requestAnimationFrame(()=>$('#analyst-question')?.focus());
}
function selectAnalystThread(id){if(!analystWorkspace.threads.some(t=>t.id===id))return;persistAnalystThread();analystWorkspace.activeThreadId=id;saveAnalystWorkspace();chatCount=0;render();}
function projectDialog(){
 openDetail(`<div class="dialog-head"><div><span class="eyebrow">AI ANALYST</span><h2 id="detail-title">Create project</h2><p>Group related chat threads into one working space.</p></div><button class="icon-button" data-close="detail-dialog" aria-label="Close">×</button></div><form id="project-form" class="detail-body"><label class="field-label">Project name<input class="text-input" name="name" required maxlength="60" placeholder="e.g. Australia weather-risk review" autofocus></label><div class="form-actions"><button type="button" class="secondary" data-close="detail-dialog">Cancel</button><button class="primary">Create project</button></div></form>`);
}
function createAnalystProject(name){const clean=String(name||'').trim();if(!clean)return;const p={id:crypto.randomUUID(),name:clean,createdAt:new Date().toISOString()};analystWorkspace.projects.push(p);const t=blankAnalystThread(p.id);analystWorkspace.threads.unshift(t);analystWorkspace.activeThreadId=t.id;saveAnalystWorkspace();closeDialog('detail-dialog');chatCount=0;navigate('analyst');}
function clearAnalystHistory(){const thread=activeAnalystThread();if(!thread)return;thread.html='';thread.title='New chat';thread.updatedAt=new Date().toISOString();saveAnalystWorkspace();chatCount=0;if(view==='analyst'){render();toast('Current chat cleared.');}}

function userQuestionInner(question){
 return `<p class="user-question"><span class="user-question-text">${e(question)}</span></p><div class="chat-message-actions user-message-actions"><button class="chat-action" type="button" data-chat-copy-prompt aria-label="Copy prompt" title="Copy prompt">Copy</button><button class="chat-action" type="button" data-chat-share-prompt aria-label="Share prompt" title="Share prompt">Share</button><button class="chat-action" type="button" data-chat-edit aria-label="Edit message" title="Edit message">Edit</button></div>`;
}
function ensureChatActions(pair){
 if(!pair)return;
 let q=pair.querySelector('.user-question');
 if(q&&!pair.querySelector('.user-question-wrap')){
  const wrap=document.createElement('div');wrap.className='user-question-wrap';q.before(wrap);wrap.append(q);
  if(!q.querySelector('.user-question-text')){const span=document.createElement('span');span.className='user-question-text';span.textContent=q.textContent||'';q.replaceChildren(span);}
  const actions=document.createElement('div');actions.className='chat-message-actions user-message-actions';actions.innerHTML='<button class="chat-action" type="button" data-chat-copy-prompt aria-label="Copy prompt" title="Copy prompt">Copy</button><button class="chat-action" type="button" data-chat-share-prompt aria-label="Share prompt" title="Share prompt">Share</button><button class="chat-action" type="button" data-chat-edit aria-label="Edit message" title="Edit message">Edit</button>';wrap.append(actions);
 }
 const answer=pair.querySelector('.assistant-answer');
 if(answer&&!answer.querySelector('.assistant-response-actions')){
  const actions=document.createElement('div');actions.className='assistant-response-actions';
  actions.innerHTML='<button class="chat-action" type="button" data-chat-copy aria-label="Copy response" title="Copy response">Copy</button><button class="chat-action" type="button" data-chat-retry aria-label="Try again" title="Try again">Try again</button>';
  answer.append(actions);
 }
}
function chatPairQuestion(pair){
 return String(pair?.querySelector('.user-question-text')?.textContent||pair?.querySelector('.user-question')?.textContent||'').trim();
}
async function writeClipboard(text){
 const value=String(text||'').trim();if(!value)return false;
 try{
  if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(value);return true;}
  const ta=document.createElement('textarea');ta.value=value;ta.style.position='fixed';ta.style.opacity='0';document.body.append(ta);ta.select();const ok=document.execCommand('copy');ta.remove();return ok;
 }catch{return false;}
}
async function copyChatPrompt(pair){
 const question=chatPairQuestion(pair);if(!question)return;
 const ok=await writeClipboard(question);toast(ok?'Prompt copied.':'Could not copy the prompt.');
}
async function shareChatPrompt(pair){
 const question=chatPairQuestion(pair);if(!question)return;
 try{
  if(navigator.share){
   await navigator.share({title:'OntoTrail prompt',text:question});
   toast('Prompt shared.');
   return;
  }
 }catch(err){
  if(err?.name==='AbortError')return;
 }
 const ok=await writeClipboard(question);
 toast(ok?'Sharing is not available here, so the prompt was copied instead.':'Could not share the prompt.');
}
function beginChatEdit(pair){
 if(!pair)return;const question=chatPairQuestion(pair);const wrap=pair.querySelector('.user-question-wrap');
 if(!wrap||!question)return;pair.dataset.editOriginal=question;
 wrap.innerHTML=`<form class="chat-edit-form"><label class="sr-only">Edit message</label><input class="text-input chat-edit-input" name="message" maxlength="500" value="${e(question)}" required><div class="chat-edit-actions"><button class="secondary small" type="button" data-chat-edit-cancel>Cancel</button><button class="primary small" type="submit">Save & submit</button></div></form>`;
 requestAnimationFrame(()=>{const input=wrap.querySelector('.chat-edit-input');input?.focus();input?.setSelectionRange(input.value.length,input.value.length);});
}
function cancelChatEdit(pair){
 if(!pair)return;const wrap=pair.querySelector('.user-question-wrap');const question=pair.dataset.editOriginal||chatPairQuestion(pair);
 if(wrap)wrap.innerHTML=userQuestionInner(question);delete pair.dataset.editOriginal;
}
function truncateConversationFrom(pair){
 if(!pair)return;
 let node=pair;
 while(node){const next=node.nextElementSibling;node.remove();node=next;}
 const log=$('#analyst-chat-log');chatCount=log?log.querySelectorAll('.chat-pair').length:0;persistAnalystThread();
}
async function copyChatResponse(pair){
 if(!pair)return;const answer=pair.querySelector('.assistant-answer');if(!answer)return;
 const chunks=[...answer.querySelectorAll('.direct-answer,.recommendation-card')].map(el=>el.innerText.trim()).filter(Boolean);
 const text=(chunks.length?chunks.join('\n\n'):answer.innerText.replace(/\b(Copy|Try again)\b/g,'').trim()).trim();
 if(!text)return;
 try{
  if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(text);
  else{const ta=document.createElement('textarea');ta.value=text;ta.style.position='fixed';ta.style.opacity='0';document.body.append(ta);ta.select();document.execCommand('copy');ta.remove();}
  toast('Response copied.');
 }catch{toast('Could not copy the response.');}
}
function retryChat(pair){
 const question=chatPairQuestion(pair);if(!question)return;truncateConversationFrom(pair);void ask(question);
}
function analystFollowupContext(block){
 const prev=block?.previousElementSibling;
 if(!prev?.classList?.contains('chat-pair'))return null;
 const previousQuestion=chatPairQuestion(prev).slice(0,500);
 const answer=prev.querySelector('.direct-answer')?.innerText?.trim()||'';
 const grounding=prev.querySelector('.assistant-answer small')?.innerText?.trim()||'';
 let previousResult=null;
 try{previousResult=prev.dataset.analystContext?JSON.parse(decodeURIComponent(prev.dataset.analystContext)):null;}catch{}
 if(!previousQuestion&&!answer&&!previousResult)return null;
 return {
  previousQuestion,
  previousAnswer:answer.slice(0,1200),
  previousGrounding:grounding.slice(0,320),
  previousResult
 };
}
async function ask(q){
 const question=q.trim();if(!question)return;if(view!=='analyst')navigate('analyst');const chat=analystUI();const requestThread=activeAnalystThread();if(!chatCount){chat.log?.replaceChildren();if(requestThread&&requestThread.title==='New chat'){requestThread.title=question.length>52?`${question.slice(0,49)}…`:question;saveAnalystWorkspace();}}
 const {analysisQuestion,wantsRecommendation}=splitCompoundQuestion(question);
 const block=document.createElement('article');block.className='chat-pair';block.innerHTML=`<div class="user-question-wrap">${userQuestionInner(question)}</div><div class="assistant-answer">${analystProgressMarkup()}</div>`;chat.log?.append(block);chatCount++;persistAnalystThreadFromLog(requestThread,chat.log);if(chat.input){chat.input.value='';chat.input.disabled=true;}const askButton=chat.form?.querySelector('button[type="submit"]');if(askButton)askButton.disabled=true;if(chat.log)chat.log.scrollTop=chat.log.scrollHeight;
 try{
  const answerEl=block.querySelector('.assistant-answer');
  const governedQuestion=analysisQuestion;
  await wait(220);setAnalystProgress(answerEl,'Mapping your question to governed business terms…',1);
  const progressTimer1=setTimeout(()=>setAnalystProgress(answerEl,'Querying Snowflake Cortex Analyst…',2),650);
  const progressTimer2=setTimeout(()=>setAnalystProgress(answerEl,'Preparing the governed answer…',3),1500);
  const followupContext=analystFollowupContext(block);
  const a=await askAnalyst(governedQuestion,followupContext);
  try{
    const compactContext={
      semanticDomain:a.semanticDomain||'',
      semanticView:a.semanticView||'',
      intents:(a.intents||[]).slice(0,8),
      queryPlan:a.queryPlan||null,
      result:a.result?{columns:(a.result.columns||[]).slice(0,16),rows:(a.result.rows||[]).slice(0,12)}:null
    };
    block.dataset.analystContext=encodeURIComponent(JSON.stringify(compactContext));
  }catch{}
  clearTimeout(progressTimer1);clearTimeout(progressTimer2);setAnalystProgress(answerEl,'Preparing the governed answer…',3);const rid=`analyst-${Date.now()}`;const hasRows=Boolean(a.result?.rows?.length);const resultHtml=hasRows?`${analystFilters(a.result,rid)}${analystChart(a.result,rid,question)}${analystTable(a.result,rid)}`:'';
  const sql=a.sql?`<details class="analyst-sql"><summary>Audit trail · View generated SQL</summary><pre>${e(a.sql)}</pre></details>`:'';
  const warning=(a.executionWarning||a.fallbackUsed)?`<p class="analyst-warning">${e(a.executionWarning||'OntoTrail broadened the first zero-row cross-domain query so missing direct mappings can be distinguished from a true data failure.')}</p>`:'';
  const suggestions=a.suggestions?.length?`<div class="analyst-suggestions"><span>Explore next</span>${a.suggestions.map(s=>`<button type="button" data-question="${e(s)}">${e(s)}</button>`).join('')}</div>`:'';
  const narrative=analystNarrative(question,a.result||{columns:[],rows:[]},a.text||'',a);
  const decisionSeed=hasRows?buildDecisionSeedFromEvidence(question,a,narrative,null):null;
  if(decisionSeed)decisionInsights.set(rid,decisionSeed);
  const recHtml='';
  const investigateQuestion=buildInvestigateQuestion(question,a);
  const scenarioSeed=buildScenarioSeed(question,a,narrative);
  const decisionBrief=decisionSeed?encodeAnalystPayload({seed:decisionSeed,meta:{semanticView:a.semanticView,intents:a.intents||[],rows:a.result?.rows?.length||0}}):'';
  const workflowActions=hasRows?`<div class="analyst-workflow-actions"><button class="secondary small" data-investigate-question="${e(investigateQuestion)}">${icon('network')}Investigate further</button><button class="secondary small" data-ai-scenario="${e(encodeAnalystPayload(scenarioSeed))}">${icon('sliders')}Create scenario</button><button class="secondary small" data-decision-brief="${e(decisionBrief)}">${icon('file')}Generate decision brief</button><button class="primary small" data-decision-insight="${e(rid)}" data-decision-seed="${e(encodeDecisionSeed(decisionSeed))}">${icon('check')}Create decision</button></div>`:'';
  const grounding=a.needsContext?'':analystGroundingPanel(a);
  const interpretation=analysisQuestion!==question?`<p class="query-split-note">Cortex Analyst answered the analytical part of your request. Workflow actions below are separate from the AI response.</p>`:'';
  answerEl.innerHTML=`<div class="answer-heading">${icon('chat')}<strong>OntoTrail Intelligence</strong><span class="live-pill">LIVE · SNOWFLAKE CORTEX</span></div><p class="direct-answer" data-stream-text></p><div class="analyst-reveal" hidden>${interpretation}${recHtml}${workflowActions}${grounding}${resultHtml}${warning}${sql}${suggestions}<small>${a.needsContext?'Conversation context required':`Grounded in ${e(a.semanticView||'Snowflake governed semantic views')} · Request ${e(a.requestId||'Snowflake')}`}</small></div><div class="assistant-response-actions"><button class="chat-action" type="button" data-chat-copy aria-label="Copy response" title="Copy response">Copy</button><button class="chat-action" type="button" data-chat-retry aria-label="Try again" title="Try again">Try again</button></div>`;
  await revealNarrative(answerEl,narrative);
  const reveal=answerEl.querySelector('.analyst-reveal');if(reveal){reveal.hidden=false;requestAnimationFrame(()=>reveal.classList.add('visible'));}
 }catch(err){
  block.querySelector('.assistant-answer').innerHTML=`<div class="answer-heading">${icon('chat')}<strong>OntoTrail Intelligence</strong></div><p class="direct-answer">Snowflake Cortex Analyst could not complete this request.</p><small>${e(err.message||'connection error')}</small><div class="assistant-response-actions"><button class="chat-action" type="button" data-chat-retry aria-label="Try again" title="Try again">Try again</button></div>`;
 }finally{persistAnalystThreadFromLog(requestThread,chat.log);const current=analystUI();if(current.input){current.input.disabled=false;current.input.focus();}const btn=current.form?.querySelector('button[type="submit"]');if(btn)btn.disabled=false;if(current.log)current.log.scrollTop=current.log.scrollHeight;}
}
function decisionDialog(seed={}){
 const today=new Date().toISOString().slice(0,10);const due=seed.due||today;
 openDetail(`<div class="dialog-head"><div><span class="eyebrow">DECISION WORKFLOW</span><h2 id="detail-title">Create decision</h2><p>Turn governed trade-risk evidence into an owned mitigation action.</p></div><button class="icon-button" data-close="detail-dialog" aria-label="Close">${icon('close')}</button></div><form id="decision-form" class="detail-body decision-form"><section class="decision-form-section"><h3>Decision</h3><label class="field-label">Decision title<input class="text-input" name="title" required maxlength="120" value="${e(seed.title||'')}"></label><label class="field-label">Evidence / risk statement<textarea class="text-input decision-textarea" name="problem" required maxlength="700">${e(seed.problem||'')}</textarea></label><label class="field-label">Mitigation action<textarea class="text-input decision-textarea" name="action" required maxlength="700">${e(seed.action||'')}</textarea></label></section><section class="decision-form-section"><h3>Ownership & execution</h3><div class="decision-form-grid"><label class="field-label">Owner<input class="text-input" name="owner" required maxlength="80" value="${e(seed.owner||'Trade Risk Lead')}"></label><label class="field-label">Owner email<input class="text-input" name="ownerEmail" type="email" required maxlength="254" value="${e(seed.ownerEmail||'jury@cococli.demo')}" placeholder="owner@company.com"></label><label class="field-label">Due date<input class="text-input" name="due" type="date" required value="${e(due)}"></label><label class="field-label">Priority<select class="text-input" name="priority"><option>High</option><option ${seed.priority==='Medium'?'selected':''}>Medium</option><option ${seed.priority==='Low'?'selected':''}>Low</option></select></label><label class="field-label">Status<select class="text-input" name="status"><option>Proposed</option><option ${seed.status==='Assigned'?'selected':''}>Assigned</option><option ${seed.status==='In progress'?'selected':''}>In progress</option><option ${seed.status==='Waiting for input'?'selected':''}>Waiting for input</option><option ${seed.status==='Completed'?'selected':''}>Completed</option><option ${seed.status==='Closed'?'selected':''}>Closed</option></select></label><label class="field-label">Initial note<input class="text-input" name="note" maxlength="180" value="${e(seed.note||'')}"></label></div><label class="field-label">Expected outcome / success measure<input class="text-input" name="expectedImpact" maxlength="180" value="${e(seed.expectedImpact||'')}"></label></section><input type="hidden" name="source" value="${e(seed.source||'Manual decision')}"><div class="form-actions"><button type="button" class="secondary" data-close="detail-dialog">Cancel</button><button class="primary">Create & notify owner</button></div></form>`);
}
function createDecisionFromInsight(button){const seed=decisionInsights.get(button.dataset.decisionInsight)||{};decisionDialog(seed);}
async function sendDecisionNotification(item){
 try{const r=await notifyDecision({to:item.ownerEmail,id:item.id,title:item.title,status:item.status,priority:item.priority,due:item.due,problem:item.problem,action:item.action,workspaceUrl:`${location.origin}${location.pathname}#decisions`});item.notification={state:r.sent?'sent':'pending_configuration',at:new Date().toISOString(),message:r.message||''};addDecisionActivity(item,item.status,r.sent?`Notification sent to ${item.ownerEmail}.`:'Email notification pending configuration.');persistDecisions();return r;}catch(err){item.notification={state:'failed',at:new Date().toISOString(),message:err.message};addDecisionActivity(item,item.status,`Notification failed: ${err.message}`);persistDecisions();return {sent:false,error:err.message};}
}
function decisionDetail(item){const events=[...(item.activity||[])].reverse();openDetail(`<div class="dialog-head"><div><span class="eyebrow">${e(item.id)}</span><h2 id="detail-title">${e(item.title)}</h2><p>${e(item.owner)} · ${e(item.status)}</p></div><button class="icon-button" data-close="detail-dialog" aria-label="Close">${icon('close')}</button></div><div class="detail-body decision-detail"><section><h3>Evidence / risk statement</h3><p>${e(item.problem)}</p><h3>Mitigation action</h3><p>${e(item.action)}</p>${item.expectedImpact?`<h3>Expected outcome</h3><p>${e(item.expectedImpact)}</p>`:''}</section><dl class="preview-list"><div><dt>Source</dt><dd>${e(item.source||'Manual decision')}</dd></div><div><dt>Context</dt><dd>${e(item.scenario||'India trade risk · 2026 baseline')}</dd></div><div><dt>Owner</dt><dd>${e(item.owner)}<br><small>${e(item.ownerEmail||'No email')}</small></dd></div><div><dt>Due date</dt><dd>${e(item.due)}</dd></div><div><dt>Priority</dt><dd>${e(item.priority)}</dd></div><div><dt>Notification</dt><dd>${e(item.notification?.state||'not sent')}</dd></div></dl><section class="decision-timeline"><h3>Activity timeline</h3>${events.map(ev=>`<article><i></i><div><strong>${e(ev.status)}</strong><p>${e(ev.note)}</p><time>${e(new Date(ev.at).toLocaleString('en-IN'))}</time></div></article>`).join('')}</section></div>`);}
function previewDraft(){try{const valid=validateScenario(draft,d);$('#scenario-preview').innerHTML=scenarioPreview(d,valid);$('#draft-error').textContent='';$('#scenario-form button[type="submit"]').disabled=false;}catch(err){$('#draft-error').textContent=err.message;$('#scenario-form button[type="submit"]').disabled=true;}}
function confirmDelete(id){const s=saved.find(x=>x.id===id);if(!s)return;openDetail(`<div class="dialog-head"><h2 id="detail-title">Delete saved scenario?</h2><button class="icon-button" data-close="detail-dialog" aria-label="Close">${icon('close')}</button></div><div class="detail-body"><p>This removes “${e(s.name)}” from this browser. The active scenario is unchanged.</p><div class="form-actions"><button class="secondary" data-close="detail-dialog">Cancel</button><button class="primary destructive" data-confirm-delete="${e(id)}">Delete scenario</button></div></div>`);}
async function share(){if(!/^https?:$/.test(location.protocol)){toast('Use a deployed URL to share a link, or export the scenario JSON.');return;}const url=`${location.origin}${location.pathname}?${encodeScenario(scenario,d)}#${view}`;try{await navigator.clipboard.writeText(url);toast('Scenario link copied.');}catch{openDetail(`<div class="dialog-head"><h2 id="detail-title">Copy this scenario link</h2><button class="icon-button" data-close="detail-dialog" aria-label="Close">${icon('close')}</button></div><div class="detail-body"><label class="field-label" for="share-url">Link with exact assumptions</label><input id="share-url" class="text-input" value="${e(url)}" readonly><p class="helper">Copy the selected text. Saved scenario names and browser activity are not included.</p></div>`);$('#share-url').select();}}
function showClear(){openDetail(`<div class="dialog-head"><h2 id="detail-title">Clear local planning data?</h2><button class="icon-button" data-close="detail-dialog" aria-label="Close">${icon('close')}</button></div><div class="detail-body"><p>This deletes saved scenarios and activity from this browser. Export anything you need first. The active scenario remains available.</p><div class="form-actions"><button class="secondary" data-close="detail-dialog">Cancel</button><button class="primary destructive" data-action="confirm-clear">Clear local data</button></div></div>`);}
const actions={
 'go-scenarios':()=>navigate('scenarios'),'go-orders':()=>navigate('orders'),'go-operations':()=>navigate('operations'),'go-decisions':()=>navigate('decisions'),'go-governance':()=>navigate('governance'),'new-decision':()=>decisionDialog(),'go-about':()=>navigate('about'),'go-profile':()=>navigate('profile'),'go-overview':()=>navigate('overview'),'go-analyst':()=>openAnalystForView(view),'refresh-trade':()=>refreshTradeData(),
 'menu':()=>{const open=$('#sidebar').classList.toggle('mobile-open');$('.mobile-menu').setAttribute('aria-expanded',String(open));},'sidebar-collapse':toggleSidebar,
 'assistant':showAssistant,'new-chat':()=>newAnalystChat(activeAnalystThread()?.projectId||''),'new-project':projectDialog,'clear-chat-history':clearAnalystHistory,'share':share,'save':saveDialog,'export':()=>exportScenario(),
 'export-csv':()=>{downloadFile('ontotrail-orders.csv',orderCSV(result),'text/csv;charset=utf-8');toast('All orders exported for the active scenario.');},
 'draft-baseline':()=>{draft=baseline(d);render();toast('Preview reset to zero delays. Apply to update the workspace.');},
 'draft-reset':()=>{draft=clone(scenario);render();toast('Unapplied changes discarded.');},
 'import':()=>$('#import-file').click(),
 'clear-ai-scenario':()=>{ui.aiScenario=null;render();toast('AI scenario seed cleared.');},'clear-local':showClear,'confirm-clear':()=>{saved=[];activity=[];ui.compareId='';persist();closeDialog('detail-dialog');render();toast('Saved scenarios and local activity cleared.');}
};
document.addEventListener('click',event=>{const target=event.target.closest('button,a');if(!target)return;
 try{
  if(target.dataset.assistantExpand!==undefined){const dlg=$('#assistant-dialog');const expanded=dlg.classList.toggle('expanded');target.setAttribute('aria-pressed',String(expanded));target.setAttribute('aria-label',expanded?'Restore Ask OntoTrail':'Maximize Ask OntoTrail');target.title=expanded?'Restore':'Maximize';target.textContent=expanded?'↙':'⛶';return;}
  if(target.dataset.close){closeDialog(target.dataset.close);return;}
  if(target.dataset.order){openOrder(target.dataset.order);return;}
  if(target.dataset.source){event.preventDefault();if($('#assistant-dialog').open)$('#assistant-dialog').close();sourceRecord(target.dataset.source);return;}
  if(target.dataset.nav){event.preventDefault();navigate(target.dataset.nav);return;}
  if(target.dataset.chatCopyPrompt!==undefined){event.preventDefault();void copyChatPrompt(target.closest('.chat-pair'));return;}
  if(target.dataset.chatSharePrompt!==undefined){event.preventDefault();void shareChatPrompt(target.closest('.chat-pair'));return;}
  if(target.dataset.chatEdit!==undefined){event.preventDefault();beginChatEdit(target.closest('.chat-pair'));return;}
  if(target.dataset.chatEditCancel!==undefined){event.preventDefault();cancelChatEdit(target.closest('.chat-pair'));return;}
  if(target.dataset.chatCopy!==undefined){event.preventDefault();void copyChatResponse(target.closest('.chat-pair'));return;}
  if(target.dataset.chatRetry!==undefined){event.preventDefault();retryChat(target.closest('.chat-pair'));return;}
  if(target.dataset.chatRename){event.preventDefault();renameAnalystThread(target.dataset.chatRename);return;}
  if(target.dataset.chatDelete){event.preventDefault();deleteAnalystThread(target.dataset.chatDelete);return;}
  if(target.dataset.projectRename){event.preventDefault();renameAnalystProject(target.dataset.projectRename);return;}
  if(target.dataset.projectDelete){event.preventDefault();deleteAnalystProject(target.dataset.projectDelete);return;}
  if(target.dataset.question){const sourceView=view;if(sourceView!=='analyst')ensureAnalystContextForView(sourceView);ask(target.dataset.question);return;}
  if(target.dataset.threadId){event.preventDefault();selectAnalystThread(target.dataset.threadId);return;}
  if(target.dataset.projectChat!==undefined){event.preventDefault();newAnalystChat(target.dataset.projectChat);return;}
  if(target.dataset.investigateQuestion!==undefined){event.preventDefault();ask(target.dataset.investigateQuestion);return;}
  if(target.dataset.aiScenario!==undefined){event.preventDefault();openScenarioFromPayload(target.dataset.aiScenario);return;}
  if(target.dataset.decisionBrief!==undefined){event.preventDefault();decisionBriefDialog(target.dataset.decisionBrief);return;}
  if(target.dataset.decisionBriefCreate!==undefined){event.preventDefault();const seed=decodeDecisionSeed(target.dataset.decisionBriefCreate);if(seed){closeDialog('detail-dialog');decisionDialog(seed);}return;}
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
  if(form.classList.contains('chat-edit-form')){const pair=form.closest('.chat-pair');const input=form.querySelector('[name="message"]');const edited=String(input?.value||'').trim();if(edited){truncateConversationFrom(pair);void ask(edited);}return;}
  if(form.id==='ask-form'||form.id==='analyst-ask-form'){const input=form.querySelector('input');void ask(input?.value||'');return;}
  if(form.id==='global-search'){ui.query=$('#global-query').value.trim();ui.page=1;ui.status='all';ui.priority='all';navigate('orders');return;}
  if(form.id==='order-search'){ui.query=$('#order-query').value.trim();ui.page=1;render();return;}
  if(form.id==='evidence-search'){ui.evidenceQuery=$('#evidence-query').value.trim();render();return;}
  if(form.id==='scenario-form'){applyScenario(draft,'Applied scenario assumptions');return;}
  if(form.id==='project-form'){const fd=new FormData(form);createAnalystProject(fd.get('name'));return;}
  if(form.id==='decision-form'){const fd=new FormData(form);const createdAt=new Date().toISOString();const item={id:nextDecisionId(decisions),title:String(fd.get('title')||'').trim(),problem:String(fd.get('problem')||'').trim(),action:String(fd.get('action')||'').trim(),owner:String(fd.get('owner')||'').trim(),ownerEmail:String(fd.get('ownerEmail')||'').trim(),due:String(fd.get('due')||''),priority:String(fd.get('priority')||'Medium'),status:String(fd.get('status')||'Proposed'),expectedImpact:String(fd.get('expectedImpact')||'').trim(),scenario:'India trade risk · 2026 baseline',source:String(fd.get('source')||'Manual decision'),createdAt,updatedAt:createdAt,notification:{state:'not_sent'},activity:[{status:String(fd.get('status')||'Proposed'),note:String(fd.get('note')||'Decision created.').trim()||'Decision created.',at:createdAt}]};if(!item.title||!item.problem||!item.action||!item.owner||!item.ownerEmail||!item.due)throw Error('Complete the required decision fields.');decisions.unshift(item);persistDecisions();log(`Created decision ${item.id}: ${item.title}`);closeDialog('detail-dialog');navigate('decisions');void sendDecisionNotification(item).then(r=>{render();toast(r.sent?'Decision created and owner notified.':'Decision created. Configure email delivery to send notifications.');});return;}
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
async function refreshTradeData(){tradeData={...tradeData,loading:true,error:''};render();try{tradeData=await loadTradeDashboard();}catch(err){tradeData={loading:false,error:err.message||'Could not load Marketplace trade data.',summary:null,origins:[],commodities:[],weather:[]};}render();}
try{validateDataset(d);result=evaluate(d,scenario);loadAnalystWorkspace();shell();applySidebarState();render();void refreshTradeData();initWelcome();if(initial.warning||persisted.warning)toast(initial.warning||persisted.warning);}
catch(err){$('#shell').innerHTML=`<main class="fatal"><h1>OntoTrail could not load its dataset</h1><p>Calculations are unavailable until the source records are corrected.</p><p>${e(err.message)}</p><ul>${(err.issues||[]).map(s=>`<li>${e(s)}</li>`).join('')}</ul></main>`;console.error(err);}

document.addEventListener('click',event=>{if(event.target.closest?.('[data-auth-logout]'))persistAnalystThread();},true);
window.addEventListener('ontotrail-session',()=>{persistAnalystThread();loadAnalystWorkspace();if(view==='analyst')render();});
window.addEventListener('pagehide',persistAnalystThread);
window.addEventListener('beforeunload',persistAnalystThread);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')persistAnalystThread();});
window.addEventListener('storage',event=>{
 if(!event.key||event.key!==analystWorkspaceKey()||!event.newValue)return;
 try{
  const incoming=normalizeAnalystWorkspace(JSON.parse(event.newValue));
  analystWorkspace=incoming;
  if(view==='analyst')render();
 }catch{}
});

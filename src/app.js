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
function analystFormat(column,value){const n=analystNumber(value);if(n===null)return e(value??'—');const key=String(column).toUpperCase();if(/INR/.test(key))return analystCompactInr(n);if(/TRADE_VALUE|IMPORT_VALUE|EXPORT_VALUE|NOMINAL|REAL_TRADE|PO_VALUE.*USD|VALUE_USD/.test(key))return analystCompactUsd(n);if(/EXPOSURE|REVENUE|COST|PREMIUM|AMOUNT/.test(key))return analystCompactInr(n);if(/PCT|PERCENT|RATE/.test(key))return `${new Intl.NumberFormat('en-IN',{maximumFractionDigits:2}).format(n)}%`;if(/DAYS?/.test(key))return `${new Intl.NumberFormat('en-IN',{maximumFractionDigits:2}).format(n)} days`;if(/COUNT|QUANTITY|UNITS/.test(key))return new Intl.NumberFormat('en-IN',{maximumFractionDigits:0}).format(n);return new Intl.NumberFormat('en-IN',{maximumFractionDigits:2}).format(n);}
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
function analystNarrative(question,result,cortexText=''){
 const m=analystModel(result);if(!m.rows.length)return 'No matching records were returned for this question.';
 const q=String(question||'');const asksLowest=/\b(lowest|minimum|min\.?|smallest|least|bottom)\b/i.test(q);const asksHighest=/\b(highest|maximum|max\.?|largest|most|top)\b/i.test(q);
 const rowIntent=/\b(rest of world|\brow\b)\b/i.test(q);
 const governanceImportIntent=/\bindia\b/i.test(q)&&/\b2026\b/.test(q)&&(/\btotal import value\b/i.test(q)||/\btotal import exposure\b/i.test(q)||/\btotal inbound trade value\b/i.test(q));
 if(governanceImportIntent){
  const cols=m.columns.map(c=>String(c));const find=(patterns)=>cols.find(c=>{const u=c.toUpperCase();return patterns.some(p=>p.test(u));});
  const importCol=find([/^IMPORT_VALUE_USD$/, /TOTAL.*IMPORT.*VALUE/, /TOTAL_NOMINAL_TRADE_VALUE_USD/])||m.metric;
  const value=importCol?m.rows.map(r=>analystNumber(r[importCol])).filter(v=>v!==null).reduce((a,b)=>a+b,0):null;
  if(value!==null)return `India's governed 2026 import value is <strong>${analystFormat(importCol||'IMPORT_VALUE_USD',value)}</strong>. Planning, Procurement and Logistics phrasing all resolve to the canonical <strong>import_value_usd</strong> metric with <strong>TRADE_DIRECTION = IMPORT</strong> and <strong>TRADE_YEAR = 2026</strong>.`;
 }
 const seaDependencyRankIntent=/\bmost\s+dependent\s+on\s+sea\b/i.test(q)||/\bhighest\s+sea\s+dependenc/i.test(q)||/\bdependent\s+on\s+sea\s+transport\b/i.test(q);
 if(seaDependencyRankIntent){
  const cols=m.columns.map(c=>String(c));const find=(patterns)=>cols.find(c=>{const u=c.toUpperCase();return patterns.some(p=>p.test(u));});
  const dim=find([/COMMODITY_CHAPTER/,/COMMODITY_HEADING/,/ORIGIN_COUNTRY/,/HS4/])||m.dimension;
  const sea=find([/SEA_DEPENDENCY_PCT/]);
  const valueCol=find([/^IMPORT_VALUE_USD$/, /TOTAL_NOMINAL_TRADE_VALUE_USD/]);
  if(dim&&sea){
   const rows=[...m.rows].filter(r=>analystNumber(r[sea])!==null).sort((a,b)=>analystNumber(b[sea])-analystNumber(a[sea]));
   if(rows.length){
    const leaders=rows.slice(0,5).map(r=>{
      const label=/COMMODITY/i.test(String(dim))?analystCommodityLabel(r[dim]):String(r[dim]??'');
      const bits=[`${analystFormat(sea,r[sea])} sea dependency`];
      if(valueCol&&analystNumber(r[valueCol])!==null)bits.push(`${analystFormat(valueCol,r[valueCol])} import value`);
      return `<strong>${e(label)}</strong> (${bits.join(' · ')})`;
    }).join(', ');
    return `The most sea-dependent India imports in the returned 2026 data are ${leaders}. This ranking is based on <strong>SEA_DEPENDENCY_PCT</strong>—the share of import value carried by sea—not on absolute sea trade value.`;
   }
  }
  return 'The returned result does not contain <strong>SEA_DEPENDENCY_PCT</strong>, so OntoTrail cannot correctly rank which imports are most dependent on sea transport from this result.';
 }
 const governanceSeaIntent=/\bmore than\s+70%\s+sea dependent\b/i.test(q)||(/\bsea dependent\b/i.test(q)&&/\bindia imports\b/i.test(q));
 if(governanceSeaIntent){
  const cols=m.columns.map(c=>String(c));const find=(patterns)=>cols.find(c=>{const u=c.toUpperCase();return patterns.some(p=>p.test(u));});
  const dim=find([/ORIGIN_COUNTRY/,/CHAPTER/,/HEADING/,/HS4/])||m.dimension;
  const sea=find([/SEA_DEPENDENCY_PCT/]);
  const valueCol=find([/IMPORT_VALUE_USD/,/TOTAL_NOMINAL_TRADE_VALUE_USD/,/TRADE_VALUE/]);
  if(dim&&sea){
   const rows=m.rows.filter(r=>{const v=analystNumber(r[sea]);return v!==null&&v>70;}).sort((a,b)=>(analystNumber(b[valueCol])||0)-(analystNumber(a[valueCol])||0));
   if(rows.length){
    const leaders=rows.slice(0,5).map(r=>`<strong>${e(r[dim])}</strong> (${analystFormat(sea,r[sea])}${valueCol&&analystNumber(r[valueCol])!==null?` · ${analystFormat(valueCol,r[valueCol])}`:''})`).join(', ');
    return `${rows.length} returned import flow${rows.length===1?'':'s'} exceed <strong>70% sea dependency</strong>. Highest-value examples: ${leaders}. Sea dependency is the share of nominal import value carried by sea within the filtered flows.`;
   }
   return 'No returned India import flows exceed <strong>70% sea dependency</strong> for the selected 2026 data.';
  }
 }
 const governanceWeatherCoverageIntent=/\bhow much\b.*\bimport value\b.*\bweather intelligence available\b/i.test(q)||/\bweather[- ]covered trade value\b/i.test(q);
 if(governanceWeatherCoverageIntent){
  const cols=m.columns.map(c=>String(c));const find=(patterns)=>cols.find(c=>{const u=c.toUpperCase();return patterns.some(p=>p.test(u));});
  const covered=find([/WEATHER_COVERED_TRADE_VALUE_USD/]),pctCol=find([/WEATHER_COVERAGE_PCT/]),importCol=find([/IMPORT_VALUE_USD/,/TOTAL_NOMINAL_TRADE_VALUE_USD/]);
  const first=m.rows[0]||{};
  const coveredValue=covered?analystNumber(first[covered]):null,pct=pctCol?analystNumber(first[pctCol]):null,total=importCol?analystNumber(first[importCol]):null;
  if(coveredValue!==null||pct!==null){
   let out='For India imports in 2026, ';
   if(coveredValue!==null)out+=`<strong>${analystFormat(covered,coveredValue)}</strong> of trade value has Pelmorex weather intelligence`;
   if(pct!==null)out+=`${coveredValue!==null?' ':''}(<strong>${analystFormat(pctCol,pct)}</strong> coverage)`;
   if(total!==null)out+=` out of <strong>${analystFormat(importCol,total)}</strong> total import value`;
   return out+'. Weather coverage indicates data availability, not that the covered trade is necessarily at elevated weather risk.';
  }
 }
 const governanceWeatherRankIntent=/\bamong countries with weather coverage\b/i.test(q)&&/\bhighest import exposure\b/i.test(q)&&/\bweather risk\b/i.test(q);
 if(governanceWeatherRankIntent){
  const cols=m.columns.map(c=>String(c));const find=(patterns)=>cols.find(c=>{const u=c.toUpperCase();return patterns.some(p=>p.test(u));});
  const country=find([/ORIGIN_COUNTRY/,/ORIGIN_ISO/])||m.dimension,importCol=find([/IMPORT_VALUE_USD/,/TOTAL_NOMINAL_TRADE_VALUE_USD/]),risk=find([/TRADE_WEIGHTED_WEATHER_RISK_SCORE/,/WEATHER_RISK_SCORE/]),coverage=find([/WEATHER_COVERAGE_PCT/]),elevated=find([/ELEVATED_WEATHER_RISK_TRADE_VALUE_USD/]);
  if(country&&m.rows.length){
   const rows=[...m.rows].filter(r=>!coverage||analystNumber(r[coverage])===null||analystNumber(r[coverage])>0).sort((a,b)=>(analystNumber(b[importCol])||0)-(analystNumber(a[importCol])||0));
   const leaders=rows.slice(0,5).map(r=>{const bits=[];if(importCol&&analystNumber(r[importCol])!==null)bits.push(analystFormat(importCol,r[importCol]));if(risk&&analystNumber(r[risk])!==null)bits.push(`risk score ${analystFormat(risk,r[risk])}`);if(elevated&&analystNumber(r[elevated])!==null)bits.push(`${analystFormat(elevated,r[elevated])} elevated-risk value`);return `<strong>${e(r[country])}</strong> (${bits.join(' · ')})`;}).join(', ');
   if(leaders)return `Among weather-covered origins, the largest import exposures in the returned data are ${leaders}. Compare exposure and weather-risk score together; weather risk is an OntoTrail heuristic over covered Pelmorex locations, not a probability of disruption.`;
  }
 }

 if(rowIntent){
   const cols=m.columns.map(c=>String(c));
   const findCol=(patterns,exclude=[])=>cols.find(c=>{
     const u=c.toUpperCase();
     return patterns.some(p=>p.test(u))&&!exclude.some(p=>p.test(u));
   });
   const commodityDim=findCol([/COMMODITY_HEADING/,/^HEADING$/, /COMMODITY_CHAPTER/,/^CHAPTER$/, /COMMODITY_SECTION/,/^SECTION$/, /COMMODITY/],[/COUNT/,/VALUE/,/PCT/,/PERCENT/])||m.dimension;
   const commodityValueCol=findCol([/COMMODITY.*IMPORT.*VALUE/,/COMMODITY.*VALUE/,/IMPORT.*VALUE/],[/TOTAL/,/ROW_/])||m.metric;
   const shareCol=findCol([/COMMODITY.*SHARE.*PCT/,/SHARE.*PCT/,/PERCENT/]);
   const totalCol=findCol([/ROW_TOTAL_IMPORT_VALUE/,/TOTAL_IMPORT_VALUE/,/TOTAL.*IMPORT.*VALUE/]);
   const seaCol=findCol([/ROW_SEA_DEPENDENCY_PCT/,/^SEA_DEPENDENCY_PCT$/, /SEA.*PCT/]);
   const airCol=findCol([/ROW_AIR_DEPENDENCY_PCT/,/^AIR_DEPENDENCY_PCT$/, /AIR.*PCT/]);
   const landCol=findCol([/ROW_LAND_DEPENDENCY_PCT/,/^LAND_DEPENDENCY_PCT$/, /LAND.*PCT/]);
   const weatherValueCol=findCol([/TOTAL_WEATHER_COVERED_VALUE/,/WEATHER.*COVERED.*VALUE/]);
   const weatherCoverageCol=findCol([/WEATHER_COVERAGE_PCT/,/WEATHER.*PCT/]);
   const weatherRiskCol=findCol([/OVERALL_TRADE_WEIGHTED_WEATHER_RISK_SCORE/,/WEATHER_RISK_SCORE/]);

   if(commodityDim&&commodityValueCol){
     const grouped=new Map();
     for(const r of m.rows){
       const label=String(r[commodityDim]??'').trim();
       const value=analystNumber(r[commodityValueCol]);
       if(!label||value===null)continue;
       const existing=grouped.get(label)||{label,value:0,share:0,row:r};
       existing.value+=value;
       const share=shareCol?analystNumber(r[shareCol]):null;
       if(share!==null)existing.share+=share;
       if(value>analystNumber(existing.row[commodityValueCol]??0))existing.row=r;
       grouped.set(label,existing);
     }
     const groups=[...grouped.values()].sort((a,b)=>b.value-a.value);
     if(groups.length){
       const firstRow=m.rows[0]||{};
       const totalValue=totalCol?analystNumber(firstRow[totalCol]):groups.reduce((sum,g)=>sum+g.value,0);
       const totalText=analystFormat(totalCol||'TOTAL_IMPORT_VALUE',totalValue);
       const commodityText=groups.slice(0,3).map(g=>{
         const share=g.share>0?g.share:(totalValue?g.value/totalValue*100:null);
         return `<strong>${e(analystCommodityLabel(g.label))}</strong> (${analystFormat(commodityValueCol,g.value)}${share!==null?`, ${new Intl.NumberFormat('en-IN',{maximumFractionDigits:1}).format(share)}%`:''})`;
       }).join(', ');
       const parts=[`Rest of World represents <strong>${totalText}</strong> of India import exposure in 2026.`,`Largest commodity concentrations: ${commodityText}.`];
       const sea=seaCol?analystNumber(firstRow[seaCol]):null;
       const air=airCol?analystNumber(firstRow[airCol]):null;
       const land=landCol?analystNumber(firstRow[landCol]):null;
       if(sea!==null||air!==null||land!==null){
         const transport=[];
         if(sea!==null)transport.push(`<strong>${analystFormat(seaCol,sea)}</strong> sea`);
         if(air!==null)transport.push(`<strong>${analystFormat(airCol,air)}</strong> air`);
         if(land!==null)transport.push(`<strong>${analystFormat(landCol,land)}</strong> land`);
         parts.push(`Transport mix: ${transport.join(', ')}.`);
       }
       const weatherValue=weatherValueCol?analystNumber(firstRow[weatherValueCol]):null;
       const weatherCoverage=weatherCoverageCol?analystNumber(firstRow[weatherCoverageCol]):null;
       const weatherRisk=weatherRiskCol?analystNumber(firstRow[weatherRiskCol]):null;
       if((weatherValue!==null&&weatherValue>0)||(weatherCoverage!==null&&weatherCoverage>0)){
         let w='Weather intelligence is available for part of this aggregate';
         if(weatherValue!==null&&weatherValue>0)w+=`, covering <strong>${analystFormat(weatherValueCol,weatherValue)}</strong>`;
         if(weatherCoverage!==null&&weatherCoverage>0)w+=` (<strong>${analystFormat(weatherCoverageCol,weatherCoverage)}</strong>)`;
         if(weatherRisk!==null)w+=`, with a trade-weighted risk score of <strong>${analystFormat(weatherRiskCol,weatherRisk)}</strong>`;
         parts.push(w+'.');
       }else{
         parts.push('No aggregate Pelmorex weather coverage is available for Rest of World, so no weather risk is inferred.');
       }
       return parts.join(' ');
     }
   }
 }
 const poExposureIntent=/\b(delayed|outstanding|received|purchase order|\bpo\b)\b/i.test(q)&&/\b(exposure|supplier|value|count|which|show|list|affecting)\b/i.test(q);
 if(poExposureIntent){
  const cols=m.columns.map(c=>String(c));const find=(patterns)=>cols.find(c=>{const u=c.toUpperCase();return patterns.some(p=>p.test(u));});
  const supplierCol=find([/SUPPLIER_NAME/]),poCol=find([/^PO_ID$/]),delayedValueCol=find([/DELAYED_PO_VALUE_USD/]),delayedCountCol=find([/DELAYED_PO_COUNT/]),outstandingCol=find([/OUTSTANDING_QUANTITY/]),totalPoCol=find([/TOTAL_PO_VALUE_USD/,/^PO_VALUE_USD$/]),statusCol=find([/PO_STATUS/]),materialCol=find([/MATERIAL_NAME/]);
  if((supplierCol||poCol)&&m.rows.length){
   if(supplierCol&&(delayedValueCol||delayedCountCol)){
    const rows=[...m.rows].sort((a,b)=>(analystNumber(b[delayedValueCol])||0)-(analystNumber(a[delayedValueCol])||0)||(analystNumber(b[delayedCountCol])||0)-(analystNumber(a[delayedCountCol])||0));
    const totalDelayed=delayedValueCol?rows.reduce((n,r)=>n+(analystNumber(r[delayedValueCol])||0),0):null;
    const leaders=rows.slice(0,3).map(r=>{const bits=[];if(delayedValueCol)bits.push(analystFormat(delayedValueCol,r[delayedValueCol]));if(delayedCountCol)bits.push(`${analystFormat(delayedCountCol,r[delayedCountCol])} delayed POs`);if(outstandingCol&&analystNumber(r[outstandingCol])!==null)bits.push(`${analystFormat(outstandingCol,r[outstandingCol])} outstanding units`);return `<strong>${e(r[supplierCol])}</strong> (${bits.join(' · ')})`;}).join(', ');
    return `${totalDelayed!==null?`Total delayed PO exposure across the returned suppliers is <strong>${analystFormat(delayedValueCol,totalDelayed)}</strong>. `:''}The largest delayed exposures are ${leaders}. Decision focus: prioritize suppliers with both high delayed value and material outstanding quantity, then confirm promised dates and recovery options.`;
   }
   if(poCol){
    const risky=[...m.rows].filter(r=>!statusCol||/DELAYED|PARTIALLY_RECEIVED|IN_TRANSIT/i.test(String(r[statusCol]||''))).sort((a,b)=>(analystNumber(b[totalPoCol])||0)-(analystNumber(a[totalPoCol])||0));
    const rows=risky.length?risky:m.rows;const leaders=rows.slice(0,5).map(r=>{const bits=[];if(statusCol&&r[statusCol])bits.push(e(r[statusCol]));if(totalPoCol&&analystNumber(r[totalPoCol])!==null)bits.push(analystFormat(totalPoCol,r[totalPoCol]));if(outstandingCol&&analystNumber(r[outstandingCol])!==null)bits.push(`${analystFormat(outstandingCol,r[outstandingCol])} outstanding`);if(materialCol&&r[materialCol])bits.push(e(r[materialCol]));return `<strong>${e(r[poCol])}</strong> (${bits.join(' · ')})`;}).join(', ');
    return `The purchase orders needing the most attention are ${leaders}. Review supplier commitments and ETA evidence before changing procurement actions.`;
   }
  }
 }
 const inventoryIntent=/\b(inventory|stock|days? of cover|cover|safety stock)\b/i.test(q);
 if(inventoryIntent){
  const cols=m.columns.map(c=>String(c));const find=(patterns)=>cols.find(c=>{const u=c.toUpperCase();return patterns.some(p=>p.test(u));});
  const materialCol=find([/MATERIAL_NAME/]),coverCol=find([/MINIMUM_DAYS_OF_COVER/,/AVERAGE_DAYS_OF_COVER/,/^DAYS_OF_COVER$/]),outstandingCol=find([/OUTSTANDING_QUANTITY/]),plantCol=find([/PLANT_NAME/]),criticalityCol=find([/MATERIAL_CRITICALITY/]),supplierCol=find([/SUPPLIER_NAME/]),delayedValueCol=find([/DELAYED_PO_VALUE_USD/]);
  if(materialCol&&coverCol&&m.rows.length){
   const rows=[...m.rows].filter(r=>analystNumber(r[coverCol])!==null).sort((a,b)=>analystNumber(a[coverCol])-analystNumber(b[coverCol]));
   const leaders=rows.slice(0,3).map(r=>{const bits=[analystFormat(coverCol,r[coverCol])];if(criticalityCol&&r[criticalityCol])bits.push(`${e(r[criticalityCol])} criticality`);if(outstandingCol&&analystNumber(r[outstandingCol])!==null)bits.push(`${analystFormat(outstandingCol,r[outstandingCol])} outstanding`);if(delayedValueCol&&analystNumber(r[delayedValueCol])!==null)bits.push(`${analystFormat(delayedValueCol,r[delayedValueCol])} delayed value`);if(supplierCol&&r[supplierCol])bits.push(e(r[supplierCol]));if(plantCol&&r[plantCol])bits.push(e(r[plantCol]));return `<strong>${e(r[materialCol])}</strong> (${bits.join(' · ')})`;}).join(', ');
   return `The lowest inventory cover is concentrated in ${leaders}. Decision focus: secure the lowest-cover critical materials first and trace the delayed or outstanding POs feeding those materials.`;
  }
 }
 const plantIntent=/\b(plant|factory|bengaluru|pune|chennai|hyderabad)\b/i.test(q)&&/\b(risk|expos|disruption|most|highest)\b/i.test(q);
 if(plantIntent){
  const cols=m.columns.map(c=>String(c));const find=(patterns)=>cols.find(c=>{const u=c.toUpperCase();return patterns.some(p=>p.test(u));});
  const plantCol=find([/PLANT_NAME/]),riskValueCol=find([/HIGH_OPERATIONAL_RISK_PO_VALUE_USD/]),delayedCountCol=find([/DELAYED_PO_COUNT/]),coverCol=find([/MINIMUM_DAYS_OF_COVER/]),poValueCol=find([/TOTAL_PO_VALUE_USD/]);
  if(plantCol&&m.rows.length){
   const max=(col)=>col?Math.max(...m.rows.map(r=>analystNumber(r[col])||0),0):0;const mr=max(riskValueCol),md=max(delayedCountCol),mp=max(poValueCol),mc=max(coverCol);
   const score=r=>(mr?((analystNumber(r[riskValueCol])||0)/mr)*45:0)+(md?((analystNumber(r[delayedCountCol])||0)/md)*20:0)+(mp?((analystNumber(r[poValueCol])||0)/mp)*20:0)+(mc?(1-Math.min(1,(analystNumber(r[coverCol])||0)/mc))*15:0);
   const rows=[...m.rows].map(r=>({r,score:score(r)})).sort((a,b)=>b.score-a.score);const top=rows[0];if(top){const r=top.r;const bits=[];if(riskValueCol)bits.push(`high-risk PO value ${analystFormat(riskValueCol,r[riskValueCol])}`);if(delayedCountCol)bits.push(`${analystFormat(delayedCountCol,r[delayedCountCol])} delayed POs`);if(coverCol)bits.push(`minimum cover ${analystFormat(coverCol,r[coverCol])}`);return `<strong>${e(r[plantCol])}</strong> has the highest composite plant exposure in the returned data (${top.score.toFixed(0)}/100). Key drivers: ${bits.join(', ')}. The score is a decision-support composite, so use the underlying governed metrics and drill-down rows for the final operational decision.`;}
  }
 }
 const materialRiskIntent=/\b(materials?|components?|parts?|battery|inverter|motor|semiconductors?|connectors?|pumps?|thermal)\b/i.test(q)&&/\b(risk|exposure|highest|most|low|cover|disruption)\b/i.test(q);
 if(materialRiskIntent){
  const cols=m.columns.map(c=>String(c));const find=(patterns)=>cols.find(c=>{const u=c.toUpperCase();return patterns.some(p=>p.test(u));});
  const materialCol=find([/MATERIAL_NAME/]),riskValueCol=find([/HIGH_OPERATIONAL_RISK_PO_VALUE_USD/]),poValueCol=find([/TOTAL_PO_VALUE_USD/]),outstandingCol=find([/OUTSTANDING_QUANTITY/]),coverCol=find([/MINIMUM_DAYS_OF_COVER/]),criticalityCol=find([/MATERIAL_CRITICALITY/]),delayedValueCol=find([/DELAYED_PO_VALUE_USD/]);
  if(materialCol&&m.rows.length){
   const riskValues=riskValueCol?m.rows.map(r=>analystNumber(r[riskValueCol])).filter(v=>v!==null):[];
   const maxHighRisk=riskValues.length?Math.max(...riskValues):null;
   const rows=[...m.rows].sort((a,b)=>(analystNumber(b[riskValueCol])||0)-(analystNumber(a[riskValueCol])||0)||(analystNumber(a[coverCol])??1e9)-(analystNumber(b[coverCol])??1e9)||(analystNumber(b[poValueCol])||0)-(analystNumber(a[poValueCol])||0));
   if(riskValueCol&&maxHighRisk===0){
    const attention=[...m.rows].sort((a,b)=>(analystNumber(a[coverCol])??1e9)-(analystNumber(b[coverCol])??1e9)||(analystNumber(b[delayedValueCol])||0)-(analystNumber(a[delayedValueCol])||0)||(analystNumber(b[poValueCol])||0)-(analystNumber(a[poValueCol])||0)).slice(0,3);
    const leaders=attention.map(r=>{const bits=[];if(coverCol&&analystNumber(r[coverCol])!==null)bits.push(`${analystFormat(coverCol,r[coverCol])} cover`);if(delayedValueCol&&analystNumber(r[delayedValueCol])!==null)bits.push(`${analystFormat(delayedValueCol,r[delayedValueCol])} delayed PO value`);if(poValueCol&&analystNumber(r[poValueCol])!==null)bits.push(`${analystFormat(poValueCol,r[poValueCol])} total PO exposure`);if(outstandingCol&&analystNumber(r[outstandingCol])!==null)bits.push(`${analystFormat(outstandingCol,r[outstandingCol])} outstanding`);if(criticalityCol&&r[criticalityCol])bits.push(`${e(r[criticalityCol])} criticality`);return `<strong>${e(r[materialCol])}</strong>${bits.length?` (${bits.join(' · ')})`:''}`;}).join(', ');
    const supportAvailable=Boolean(coverCol||delayedValueCol||poValueCol||outstandingCol||criticalityCol);
    return supportAvailable
      ? `No component currently has <strong>high operational-risk PO exposure</strong> in the returned governed data; the metric is <strong>$0</strong> across all returned components. The components that still warrant monitoring based on the additional returned context are ${leaders}. This means there is no present HIGH-classified exposure, not that component risk is absent.`
      : `No component currently has <strong>high operational-risk PO exposure</strong> in the returned governed data; the metric is <strong>$0</strong> across all returned components. The returned query did not include enough secondary metrics to rank which zero-high-risk components warrant closer monitoring, so OntoTrail will not manufacture a ranking.`;
   }
   const leaders=rows.slice(0,3).map(r=>{const bits=[];if(riskValueCol&&analystNumber(r[riskValueCol])!==null)bits.push(`${analystFormat(riskValueCol,r[riskValueCol])} high-risk PO value`);if(poValueCol&&analystNumber(r[poValueCol])!==null)bits.push(`${analystFormat(poValueCol,r[poValueCol])} total PO exposure`);if(outstandingCol&&analystNumber(r[outstandingCol])!==null)bits.push(`${analystFormat(outstandingCol,r[outstandingCol])} outstanding`);if(coverCol&&analystNumber(r[coverCol])!==null)bits.push(`${analystFormat(coverCol,r[coverCol])} cover`);if(criticalityCol&&r[criticalityCol])bits.push(`${e(r[criticalityCol])} criticality`);return `<strong>${e(r[materialCol])}</strong> (${bits.join(' · ')})`;}).join(', ');
   return `The components with the strongest high-risk PO exposure are ${leaders}. Prioritize critical items where high-risk PO value overlaps with low cover, delayed supply and outstanding quantity.`;
  }
 }
 const shipmentIntent=/\b(shipments?|eta|in transit|booked|logistics)\b/i.test(q);
 if(shipmentIntent){
  const cols=m.columns.map(c=>String(c));const find=(patterns)=>cols.find(c=>{const u=c.toUpperCase();return patterns.some(p=>p.test(u));});
  const shipmentCol=find([/SHIPMENT_ID/]),statusCol=find([/SHIPMENT_STATUS/]),etaCol=find([/ETA_DATE/]),supplierCol=find([/SUPPLIER_NAME/]),materialCol=find([/MATERIAL_NAME/]),outstandingCol=find([/OUTSTANDING_QUANTITY/]);
  if(shipmentCol&&m.rows.length){const delayed=m.rows.filter(r=>/DELAYED/i.test(String(r[statusCol]||'')));const focus=delayed.length?delayed:m.rows;const leaders=focus.slice(0,5).map(r=>{const bits=[];if(statusCol&&r[statusCol])bits.push(e(r[statusCol]));if(etaCol&&r[etaCol])bits.push(`ETA ${e(r[etaCol])}`);if(outstandingCol&&analystNumber(r[outstandingCol])!==null)bits.push(`${analystFormat(outstandingCol,r[outstandingCol])} outstanding`);if(supplierCol&&r[supplierCol])bits.push(e(r[supplierCol]));if(materialCol&&r[materialCol])bits.push(e(r[materialCol]));return `<strong>${e(r[shipmentCol])}</strong> (${bits.join(' · ')})`;}).join(', ');return `${delayed.length?`${delayed.length} delayed shipment${delayed.length===1?'':'s'} are visible in the returned evidence. `:''}${leaders?`Priority shipments: ${leaders}.`:''} Use the shipment status and ETA as the operational source of truth; external market dependency is context only.`;}
 }
 const supplierRiskIntent=/\b(suppliers?|vendors?)\b/i.test(q)&&/\b(worry|risk|highest|most|rank|priority|exposure)\b/i.test(q);
 if(supplierRiskIntent){
  const cols=m.columns.map(c=>String(c));const find=(patterns)=>cols.find(c=>{const u=c.toUpperCase();return patterns.some(p=>p.test(u));});
  const supplierCol=find([/SUPPLIER_NAME/,/^SUPPLIER$/,/VENDOR_NAME/]);
  if(supplierCol&&m.rows.length){
   const poValueCol=find([/TOTAL_PO_VALUE_USD/,/^PO_VALUE_USD$/,/PO_VALUE/]);
   const delayedCountCol=find([/DELAYED_PO_COUNT/]);
   const delayedValueCol=find([/DELAYED_PO_VALUE_USD/]);
   const highRiskValueCol=find([/HIGH_OPERATIONAL_RISK_PO_VALUE_USD/]);
   const weatherValueCol=find([/WEATHER_LINKED_PO_VALUE_USD/]);
   const coverCol=find([/MINIMUM_DAYS_OF_COVER/,/MIN.*DAYS.*COVER/,/DAYS_OF_COVER/]);
   const tierCol=find([/SUPPLIER_TIER/]),criticalityCol=find([/SUPPLIER_CRITICALITY/]),countryCol=find([/ORIGIN_COUNTRY/]),riskLevelCol=find([/OPERATIONAL_RISK_LEVEL/]);
   const norm=(value,max,invert=false)=>{const n=analystNumber(value);if(n===null||!max)return 0;const x=Math.max(0,Math.min(1,n/max));return invert?1-x:x;};
   const maxOf=col=>col?Math.max(...m.rows.map(r=>analystNumber(r[col])||0),0):0;
   const maxPo=maxOf(poValueCol),maxDelayCount=maxOf(delayedCountCol),maxDelayValue=maxOf(delayedValueCol),maxHighRisk=maxOf(highRiskValueCol),maxWeather=maxOf(weatherValueCol),maxCover=maxOf(coverCol);
   const ranked=m.rows.map(r=>{
    const score=(
      norm(r[poValueCol],maxPo)*0.20+
      norm(r[delayedCountCol],maxDelayCount)*0.15+
      norm(r[delayedValueCol],maxDelayValue)*0.20+
      norm(r[highRiskValueCol],maxHighRisk)*0.20+
      norm(r[weatherValueCol],maxWeather)*0.10+
      norm(r[coverCol],maxCover,true)*0.15
    )*100;
    return {r,score};
   }).sort((a,b)=>b.score-a.score);
   const top=ranked[0];
   if(top){
    const r=top.r;const facts=[];
    if(poValueCol&&analystNumber(r[poValueCol])!==null)facts.push(`PO exposure <strong>${analystFormat(poValueCol,r[poValueCol])}</strong>`);
    if(delayedCountCol&&analystNumber(r[delayedCountCol])!==null)facts.push(`<strong>${analystFormat(delayedCountCol,r[delayedCountCol])}</strong> delayed POs`);
    if(delayedValueCol&&analystNumber(r[delayedValueCol])!==null)facts.push(`delayed value <strong>${analystFormat(delayedValueCol,r[delayedValueCol])}</strong>`);
    if(highRiskValueCol&&analystNumber(r[highRiskValueCol])!==null)facts.push(`high-risk PO value <strong>${analystFormat(highRiskValueCol,r[highRiskValueCol])}</strong>`);
    if(weatherValueCol&&analystNumber(r[weatherValueCol])!==null)facts.push(`weather-linked value <strong>${analystFormat(weatherValueCol,r[weatherValueCol])}</strong>`);
    if(coverCol&&analystNumber(r[coverCol])!==null)facts.push(`minimum cover <strong>${analystFormat(coverCol,r[coverCol])}</strong>`);
    const descriptors=[];
    if(tierCol&&r[tierCol])descriptors.push(e(r[tierCol]));
    if(criticalityCol&&r[criticalityCol])descriptors.push(`${e(r[criticalityCol])} criticality`);
    if(countryCol&&r[countryCol])descriptors.push(e(r[countryCol]));
    if(riskLevelCol&&r[riskLevelCol])descriptors.push(`${e(r[riskLevelCol])} operational risk`);
    const next=ranked.slice(1,3).map(x=>`${e(x.r[supplierCol])} (${x.score.toFixed(0)})`).join(', ');
    return `<strong>${e(r[supplierCol])}</strong> ranks highest on OntoTrail's composite supplier-risk view with a score of <strong>${top.score.toFixed(0)}/100</strong>${descriptors.length?` (${descriptors.join(' · ')})`:''}. ${facts.length?`Key drivers: ${facts.join(', ')}.`:''}${next?` The next highest suppliers are ${next}.`:''} The score is a decision-support composite derived from the returned governed metrics, not a standalone prediction.`;
   }
  }
 }
 const crossDomainWeatherIntent=/\b(nova|supplier|vendor|material|component|plant|po|purchase order)\b/i.test(q)&&/\b(weather|external|marketplace|country risk|sea dependency)\b/i.test(q);
 if(crossDomainWeatherIntent&&m.rows.length){
  const cols=m.columns.map(c=>String(c));const find=(patterns)=>cols.find(c=>{const u=c.toUpperCase();return patterns.some(p=>p.test(u));});
  const supplierCol=find([/SUPPLIER_NAME/,/VENDOR_NAME/]),materialCol=find([/MATERIAL_NAME/]),plantCol=find([/PLANT_NAME/]),originCol=find([/ORIGIN_COUNTRY/]),weatherCol=find([/WEATHER_RISK_LEVEL/]),matchCol=find([/MARKETPLACE_MATCH_STATUS/]);
  const poValueCol=find([/TOTAL_PO_VALUE_USD/,/^PO_VALUE_USD$/]),weatherValueCol=find([/WEATHER_LINKED_PO_VALUE_USD/]),coverCol=find([/MINIMUM_DAYS_OF_COVER/]),seaCol=find([/AVERAGE_MARKET_SEA_DEPENDENCY_PCT/]),delayedCol=find([/DELAYED_PO_VALUE_USD/]);
  const entityCol=supplierCol||materialCol||plantCol||originCol||m.dimension;
  if(entityCol){
   const rows=[...m.rows].sort((a,b)=>(analystNumber(b[weatherValueCol])||0)-(analystNumber(a[weatherValueCol])||0)||(analystNumber(b[poValueCol])||0)-(analystNumber(a[poValueCol])||0));
   const elevated=rows.filter(r=>(analystNumber(r[weatherValueCol])||0)>0||/MEDIUM|HIGH/i.test(String(r[weatherCol]||'')));
   if(!elevated.length){
    const matched=rows.filter(r=>!matchCol||/MATCHED/i.test(String(r[matchCol]||''))).slice(0,3);
    const examples=matched.map(r=>{const bits=[];if(originCol&&r[originCol])bits.push(e(r[originCol]));if(poValueCol&&analystNumber(r[poValueCol])!==null)bits.push(analystFormat(poValueCol,r[poValueCol]));if(coverCol&&analystNumber(r[coverCol])!==null)bits.push(analystFormat(coverCol,r[coverCol]));if(seaCol&&analystNumber(r[seaCol])!==null)bits.push(`${analystFormat(seaCol,r[seaCol])} external sea dependency`);return `<strong>${e(r[entityCol])}</strong>${bits.length?` (${bits.join(' · ')})`:''}`;}).join(', ');
    return `No Nova Mobility supplier in the returned governed evidence currently has <strong>elevated external weather-linked PO exposure</strong>. ${matched.length?`The largest matched operational exposures are ${examples}.`:''} External weather is contextual Marketplace intelligence; zero elevated exposure does not mean the supplier has no operational risk.`;
   }
   const leaders=elevated.slice(0,3).map(r=>{const bits=[];if(originCol&&r[originCol])bits.push(e(r[originCol]));if(weatherValueCol&&analystNumber(r[weatherValueCol])!==null)bits.push(`${analystFormat(weatherValueCol,r[weatherValueCol])} weather-linked PO value`);if(poValueCol&&analystNumber(r[poValueCol])!==null)bits.push(`${analystFormat(poValueCol,r[poValueCol])} total PO exposure`);if(weatherCol&&r[weatherCol])bits.push(`${e(r[weatherCol])} weather signal`);if(coverCol&&analystNumber(r[coverCol])!==null)bits.push(`${analystFormat(coverCol,r[coverCol])} minimum cover`);if(delayedCol&&analystNumber(r[delayedCol])!==null)bits.push(`${analystFormat(delayedCol,r[delayedCol])} delayed value`);if(seaCol&&analystNumber(r[seaCol])!==null)bits.push(`${analystFormat(seaCol,r[seaCol])} external sea dependency`);return `<strong>${e(r[entityCol])}</strong> (${bits.join(' · ')})`;}).join(', ');
   return `The strongest overlap between Nova operational exposure and elevated external weather context is ${leaders}. Treat the weather signal as external Marketplace context and use the Nova PO, inventory and supplier metrics as the operational source of truth.`;
  }
 }
 const exposureIntent=/\b(import|export|trade)\b/i.test(q)&&/\b(exposure|dependenc|concentrat|risk|explain)\b/i.test(q);
 if(exposureIntent){
  const cols=m.columns.map(c=>String(c));const find=(patterns,exclude=[])=>cols.find(c=>{const u=c.toUpperCase();return patterns.some(p=>p.test(u))&&!exclude.some(p=>p.test(u));});
  const commodityCol=find([/COMMODITY_CHAPTER/,/COMMODITY_HEADING/,/^CHAPTER$/, /^HEADING$/, /COMMODITY/],[/COUNT/,/VALUE/,/PCT/,/PERCENT/]);
  const valueCol=find([/IMPORT_VALUE_USD/,/EXPORT_VALUE_USD/,/TOTAL_NOMINAL_TRADE_VALUE_USD/,/TRADE_VALUE/]);
  if(commodityCol&&valueCol&&m.rows.length){
   const seaCol=find([/SEA_DEPENDENCY_PCT/]),airCol=find([/AIR_DEPENDENCY_PCT/]),landCol=find([/LAND_DEPENDENCY_PCT/]);
   const weatherCoverageCol=find([/WEATHER_COVERAGE_PCT/]),weatherRiskCol=find([/TRADE_WEIGHTED_WEATHER_RISK_SCORE/]),weatherValueCol=find([/ELEVATED_WEATHER_RISK_TRADE_VALUE_USD/]);
   const rows=m.rows.map(r=>({r,label:String(r[commodityCol]??'').trim(),value:analystNumber(r[valueCol])})).filter(x=>x.label&&x.value!==null).sort((a,b)=>b.value-a.value);
   if(rows.length){
    const total=rows.reduce((n,x)=>n+x.value,0);
    const weighted=(col,coverageWeighted=false)=>{
      if(!col||!total)return null;let num=0,den=0;
      for(const x of rows){const v=analystNumber(x.r[col]);if(v===null)continue;const coverage=weatherCoverageCol?analystNumber(x.r[weatherCoverageCol]):null;const w=coverageWeighted&&coverage!==null?x.value*(coverage/100):x.value;if(w<=0)continue;num+=v*w;den+=w;}
      return den?num/den:null;
    };
    const top=rows.slice(0,3).map(x=>{const share=total?x.value/total*100:0;return `<strong>${e(analystCommodityLabel(x.label))}</strong> ${analystFormat(valueCol,x.value)} (${new Intl.NumberFormat('en-IN',{maximumFractionDigits:1}).format(share)}%)`;}).join(', ');
    const parts=[`Total modeled ${/export/i.test(q)?'export':'import'} exposure is <strong>${analystFormat(valueCol,total)}</strong>.`,`Top commodity concentrations: ${top}.`];
    const sea=weighted(seaCol),air=weighted(airCol),land=weighted(landCol);const transport=[];
    if(sea!==null)transport.push(`<strong>${new Intl.NumberFormat('en-IN',{maximumFractionDigits:1}).format(sea)}%</strong> sea`);
    if(air!==null)transport.push(`<strong>${new Intl.NumberFormat('en-IN',{maximumFractionDigits:1}).format(air)}%</strong> air`);
    if(land!==null)transport.push(`<strong>${new Intl.NumberFormat('en-IN',{maximumFractionDigits:1}).format(land)}%</strong> land`);
    if(transport.length)parts.push(`Estimated transport mix across the returned commodity exposure: ${transport.join(', ')}.`);
    if(land!==null&&land>50&&/\bchina\b/i.test(q))parts.push('Note: TradePrism classifies more than half of this value as land mode. Because that is counter-intuitive for China–India trade, treat it as a Marketplace modal-classification result and review the generated SQL/audit trail before using it operationally.');
    const coverage=weighted(weatherCoverageCol),risk=weighted(weatherRiskCol,true);const weatherValue=weatherValueCol?rows.reduce((n,x)=>n+(analystNumber(x.r[weatherValueCol])||0),0):null;
    if(coverage!==null&&coverage>0){
      let weather=`Weather intelligence covers about <strong>${new Intl.NumberFormat('en-IN',{maximumFractionDigits:1}).format(coverage)}%</strong> of the returned exposure`;
      if(weatherValue!==null&&weatherValue>0)weather+=`, with <strong>${analystFormat(weatherValueCol,weatherValue)}</strong> linked to elevated weather risk`;
      if(risk!==null)weather+=` and a trade-weighted weather risk score of <strong>${new Intl.NumberFormat('en-IN',{maximumFractionDigits:2}).format(risk)}</strong>`;
      parts.push(weather+'.');
    }else if(weatherCoverageCol)parts.push('Weather coverage is unavailable or zero for the returned exposure, so no weather risk is inferred.');
    parts.push('Decision focus: review the most concentrated commodity categories first, especially where transport dependence and external risk overlap.');
    return parts.join(' ');
   }
  }
 }
 const cleanedCortex=String(cortexText||'').replace(/this is our interpretation of your question[:\s-]*/ig,'').trim();
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
 const looksLikePlan=/^(which|show|rank|compare|find|list|calculate|explain)\b/i.test(cleanedCortex)||/\bcovering:|\binclude supplier|\bshow top\b/i.test(cleanedCortex);
 if(cleanedCortex&&!looksLikePlan)return e(cleanedCortex).replace(/\n/g,'<br>');
 return `I found <strong>${m.rows.length}</strong> governed records. Open the table and audit trail below for the supporting evidence.`;
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
function analystWorkspaceKey(identity=analystStorageIdentity||analystWorkspaceIdentity()){return `ontotrail_analyst_workspace_v2_${identity}`;}
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
  const raw=storage.getItem(analystWorkspaceKey(nextIdentity));
  analystWorkspace=normalizeAnalystWorkspace(raw?JSON.parse(raw):null);
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
      result:a.result?{columns:(a.result.columns||[]).slice(0,16),rows:(a.result.rows||[]).slice(0,12)}:null
    };
    block.dataset.analystContext=encodeURIComponent(JSON.stringify(compactContext));
  }catch{}
  clearTimeout(progressTimer1);clearTimeout(progressTimer2);setAnalystProgress(answerEl,'Preparing the governed answer…',3);const rid=`analyst-${Date.now()}`;const hasRows=Boolean(a.result?.rows?.length);const resultHtml=hasRows?`${analystFilters(a.result,rid)}${analystChart(a.result,rid,question)}${analystTable(a.result,rid)}`:'';
  const sql=a.sql?`<details class="analyst-sql"><summary>Audit trail · View generated SQL</summary><pre>${e(a.sql)}</pre></details>`:'';
  const warning=(a.executionWarning||a.fallbackUsed)?`<p class="analyst-warning">${e(a.executionWarning||'OntoTrail broadened the first zero-row cross-domain query so missing direct mappings can be distinguished from a true data failure.')}</p>`:'';
  const suggestions=a.suggestions?.length?`<div class="analyst-suggestions"><span>Explore next</span>${a.suggestions.map(s=>`<button type="button" data-question="${e(s)}">${e(s)}</button>`).join('')}</div>`:'';
  const narrative=analystNarrative(question,a.result||{columns:[],rows:[]},a.text||'');
  const rec=hasRows?recommendationFor(question,a.result):null;
  const decisionSeed=rec?{title:rec.title,problem:block.querySelector('.user-question')?.textContent?narrative.replace(/<[^>]+>/g,''):'',action:rec.action,owner:rec.owner,priority:'High',status:'Assigned',expectedImpact:rec.expectedImpact,source:'Cortex Analyst'}:null;
  if(decisionSeed)decisionInsights.set(rid,decisionSeed);
  const recHtml=rec&&(wantsRecommendation||/EXPOSURE|RISK|DELAY|SHORTAGE/i.test(question))?`<section class="recommendation-card"><span class="eyebrow">RECOMMENDED NEXT MOVE</span><h4>${e(rec.title)}</h4><p>${e(rec.action)}</p><div><span>Suggested owner</span><strong>${e(rec.owner)}</strong></div></section>`:'';
  const investigateQuestion=buildInvestigateQuestion(question,a);
  const scenarioSeed=buildScenarioSeed(question,a,narrative);
  const decisionBrief=decisionSeed?encodeAnalystPayload({seed:decisionSeed,meta:{semanticView:a.semanticView,intents:a.intents||[],rows:a.result?.rows?.length||0}}):'';
  const workflowActions=hasRows?`<div class="analyst-workflow-actions"><button class="secondary small" data-investigate-question="${e(investigateQuestion)}">${icon('network')}Investigate further</button><button class="secondary small" data-ai-scenario="${e(encodeAnalystPayload(scenarioSeed))}">${icon('sliders')}Create scenario</button>${decisionSeed?`<button class="secondary small" data-decision-brief="${e(decisionBrief)}">${icon('file')}Generate decision brief</button><button class="primary small" data-decision-insight="${e(rid)}" data-decision-seed="${e(encodeDecisionSeed(decisionSeed))}">${icon('check')}Create decision</button>`:''}</div>`:'';
  const grounding=analystGroundingPanel(a);
  const interpretation=analysisQuestion!==question?`<p class="query-split-note">I answered the analytical part with Cortex Analyst, then generated the recommended action from the returned evidence.</p>`:'';
  answerEl.innerHTML=`<div class="answer-heading">${icon('chat')}<strong>OntoTrail Intelligence</strong><span class="live-pill">LIVE · SNOWFLAKE CORTEX</span></div><p class="direct-answer" data-stream-text></p><div class="analyst-reveal" hidden>${interpretation}${recHtml}${workflowActions}${grounding}${resultHtml}${warning}${sql}${suggestions}<small>Grounded in ${e(a.semanticView||'ONTOTRAIL_TRADE_RISK_ANALYST')} · Request ${e(a.requestId||'Snowflake')}</small></div><div class="assistant-response-actions"><button class="chat-action" type="button" data-chat-copy aria-label="Copy response" title="Copy response">Copy</button><button class="chat-action" type="button" data-chat-retry aria-label="Try again" title="Try again">Try again</button></div>`;
  await revealNarrative(answerEl,narrative);
  const reveal=answerEl.querySelector('.analyst-reveal');if(reveal){reveal.hidden=false;requestAnimationFrame(()=>reveal.classList.add('visible'));}
 }catch(err){
  const local=answer(question,d,result);block.querySelector('.assistant-answer').innerHTML=`<div class="answer-heading">${icon('chat')}<strong>Local fallback · ${e(local.title)}</strong></div><p class="direct-answer">${e(local.text)}</p>${evidenceButtons(local.ids)}<small>Cortex Analyst unavailable: ${e(err.message||'connection error')}</small><div class="assistant-response-actions"><button class="chat-action" type="button" data-chat-copy aria-label="Copy response" title="Copy response">Copy</button><button class="chat-action" type="button" data-chat-retry aria-label="Try again" title="Try again">Try again</button></div>`;
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

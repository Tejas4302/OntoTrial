import {readSession} from '../lib/auth.js';
const headers={'Content-Type':'application/json','Cache-Control':'no-store'};
function send(res,status,body){res.statusCode=status;for(const [k,v] of Object.entries(headers))res.setHeader(k,v);res.end(JSON.stringify(body));}
function snowHeaders(pat){return {'Authorization':`Bearer ${pat}`,'X-Snowflake-Authorization-Token-Type':'PROGRAMMATIC_ACCESS_TOKEN','Content-Type':'application/json','Accept':'application/json','User-Agent':'OntoTrail/2.3'};}
function cleanBase(url){return String(url||'').trim().replace(/\/+$/,'');}
function errorText(body,status){const m=body?.message;if(typeof m==='string'&&m.trim())return m;if(m&&typeof m==='object')return JSON.stringify(m);if(typeof body?.error==='string'&&body.error.trim())return body.error;if(body?.code)return `${body.code}${body.sqlState?` (${body.sqlState})`:''}: SQL request failed.`;return `SQL failed (${status}).`;}
async function fetchWithTimeout(url,options={},timeoutMs=35000){const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeoutMs);try{return await fetch(url,{...options,signal:controller.signal});}finally{clearTimeout(timer);}}
function rows(body){const meta=body?.resultSetMetaData?.rowType||[];const cols=meta.map(c=>c.name);return (body?.data||[]).map(row=>Object.fromEntries(cols.map((n,i)=>[n,row[i]])));}
async function query(base,pat,warehouse,statement,label){
 const r=await fetchWithTimeout(`${base}/api/v2/statements`,{method:'POST',headers:snowHeaders(pat),body:JSON.stringify({statement,warehouse,timeout:25})},30000);
 let body=await r.json().catch(()=>({}));
 if(r.status===202&&body.statementHandle){for(let i=0;i<12;i++){await new Promise(x=>setTimeout(x,500));const p=await fetchWithTimeout(`${base}/api/v2/statements/${encodeURIComponent(body.statementHandle)}`,{headers:snowHeaders(pat)},10000);body=await p.json().catch(()=>({}));if(p.status===200)return rows(body);if(p.status!==202){const err=new Error(`${label}: ${errorText(body,p.status)}`);err.stage=label;throw err;}}const err=new Error(`${label}: Snowflake dashboard query timed out.`);err.stage=label;throw err;}
 if(!r.ok){const err=new Error(`${label}: ${errorText(body,r.status)}`);err.stage=label;throw err;}return rows(body);
}
const V='ONTOTRAIL.SUPPLY_CHAIN.INDIA_TRADE_RISK_ENRICHED';
const NOVA='ONTOTRAIL.SUPPLY_CHAIN.NOVA_MOBILITY_RISK_ENRICHED';
export default async function handler(req,res){
 if(req.method!=='GET'){res.setHeader('Allow','GET');return send(res,405,{error:'Method not allowed.'});}
 if(!readSession(req))return send(res,401,{error:'Authentication required.'});
 const pat=process.env.SNOWFLAKE_PAT,base=cleanBase(process.env.SNOWFLAKE_ACCOUNT_URL),warehouse=process.env.SNOWFLAKE_WAREHOUSE;
 if(!pat||!base||!warehouse)return send(res,500,{error:'Snowflake dashboard is not configured.'});
 try{
  const [summaryRows,originRows,commodityRows,weatherRows]=await Promise.all([
   query(base,pat,warehouse,`SELECT SUM(NOMINAL_TRADE_VALUE) IMPORT_VALUE_USD, SUM(NOMINAL_BY_SEA)/NULLIF(SUM(NOMINAL_TRADE_VALUE),0)*100 SEA_DEPENDENCY_PCT, SUM(IFF(WEATHER_DATA_AVAILABLE,NOMINAL_TRADE_VALUE,0))/NULLIF(SUM(NOMINAL_TRADE_VALUE),0)*100 WEATHER_COVERAGE_PCT, SUM(IFF(WEATHER_RISK_LEVEL IN ('MEDIUM','HIGH'),NOMINAL_TRADE_VALUE,0)) ELEVATED_WEATHER_RISK_VALUE_USD FROM ${V} WHERE TRADE_YEAR=2026 AND TRADE_DIRECTION='IMPORT'`,'summary'),
   query(base,pat,warehouse,`SELECT ORIGIN_ISO, MAX(ORIGIN_COUNTRY) ORIGIN_COUNTRY, SUM(NOMINAL_TRADE_VALUE) IMPORT_VALUE_USD, SUM(NOMINAL_BY_SEA)/NULLIF(SUM(NOMINAL_TRADE_VALUE),0)*100 SEA_DEPENDENCY_PCT, SUM(NOMINAL_BY_AIR)/NULLIF(SUM(NOMINAL_TRADE_VALUE),0)*100 AIR_DEPENDENCY_PCT, SUM(NOMINAL_BY_LAND)/NULLIF(SUM(NOMINAL_TRADE_VALUE),0)*100 LAND_DEPENDENCY_PCT, MAX(IFF(WEATHER_DATA_AVAILABLE,1,0)) WEATHER_AVAILABLE, MAX(WEATHER_RISK_SCORE) WEATHER_RISK_SCORE, MAX(WEATHER_RISK_LEVEL) WEATHER_RISK_LEVEL, MAX(AFFECTED_LOCATION_PCT) AFFECTED_LOCATION_PCT FROM ${V} WHERE TRADE_YEAR=2026 AND TRADE_DIRECTION='IMPORT' GROUP BY ORIGIN_ISO ORDER BY IMPORT_VALUE_USD DESC LIMIT 30`,'origins'),
   query(base,pat,warehouse,`SELECT CHAPTER, SUM(NOMINAL_TRADE_VALUE) IMPORT_VALUE_USD, SUM(NOMINAL_BY_SEA)/NULLIF(SUM(NOMINAL_TRADE_VALUE),0)*100 SEA_DEPENDENCY_PCT FROM ${V} WHERE TRADE_YEAR=2026 AND TRADE_DIRECTION='IMPORT' GROUP BY CHAPTER ORDER BY IMPORT_VALUE_USD DESC LIMIT 20`,'commodities'),
   query(base,pat,warehouse,`SELECT ORIGIN_ISO, MAX(ORIGIN_COUNTRY) ORIGIN_COUNTRY, MAX(WEATHER_RISK_SCORE) WEATHER_RISK_SCORE, MAX(WEATHER_RISK_LEVEL) WEATHER_RISK_LEVEL, MAX(AFFECTED_LOCATION_PCT) AFFECTED_LOCATION_PCT FROM ${V} WHERE TRADE_YEAR=2026 AND TRADE_DIRECTION='IMPORT' AND WEATHER_DATA_AVAILABLE GROUP BY ORIGIN_ISO ORDER BY WEATHER_RISK_SCORE DESC`,'weather')
  ]);
  const n=v=>v==null?null:Number(v);const summary=summaryRows[0]||{};
  let nova={available:false,error:'',summary:null,suppliers:[],purchaseOrders:[]};
  try{
    const [novaSummaryRows,novaSupplierRows,novaPoRows]=await Promise.all([
      query(base,pat,warehouse,`SELECT SUM(PO_VALUE_USD) OPEN_PO_VALUE_USD, COUNT(DISTINCT SUPPLIER_ID) SUPPLIER_COUNT, COUNT(DISTINCT PO_ID) PO_COUNT, COUNT_IF(PO_STATUS='DELAYED') DELAYED_PO_COUNT, COUNT_IF(DAYS_OF_COVER < 7) LOW_COVER_LINE_COUNT, MIN(DAYS_OF_COVER) MIN_DAYS_OF_COVER, SUM(IFF(WEATHER_RISK_LEVEL IN ('MEDIUM','HIGH'),PO_VALUE_USD,0)) WEATHER_LINKED_PO_VALUE_USD FROM ${NOVA}`,'nova-summary'),
      query(base,pat,warehouse,`SELECT SUPPLIER_ID, MAX(SUPPLIER_NAME) SUPPLIER_NAME, MAX(ORIGIN_COUNTRY) ORIGIN_COUNTRY, MAX(ORIGIN_ISO) ORIGIN_ISO, MAX(CATEGORY) CATEGORY, MAX(SUPPLIER_CRITICALITY) CRITICALITY, SUM(PO_VALUE_USD) PO_VALUE_USD, COUNT(DISTINCT PO_ID) PO_COUNT, COUNT_IF(PO_STATUS='DELAYED') DELAYED_PO_COUNT, MIN(DAYS_OF_COVER) MIN_DAYS_OF_COVER, MAX(WEATHER_RISK_LEVEL) WEATHER_RISK_LEVEL, MAX(WEATHER_RISK_SCORE) WEATHER_RISK_SCORE, MAX(MARKET_SEA_DEPENDENCY_PCT) MARKET_SEA_DEPENDENCY_PCT, MAX(IFF(MARKETPLACE_MATCH_AVAILABLE,1,0)) MARKETPLACE_MATCH_AVAILABLE FROM ${NOVA} GROUP BY SUPPLIER_ID ORDER BY PO_VALUE_USD DESC`,'nova-suppliers'),
      query(base,pat,warehouse,`SELECT PO_ID, SUPPLIER_NAME, ORIGIN_COUNTRY, MATERIAL_NAME, PLANT_NAME, PO_VALUE_USD, PO_STATUS, TRANSPORT_MODE, ETA_DATE, DAYS_OF_COVER, INVENTORY_RISK_LEVEL, WEATHER_RISK_LEVEL, OPERATIONAL_RISK_LEVEL, MARKETPLACE_MATCH_AVAILABLE FROM ${NOVA} QUALIFY ROW_NUMBER() OVER(PARTITION BY PO_ID ORDER BY SHIPMENT_ID NULLS LAST)=1 ORDER BY CASE OPERATIONAL_RISK_LEVEL WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END, PO_VALUE_USD DESC LIMIT 24`,'nova-pos')
    ]);
    const ns=novaSummaryRows[0]||{};
    nova={
      available:true,error:'',
      summary:{openPoValueUsd:n(ns.OPEN_PO_VALUE_USD),supplierCount:n(ns.SUPPLIER_COUNT),poCount:n(ns.PO_COUNT),delayedPoCount:n(ns.DELAYED_PO_COUNT),lowCoverLineCount:n(ns.LOW_COVER_LINE_COUNT),minDaysOfCover:n(ns.MIN_DAYS_OF_COVER),weatherLinkedPoValueUsd:n(ns.WEATHER_LINKED_PO_VALUE_USD)},
      suppliers:novaSupplierRows.map(r=>({supplierId:r.SUPPLIER_ID,supplierName:r.SUPPLIER_NAME,originCountry:r.ORIGIN_COUNTRY,originIso:r.ORIGIN_ISO,category:r.CATEGORY,criticality:r.CRITICALITY,poValueUsd:n(r.PO_VALUE_USD),poCount:n(r.PO_COUNT),delayedPoCount:n(r.DELAYED_PO_COUNT),minDaysOfCover:n(r.MIN_DAYS_OF_COVER),weatherRiskLevel:r.WEATHER_RISK_LEVEL,weatherRiskScore:n(r.WEATHER_RISK_SCORE),marketSeaDependencyPct:n(r.MARKET_SEA_DEPENDENCY_PCT),marketplaceMatchAvailable:Number(r.MARKETPLACE_MATCH_AVAILABLE)===1})),
      purchaseOrders:novaPoRows.map(r=>({poId:r.PO_ID,supplierName:r.SUPPLIER_NAME,originCountry:r.ORIGIN_COUNTRY,materialName:r.MATERIAL_NAME,plantName:r.PLANT_NAME,poValueUsd:n(r.PO_VALUE_USD),poStatus:r.PO_STATUS,transportMode:r.TRANSPORT_MODE,etaDate:r.ETA_DATE,daysOfCover:n(r.DAYS_OF_COVER),inventoryRiskLevel:r.INVENTORY_RISK_LEVEL,weatherRiskLevel:r.WEATHER_RISK_LEVEL,operationalRiskLevel:r.OPERATIONAL_RISK_LEVEL,marketplaceMatchAvailable:String(r.MARKETPLACE_MATCH_AVAILABLE).toLowerCase()==='true'||Number(r.MARKETPLACE_MATCH_AVAILABLE)===1}))
    };
  }catch(novaErr){
    console.warn('[trade-dashboard] Nova operations unavailable',{message:String(novaErr.message||novaErr)});
    nova={available:false,error:'Run snowflake/03_nova_mobility_internal_operations.sql to enable Nova Mobility operational data.',summary:null,suppliers:[],purchaseOrders:[]};
  }
  return send(res,200,{loading:false,error:'',summary:{importValueUsd:n(summary.IMPORT_VALUE_USD),seaDependencyPct:n(summary.SEA_DEPENDENCY_PCT),weatherCoveragePct:n(summary.WEATHER_COVERAGE_PCT),elevatedWeatherRiskValueUsd:n(summary.ELEVATED_WEATHER_RISK_VALUE_USD)},origins:originRows.map(r=>({originIso:r.ORIGIN_ISO,originCountry:r.ORIGIN_COUNTRY,importValueUsd:n(r.IMPORT_VALUE_USD),seaDependencyPct:n(r.SEA_DEPENDENCY_PCT),airDependencyPct:n(r.AIR_DEPENDENCY_PCT),landDependencyPct:n(r.LAND_DEPENDENCY_PCT),weatherAvailable:Number(r.WEATHER_AVAILABLE)===1,weatherRiskScore:n(r.WEATHER_RISK_SCORE),weatherRiskLevel:r.WEATHER_RISK_LEVEL,affectedLocationPct:n(r.AFFECTED_LOCATION_PCT)})),commodities:commodityRows.map(r=>({chapter:r.CHAPTER,importValueUsd:n(r.IMPORT_VALUE_USD),seaDependencyPct:n(r.SEA_DEPENDENCY_PCT)})),weather:weatherRows.map(r=>({originIso:r.ORIGIN_ISO,originCountry:r.ORIGIN_COUNTRY,weatherRiskScore:n(r.WEATHER_RISK_SCORE),weatherRiskLevel:r.WEATHER_RISK_LEVEL,affectedLocationPct:n(r.AFFECTED_LOCATION_PCT)})),nova});
 }catch(err){console.error('[trade-dashboard] failed',{stage:err.stage||'unknown',message:String(err.message||err)});return send(res,502,{error:String(err.message||'Could not load Snowflake trade dashboard.'),stage:err.stage||'unknown'});}
}
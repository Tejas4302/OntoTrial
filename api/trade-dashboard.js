import {readSession} from '../lib/auth.js';
const headers={'Content-Type':'application/json','Cache-Control':'no-store'};
function send(res,status,body){res.statusCode=status;for(const [k,v] of Object.entries(headers))res.setHeader(k,v);res.end(JSON.stringify(body));}
function snowHeaders(pat){return {'Authorization':`Bearer ${pat}`,'X-Snowflake-Authorization-Token-Type':'PROGRAMMATIC_ACCESS_TOKEN','Content-Type':'application/json','Accept':'application/json','User-Agent':'OntoTrail/2.3'};}
function cleanBase(url){return String(url||'').trim().replace(/\\/+$/,'');}
async function fetchWithTimeout(url,options={},timeoutMs=35000){const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeoutMs);try{return await fetch(url,{...options,signal:controller.signal});}finally{clearTimeout(timer);}}
function rows(body){const meta=body?.resultSetMetaData?.rowType||[];const cols=meta.map(c=>c.name);return (body?.data||[]).map(row=>Object.fromEntries(cols.map((n,i)=>[n,row[i]])));}
async function query(base,pat,warehouse,statement){
 const r=await fetchWithTimeout(`${base}/api/v2/statements`,{method:'POST',headers:snowHeaders(pat),body:JSON.stringify({statement,warehouse,timeout:25})},30000);
 let body=await r.json().catch(()=>({}));
 if(r.status===202&&body.statementHandle){for(let i=0;i<12;i++){await new Promise(x=>setTimeout(x,500));const p=await fetchWithTimeout(`${base}/api/v2/statements/${encodeURIComponent(body.statementHandle)}`,{headers:snowHeaders(pat)},10000);body=await p.json().catch(()=>({}));if(p.status===200)return rows(body);if(p.status!==202)throw Error(body.message||`SQL failed (${p.status}).`);}throw Error('Snowflake dashboard query timed out.');}
 if(!r.ok)throw Error(body.message||`SQL failed (${r.status}).`);return rows(body);
}
const V='ONTOTRAIL.SUPPLY_CHAIN.INDIA_TRADE_RISK_ENRICHED';
export default async function handler(req,res){
 if(req.method!=='GET'){res.setHeader('Allow','GET');return send(res,405,{error:'Method not allowed.'});}
 if(!readSession(req))return send(res,401,{error:'Authentication required.'});
 const pat=process.env.SNOWFLAKE_PAT,base=cleanBase(process.env.SNOWFLAKE_ACCOUNT_URL),warehouse=process.env.SNOWFLAKE_WAREHOUSE;
 if(!pat||!base||!warehouse)return send(res,500,{error:'Snowflake dashboard is not configured.'});
 try{
  const [summaryRows,originRows,commodityRows,weatherRows]=await Promise.all([
   query(base,pat,warehouse,`SELECT SUM(NOMINAL_TRADE_VALUE) IMPORT_VALUE_USD, SUM(NOMINAL_BY_SEA)/NULLIF(SUM(NOMINAL_TRADE_VALUE),0)*100 SEA_DEPENDENCY_PCT, SUM(IFF(WEATHER_DATA_AVAILABLE,NOMINAL_TRADE_VALUE,0))/NULLIF(SUM(NOMINAL_TRADE_VALUE),0)*100 WEATHER_COVERAGE_PCT, SUM(IFF(WEATHER_RISK_LEVEL IN ('MEDIUM','HIGH'),NOMINAL_TRADE_VALUE,0)) ELEVATED_WEATHER_RISK_VALUE_USD FROM ${V} WHERE TRADE_YEAR=2026 AND TRADE_DIRECTION='IMPORT'`),
   query(base,pat,warehouse,`SELECT ORIGIN_ISO, MAX(ORIGIN_COUNTRY) ORIGIN_COUNTRY, SUM(NOMINAL_TRADE_VALUE) IMPORT_VALUE_USD, SUM(NOMINAL_BY_SEA)/NULLIF(SUM(NOMINAL_TRADE_VALUE),0)*100 SEA_DEPENDENCY_PCT, SUM(NOMINAL_BY_AIR)/NULLIF(SUM(NOMINAL_TRADE_VALUE),0)*100 AIR_DEPENDENCY_PCT, SUM(NOMINAL_BY_LAND)/NULLIF(SUM(NOMINAL_TRADE_VALUE),0)*100 LAND_DEPENDENCY_PCT, MAX(IFF(WEATHER_DATA_AVAILABLE,1,0)) WEATHER_AVAILABLE, MAX(WEATHER_RISK_SCORE) WEATHER_RISK_SCORE, MAX(WEATHER_RISK_LEVEL) WEATHER_RISK_LEVEL, MAX(AFFECTED_LOCATION_PCT) AFFECTED_LOCATION_PCT FROM ${V} WHERE TRADE_YEAR=2026 AND TRADE_DIRECTION='IMPORT' GROUP BY ORIGIN_ISO ORDER BY IMPORT_VALUE_USD DESC LIMIT 30`),
   query(base,pat,warehouse,`SELECT CHAPTER, SUM(NOMINAL_TRADE_VALUE) IMPORT_VALUE_USD, SUM(NOMINAL_BY_SEA)/NULLIF(SUM(NOMINAL_TRADE_VALUE),0)*100 SEA_DEPENDENCY_PCT FROM ${V} WHERE TRADE_YEAR=2026 AND TRADE_DIRECTION='IMPORT' GROUP BY CHAPTER ORDER BY IMPORT_VALUE_USD DESC LIMIT 20`),
   query(base,pat,warehouse,`SELECT ORIGIN_ISO, MAX(ORIGIN_COUNTRY) ORIGIN_COUNTRY, MAX(WEATHER_RISK_SCORE) WEATHER_RISK_SCORE, MAX(WEATHER_RISK_LEVEL) WEATHER_RISK_LEVEL, MAX(AFFECTED_LOCATION_PCT) AFFECTED_LOCATION_PCT FROM ${V} WHERE TRADE_YEAR=2026 AND TRADE_DIRECTION='IMPORT' AND WEATHER_DATA_AVAILABLE GROUP BY ORIGIN_ISO ORDER BY WEATHER_RISK_SCORE DESC`)
  ]);
  const n=v=>v==null?null:Number(v);const summary=summaryRows[0]||{};
  return send(res,200,{loading:false,error:'',summary:{importValueUsd:n(summary.IMPORT_VALUE_USD),seaDependencyPct:n(summary.SEA_DEPENDENCY_PCT),weatherCoveragePct:n(summary.WEATHER_COVERAGE_PCT),elevatedWeatherRiskValueUsd:n(summary.ELEVATED_WEATHER_RISK_VALUE_USD)},origins:originRows.map(r=>({originIso:r.ORIGIN_ISO,originCountry:r.ORIGIN_COUNTRY,importValueUsd:n(r.IMPORT_VALUE_USD),seaDependencyPct:n(r.SEA_DEPENDENCY_PCT),airDependencyPct:n(r.AIR_DEPENDENCY_PCT),landDependencyPct:n(r.LAND_DEPENDENCY_PCT),weatherAvailable:Number(r.WEATHER_AVAILABLE)===1,weatherRiskScore:n(r.WEATHER_RISK_SCORE),weatherRiskLevel:r.WEATHER_RISK_LEVEL,affectedLocationPct:n(r.AFFECTED_LOCATION_PCT)})),commodities:commodityRows.map(r=>({chapter:r.CHAPTER,importValueUsd:n(r.IMPORT_VALUE_USD),seaDependencyPct:n(r.SEA_DEPENDENCY_PCT)})),weather:weatherRows.map(r=>({originIso:r.ORIGIN_ISO,originCountry:r.ORIGIN_COUNTRY,weatherRiskScore:n(r.WEATHER_RISK_SCORE),weatherRiskLevel:r.WEATHER_RISK_LEVEL,affectedLocationPct:n(r.AFFECTED_LOCATION_PCT)}))});
 }catch(err){return send(res,502,{error:err.message||'Could not load Snowflake trade dashboard.'});}
}
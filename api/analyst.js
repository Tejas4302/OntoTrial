import {readSession} from '../lib/auth.js';
const MAX_QUESTION=500;
const headers={'Content-Type':'application/json','Cache-Control':'no-store'};

function send(res,status,body){res.statusCode=status;for(const [k,v] of Object.entries(headers))res.setHeader(k,v);res.end(JSON.stringify(body));}
function snowHeaders(pat){return {'Authorization':`Bearer ${pat}`,'X-Snowflake-Authorization-Token-Type':'PROGRAMMATIC_ACCESS_TOKEN','Content-Type':'application/json','Accept':'application/json','User-Agent':'OntoTrail/2.0'};}
function cleanBase(url){return String(url||'').trim().replace(/\/+$/,'');}
function safeSelect(sql){
  const s=String(sql||'').trim().replace(/;+\s*$/,'');
  if(!/^(select|with)\b/i.test(s))return null;
  if(/;\s*\S/.test(s))return null;
  if(/\b(insert|update|delete|merge|alter|drop|create|truncate|grant|revoke|call|put|get|remove|copy)\b/i.test(s))return null;
  return s;
}
function normalizeAnalyst(body){
  const content=body?.message?.content||[];
  const text=content.filter(x=>x?.type==='text').map(x=>x.text).filter(Boolean).join('\n\n');
  const sql=content.find(x=>x?.type==='sql')?.statement||'';
  const suggestions=content.filter(x=>x?.type==='suggestions').flatMap(x=>x.suggestions||[]).filter(Boolean).slice(0,6);
  return {text,sql,suggestions};
}
function normalizeRows(body){
  const meta=body?.resultSetMetaData?.rowType||[];
  const columns=meta.map(c=>c.name);
  const rows=(body?.data||[]).slice(0,100).map(row=>Object.fromEntries(columns.map((name,i)=>[name,row[i]])));
  return {columns,rows,truncated:(body?.data||[]).length>100};
}
async function fetchWithTimeout(url,options={},timeoutMs=45000){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{return await fetch(url,{...options,signal:controller.signal});}
  finally{clearTimeout(timer);}
}
async function executeSql(base,pat,warehouse,sql){
  const response=await fetchWithTimeout(`${base}/api/v2/statements`,{method:'POST',headers:snowHeaders(pat),body:JSON.stringify({statement:sql,warehouse,timeout:30})},35000);
  let body=await response.json().catch(()=>({}));
  if(response.status===202&&body.statementHandle){
    for(let i=0;i<10;i++){
      await new Promise(r=>setTimeout(r,700));
      const poll=await fetchWithTimeout(`${base}/api/v2/statements/${encodeURIComponent(body.statementHandle)}`,{headers:snowHeaders(pat)},12000);
      body=await poll.json().catch(()=>({}));
      if(poll.status===200)return normalizeRows(body);
      if(poll.status!==202)throw Error(body.message||`SQL execution failed (${poll.status}).`);
    }
    throw Error('Snowflake query is still running. Please try again.');
  }
  if(!response.ok)throw Error(body.message||body.code||`SQL execution failed (${response.status}).`);
  return normalizeRows(body);
}

export default async function handler(req,res){
  if(req.method!=='POST'){res.setHeader('Allow','POST');return send(res,405,{error:'Method not allowed.'});}
  if(!readSession(req))return send(res,401,{error:'Authentication required.'});

  const pat=process.env.SNOWFLAKE_PAT;
  const base=cleanBase(process.env.SNOWFLAKE_ACCOUNT_URL);
  const tradeSemanticView=process.env.SNOWFLAKE_SEMANTIC_VIEW;
  const novaSemanticView=process.env.SNOWFLAKE_NOVA_SEMANTIC_VIEW||'ONTOTRAIL.SUPPLY_CHAIN.ONTOTRAIL_NOVA_MOBILITY_ANALYST';
  const warehouse=process.env.SNOWFLAKE_WAREHOUSE;
  if(!pat||!base||!tradeSemanticView||!warehouse)return send(res,500,{error:'OntoTrail AI is not fully configured.'});

  const question=String(req.body?.question||'').trim();
  if(!question||question.length>MAX_QUESTION)return send(res,400,{error:`Enter a question between 1 and ${MAX_QUESTION} characters.`});

  const rowIntent=/\b(rest of world|row)\b/i.test(question);
  const responseGuidance=[
    "Answer the user's exact business question, not merely the shape of the returned table.",
    "Lead with a concise executive answer, then explain the most decision-relevant drivers.",
    "When the question asks about exposure, concentration, dependency or risk, explicitly cover the requested dimensions when data is available (for example commodity concentration, transport dependency and weather risk).",
    "Use business-readable labels and units. Avoid database-style phrasing such as 'OVERALL has the leading metric' unless the user explicitly asks for a ranking.",
    "Do not invent data that is absent from the semantic view or result set. Clearly state when a requested dimension is unavailable."
  ].join(" ");
  const rowGuidance=rowIntent
    ? " Governed interpretation: Rest of World/ROW is the aggregate origin identified by ORIGIN_ISO = 'ROW'. You MUST filter ORIGIN_ISO = 'ROW' and must not replace it with a ranking of other countries. If the question asks for commodity concentration, include a commodity breakdown rather than only a commodity count. Treat ROW as an aggregate geography; only report weather if aggregate-row coverage exists and do not infer weather from constituent countries."
    : "";
  const compositeTradeIntent=/\b(import|export|trade)\b/i.test(question)&&/\b(exposure|dependenc|concentrat|risk|explain)\b/i.test(question)
    &&(/\bcommodity|product|hs4|chapter|heading\b/i.test(question)||/\btransport|sea|air|land\b/i.test(question)||/\bweather\b/i.test(question));
  const compositeGuidance=compositeTradeIntent
    ? " This is a multi-dimensional trade-risk question. Generate one governed analytical query that preserves the requested geography and year filters and returns a commodity breakdown (prefer COMMODITY_CHAPTER or COMMODITY_HEADING) together with IMPORT_VALUE_USD or EXPORT_VALUE_USD as appropriate, SEA_DEPENDENCY_PCT, AIR_DEPENDENCY_PCT, LAND_DEPENDENCY_PCT, WEATHER_COVERAGE_PCT, ELEVATED_WEATHER_RISK_TRADE_VALUE_USD and TRADE_WEIGHTED_WEATHER_RISK_SCORE when available. Do not collapse the answer to one scalar total. In the text answer, state the total exposure, identify the top commodity concentrations, summarize the transport mix, and explain weather coverage/risk with clear caveats."
    : "";
  const governedQuestion=question+"\n\nResponse requirements: "+responseGuidance+rowGuidance+compositeGuidance;
  const novaIntent=/\b(nova|supplier|vendor|purchase order|\bpo\b|inventory|days? of cover|stock cover|shipment|material|component|plant|delayed po|operational risk)\b/i.test(question);
  const semanticView=novaIntent?novaSemanticView:tradeSemanticView;

  try{
    const analyst=await fetchWithTimeout(`${base}/api/v2/cortex/analyst/message`,{
      method:'POST',
      headers:snowHeaders(pat),
      body:JSON.stringify({
        messages:[{role:'user',content:[{type:'text',text:governedQuestion}]}],
        semantic_view:semanticView,
        stream:false
      })
    },50000);

    const body=await analyst.json().catch(()=>({}));
    if(!analyst.ok)return send(res,502,{
      error:body.message||body.error||`Snowflake Cortex Analyst returned ${analyst.status}.`,
      requestId:body.request_id||analyst.headers.get('x-snowflake-request-id')||''
    });

    const parsed=normalizeAnalyst(body);
    let result=null;
    let executionWarning='';
    const sql=safeSelect(parsed.sql);
    if(sql){
      try{result=await executeSql(base,pat,warehouse,sql);}
      catch(err){executionWarning=err.message||'The generated SQL could not be executed.';}
    }

    return send(res,200,{
      source:'snowflake-cortex-analyst',
      requestId:body.request_id||analyst.headers.get('x-snowflake-request-id')||'',
      semanticView,
      semanticDomain:novaIntent?'nova-operations':'india-trade-risk',
      warehouse,
      text:parsed.text,
      sql:sql||'',
      suggestions:parsed.suggestions,
      result,
      executionWarning
    });
  }catch(err){
    const timedOut=err?.name==='AbortError';
    return send(res,502,{error:timedOut?'Snowflake Cortex Analyst timed out. Please try again.':(err?.message||'Could not reach Snowflake Cortex Analyst.')});
  }
}

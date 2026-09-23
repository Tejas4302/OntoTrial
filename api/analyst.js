import {readSession} from '../lib/auth.js';
import {DATASET_DOMAINS,classifyQuestion,buildDatasetGuidance} from './intelligence-map.js';
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
  const rawContext=req.body?.context&&typeof req.body.context==='object'?req.body.context:null;
  const previousQuestion=String(rawContext?.previousQuestion||'').trim().slice(0,500);
  const previousAnswer=String(rawContext?.previousAnswer||'').trim().slice(0,1200);
  const previousGrounding=String(rawContext?.previousGrounding||'').trim().slice(0,320);
  const hasFollowupContext=Boolean(previousQuestion||previousAnswer);
  const followupSignal=/\b(this|that|these|those|it|they|them|affect|impact|follow[- ]?up|what about|how about|operations?|suppliers?|materials?|plants?|purchase orders?|shipments?)\b/i.test(question);
  const classificationQuestion=hasFollowupContext&&followupSignal
    ? `${previousQuestion}\nFOLLOW-UP: ${question}`
    : question;

  const classification=classifyQuestion(classificationQuestion);
  const domain=classification.domain;
  const intents=classification.intents;
  const profile=DATASET_DOMAINS[domain]||DATASET_DOMAINS.trade;
  const semanticView=domain==='nova'
    ? (novaSemanticView||profile.defaultSemanticView)
    : (tradeSemanticView||profile.defaultSemanticView);
  const rowIntent=/\b(rest of world|row)\b/i.test(classificationQuestion);
  const rowGuidance=rowIntent
    ? "Governed ROW rule: Rest of World/ROW is ORIGIN_ISO = 'ROW'. Filter that aggregate directly. Do not substitute a ranking of other countries. Only report weather for ROW when aggregate-row weather coverage exists."
    : "";
  const datasetGuidance=buildDatasetGuidance(classificationQuestion,domain,intents);
  const seaDependencyRankIntent=domain==='trade'&&(
    /\bmost\s+dependent\s+on\s+sea\b/i.test(question)||
    /\bhighest\s+sea\s+dependenc/i.test(question)||
    /\bsea[- ]dependent\b/i.test(question)||
    /\bdependent\s+on\s+sea\s+transport\b/i.test(question)
  );
  const dependencyGuidance=seaDependencyRankIntent
    ? [
        'STRICT TRANSPORT DEPENDENCY RULE',
        'The user is asking for dependency, not absolute sea trade value.',
        'Rank the relevant India import commodity/origin rows by SEA_DEPENDENCY_PCT descending.',
        'Do NOT rank by TOTAL_SEA_TRADE_VALUE_USD.',
        'Return SEA_DEPENDENCY_PCT in the result and include IMPORT_VALUE_USD as secondary context when available.',
        'Apply TRADE_DIRECTION = IMPORT and the requested TRADE_YEAR.',
        'Use a business-readable commodity dimension such as COMMODITY_CHAPTER or COMMODITY_HEADING when the user asks which imports.'
      ].join('\n')
    : '';
  const conversationContext=hasFollowupContext
    ? [
        'ONTO TRAIL CONVERSATION CONTEXT',
        previousQuestion?`Previous user question: ${previousQuestion}`:'',
        previousAnswer?`Previous governed answer: ${previousAnswer}`:'',
        previousGrounding?`Previous grounding: ${previousGrounding}`:'',
        'Interpret the current question as a follow-up to the previous turn. Preserve the earlier finding as context, but only claim an operational impact where the current semantic view has governed evidence. If there is no direct Nova mapping, say so explicitly instead of returning an empty or fabricated answer.'
      ].filter(Boolean).join('\n')
    : '';
  const governedQuestion=[
    question,
    conversationContext,
    dependencyGuidance,
    "",
    "ONTO TRAIL GOVERNED DATASET INSTRUCTIONS",
    datasetGuidance,
    rowGuidance
  ].filter(Boolean).join("\n");

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

    let parsed=normalizeAnalyst(body);
    let result=null;
    let executionWarning='';
    let fallbackUsed=false;
    let sql=safeSelect(parsed.sql);
    if(sql){
      try{result=await executeSql(base,pat,warehouse,sql);}
      catch(err){executionWarning=err.message||'The generated SQL could not be executed.';}
    }

    const resultColumns=(result?.columns||[]).map(c=>String(c).toUpperCase());
    const needsSeaDependencyRetry=seaDependencyRankIntent&&result?.rows?.length&&!resultColumns.some(c=>c.includes('SEA_DEPENDENCY_PCT'));
    if(needsSeaDependencyRetry){
      const retryQuestion=[
        question,
        '',
        'ONTO TRAIL TRANSPORT DEPENDENCY RETRY',
        'The prior result did not return SEA_DEPENDENCY_PCT, so it cannot answer a dependency-ranking question correctly.',
        'Return COMMODITY_CHAPTER or COMMODITY_HEADING, SEA_DEPENDENCY_PCT, and IMPORT_VALUE_USD for India imports in the requested year.',
        'Order by SEA_DEPENDENCY_PCT descending. Do not order by TOTAL_SEA_TRADE_VALUE_USD.',
        datasetGuidance
      ].join('\n');
      try{
        const retry=await fetchWithTimeout(`${base}/api/v2/cortex/analyst/message`,{
          method:'POST',
          headers:snowHeaders(pat),
          body:JSON.stringify({
            messages:[{role:'user',content:[{type:'text',text:retryQuestion}]}],
            semantic_view:semanticView,
            stream:false
          })
        },50000);
        const retryBody=await retry.json().catch(()=>({}));
        if(retry.ok){
          const retryParsed=normalizeAnalyst(retryBody);
          const retrySql=safeSelect(retryParsed.sql);
          if(retrySql){
            const retryResult=await executeSql(base,pat,warehouse,retrySql);
            const retryCols=(retryResult?.columns||[]).map(c=>String(c).toUpperCase());
            if(retryResult?.rows?.length&&retryCols.some(c=>c.includes('SEA_DEPENDENCY_PCT'))){
              parsed=retryParsed;
              sql=retrySql;
              result=retryResult;
              fallbackUsed=true;
              executionWarning='';
            }
          }
        }
      }catch{}
    }

    const needsCrossDomainFallback=domain==='nova'&&
      intents.some(x=>['cross_domain','nova_weather_risk'].includes(x.id))&&
      (!result?.rows?.length);
    if(needsCrossDomainFallback){
      const weatherSpecific=intents.some(x=>x.id==='nova_weather_risk')||/\bweather\b/i.test(classificationQuestion);
      const fallbackQuestion=[
        question,
        conversationContext,
        '',
        'ONTO TRAIL CROSS-DOMAIN FALLBACK RULE',
        'The first Nova query returned no rows. Do not treat that as proof that the external signal has no operational relevance.',
        'Return the relevant Nova supplier/material/PO/plant records needed to evaluate whether the previous external trade, transport or weather finding maps to Nova operations.',
        'Include SUPPLIER_NAME, ORIGIN_COUNTRY, SUPPLIER_TIER, SUPPLIER_CRITICALITY and MARKETPLACE_MATCH_STATUS where available.',
        'Include TOTAL_PO_VALUE_USD, MINIMUM_DAYS_OF_COVER, DELAYED_PO_VALUE_USD and AVERAGE_MARKET_SEA_DEPENDENCY_PCT where available.',
        weatherSpecific?'Also include WEATHER_RISK_LEVEL and WEATHER_LINKED_PO_VALUE_USD where available. Do not filter out LOW or unavailable weather coverage.':'Do not require an elevated weather condition unless the user explicitly asked for weather.',
        'If the external countries or aggregates from the previous answer do not directly map to a Nova supplier, return the relevant Nova records and clearly state that there is no direct mapping instead of returning an empty result.',
        datasetGuidance
      ].filter(Boolean).join('\n');
      try{
        const retry=await fetchWithTimeout(`${base}/api/v2/cortex/analyst/message`,{
          method:'POST',
          headers:snowHeaders(pat),
          body:JSON.stringify({
            messages:[{role:'user',content:[{type:'text',text:fallbackQuestion}]}],
            semantic_view:semanticView,
            stream:false
          })
        },50000);
        const retryBody=await retry.json().catch(()=>({}));
        if(retry.ok){
          const retryParsed=normalizeAnalyst(retryBody);
          const retrySql=safeSelect(retryParsed.sql);
          if(retrySql){
            const retryResult=await executeSql(base,pat,warehouse,retrySql);
            if(retryResult?.rows?.length){
              parsed=retryParsed;
              sql=retrySql;
              result=retryResult;
              fallbackUsed=true;
              executionWarning='';
            }
          }
        }
      }catch{}
    }

    const materialRiskCols=result?.columns||[];
    const materialHighRiskCol=materialRiskCols.find(c=>/HIGH_OPERATIONAL_RISK_PO_VALUE_USD/i.test(String(c)));
    const materialSupportPresent=materialRiskCols.some(c=>/TOTAL_PO_VALUE_USD|MINIMUM_DAYS_OF_COVER|DELAYED_PO_VALUE_USD|OUTSTANDING_QUANTITY/i.test(String(c)));
    const allMaterialHighRiskZero=materialHighRiskCol&&result?.rows?.length&&result.rows.every(r=>Number(r[materialHighRiskCol]||0)===0);
    const needsMaterialContextFallback=domain==='nova'&&
      intents.some(x=>x.id==='material_risk')&&
      allMaterialHighRiskZero&&!materialSupportPresent;
    if(needsMaterialContextFallback){
      const fallbackQuestion=[
        question,
        '',
        'ONTO TRAIL ZERO-RISK CONTEXT RULE',
        'The requested HIGH_OPERATIONAL_RISK_PO_VALUE_USD metric is zero across all returned materials.',
        'Do not rank zero values as if one material is riskier than another.',
        'Return the material context needed to explain what still warrants monitoring.',
        'Include MATERIAL_NAME and MATERIAL_CRITICALITY.',
        'Include HIGH_OPERATIONAL_RISK_PO_VALUE_USD, TOTAL_PO_VALUE_USD, MINIMUM_DAYS_OF_COVER, DELAYED_PO_VALUE_USD and OUTSTANDING_QUANTITY where available.',
        'Return at least the relevant materials even when HIGH_OPERATIONAL_RISK_PO_VALUE_USD is zero.',
        datasetGuidance
      ].join('\n');
      try{
        const retry=await fetchWithTimeout(`${base}/api/v2/cortex/analyst/message`,{
          method:'POST',
          headers:snowHeaders(pat),
          body:JSON.stringify({
            messages:[{role:'user',content:[{type:'text',text:fallbackQuestion}]}],
            semantic_view:semanticView,
            stream:false
          })
        },50000);
        const retryBody=await retry.json().catch(()=>({}));
        if(retry.ok){
          const retryParsed=normalizeAnalyst(retryBody);
          const retrySql=safeSelect(retryParsed.sql);
          if(retrySql){
            const retryResult=await executeSql(base,pat,warehouse,retrySql);
            if(retryResult?.rows?.length){
              parsed=retryParsed;
              sql=retrySql;
              result=retryResult;
              fallbackUsed=true;
              executionWarning='';
            }
          }
        }
      }catch{}
    }

    return send(res,200,{
      source:'snowflake-cortex-analyst',
      requestId:body.request_id||analyst.headers.get('x-snowflake-request-id')||'',
      semanticView,
      semanticDomain:domain==='nova'?'nova-operations':'india-trade-risk',
      intents:intents.map(x=>x.id),
      datasetCoverage:{dimensions:profile.dimensions.length,metrics:profile.metrics.length},
      warehouse,
      text:parsed.text,
      sql:sql||'',
      suggestions:parsed.suggestions,
      result,
      fallbackUsed,
      followupContextUsed:hasFollowupContext,
      executionWarning
    });
  }catch(err){
    const timedOut=err?.name==='AbortError';
    return send(res,502,{error:timedOut?'Snowflake Cortex Analyst timed out. Please try again.':(err?.message||'Could not reach Snowflake Cortex Analyst.')});
  }
}

import {readSession} from '../lib/auth.js';
import {DATASET_DOMAINS,classifyQuestion,buildDatasetGuidance,resolveQuestionPlan} from './intelligence-map.js';
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
  const previousResult=rawContext?.previousResult&&typeof rawContext.previousResult==='object'?rawContext.previousResult:null;
  const previousRows=Array.isArray(previousResult?.result?.rows)?previousResult.result.rows.slice(0,12):[];
  const previousColumns=Array.isArray(previousResult?.result?.columns)?previousResult.result.columns.slice(0,16):[];
  const previousPlan=previousResult?.queryPlan&&typeof previousResult.queryPlan==='object'?previousResult.queryPlan:null;
  const previousIntents=Array.isArray(previousResult?.intents)?previousResult.intents.slice(0,8):[];
  const hasFollowupContext=Boolean(previousQuestion||previousAnswer||previousRows.length||previousPlan);
  const plan=resolveQuestionPlan(question,{
    previousQuestion,
    previousPlan,
    previousIntents,
    previousColumns,
    hasRows:previousRows.length>0
  });

  if(plan.type==='needs_context'){
    return send(res,200,{
      source:'ontotrail-conversation-router',
      requestId:'needs-context',
      semanticView:'',
      semanticDomain:'conversation',
      intents:['needs_context'],
      datasetCoverage:{dimensions:0,metrics:0},
      warehouse,
      text:'I need the prior finding you want me to connect to Nova Mobility operations. Ask this as a follow-up in the same chat after a trade, transport, weather, supplier or material question.',
      sql:'',
      suggestions:[
        'Which India imports are most dependent on sea transport in 2026?',
        'Which origins have the highest elevated weather-risk trade exposure?',
        'Which Nova suppliers have the highest operational risk?'
      ],
      result:null,
      queryPlan:plan,
      needsContext:true,
      fallbackUsed:false,
      followupContextUsed:false,
      executionWarning:''
    });
  }

  const followupSignal=/\b(this|that|these|those|it|they|them|affect|impact|follow[- ]?up|what about|how about|operations?|suppliers?|materials?|plants?|purchase orders?|shipments?)\b/i.test(question);
  const classificationQuestion=hasFollowupContext&&followupSignal
    ? `${previousQuestion}\nFOLLOW-UP: ${question}`
    : question;

  const classification=classifyQuestion(classificationQuestion);
  const operationalFollowup=plan.type==='operational_impact_followup';
  const domain=plan.domain||classification.domain;
  let intents=classification.intents;
  if(operationalFollowup&&!intents.some(x=>x.id==='cross_domain')){
    const cross=classifyQuestion(`${previousQuestion}\nFOLLOW-UP: Nova operations ${question}`).intents.find(x=>x.id==='cross_domain');
    if(cross)intents=[cross,...intents];
  }
  const profile=DATASET_DOMAINS[domain]||DATASET_DOMAINS.trade;
  const semanticView=domain==='nova'
    ? (novaSemanticView||profile.defaultSemanticView)
    : (tradeSemanticView||profile.defaultSemanticView);
  const rowIntent=/\b(rest of world|row)\b/i.test(classificationQuestion);
  const rowGuidance=rowIntent
    ? "Governed ROW rule: Rest of World/ROW is ORIGIN_ISO = 'ROW'. Filter that aggregate directly. Do not substitute a ranking of other countries. Only report weather for ROW when aggregate-row weather coverage exists."
    : "";
  const datasetGuidance=buildDatasetGuidance(classificationQuestion,domain,intents);
  const dependencyGuidance=plan.type==='transport_dependency_ranking'
    ? [
        'STRICT TRANSPORT DEPENDENCY RULE',
        `The user is asking for ${plan.mode} dependency, not absolute ${plan.mode} trade value.`,
        `Rank by ${plan.metric} ${plan.order==='asc'?'ascending':'descending'}.`,
        `Use ${plan.valueMetric} only as secondary exposure context.`,
        plan.direction?`Apply TRADE_DIRECTION = ${plan.direction}.`:'',
        plan.year?`Apply TRADE_YEAR = ${plan.year}.`:'',
        plan.grain==='origin'?'Use origin country as the ranking dimension.':'Use a business-readable commodity heading plus HS4 for traceability.'
      ].filter(Boolean).join('\n')
    : '';
  const conversationContext=hasFollowupContext
    ? [
        'ONTO TRAIL CONVERSATION CONTEXT',
        previousQuestion?`Previous user question: ${previousQuestion}`:'',
        previousAnswer?`Previous governed answer: ${previousAnswer}`:'',
        previousGrounding?`Previous grounding: ${previousGrounding}`:'',
        'Interpret the current question as a follow-up to the previous turn. In this workspace, phrases such as "our operations" refer to Nova Mobility operations. Preserve the earlier external finding as context, then test it against Nova suppliers, materials, purchase orders, plants, shipments and inventory. Only claim an operational impact where the current Nova semantic view has governed evidence. If there is no direct mapping, say so explicitly instead of returning an empty or fabricated answer.'
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
    if(plan.type==='transport_dependency_ranking'&&plan.year&&plan.direction){
      const semanticMetric={
        SEA_DEPENDENCY_PCT:'trade_risk.sea_dependency_pct',
        AIR_DEPENDENCY_PCT:'trade_risk.air_dependency_pct',
        LAND_DEPENDENCY_PCT:'trade_risk.land_dependency_pct'
      }[plan.metric];
      const semanticValueMetric=plan.direction==='EXPORT'?'trade_risk.export_value_usd':'trade_risk.import_value_usd';
      const dims=plan.grain==='origin'
        ? ['trade_risk.origin_iso','trade_risk.origin_country','trade_risk.trade_year','trade_risk.trade_direction']
        : ['trade_risk.hs4_code','trade_risk.commodity_heading','trade_risk.trade_year','trade_risk.trade_direction'];
      const traceAlias=plan.grain==='origin'?'ORIGIN_ISO':'HS4_CODE';
      const orderDir=plan.order==='asc'?'ASC':'DESC';
      const deterministicSql=`SELECT * FROM SEMANTIC_VIEW(
  ${tradeSemanticView}
  METRICS ${semanticMetric},
          ${semanticValueMetric}
  DIMENSIONS ${dims.join(',\n             ')}
  WHERE trade_risk.trade_year = ${Number(plan.year)}
    AND trade_risk.trade_direction = '${plan.direction}'
)
ORDER BY ${plan.metric} ${orderDir}, ${plan.valueMetric} DESC, ${traceAlias} ASC
LIMIT 10`;
      const result=await executeSql(base,pat,warehouse,deterministicSql);
      return send(res,200,{
        source:'snowflake-governed-plan',
        requestId:`transport-dependency-${plan.mode}-${plan.year}-${plan.direction.toLowerCase()}`,
        semanticView:tradeSemanticView,
        semanticDomain:'india-trade-risk',
        intents:['transport_dependency'],
        datasetCoverage:{dimensions:DATASET_DOMAINS.trade.dimensions.length,metrics:DATASET_DOMAINS.trade.metrics.length},
        warehouse,
        text:`Governed ${plan.mode}-dependency ranking using ${plan.metric}.`,
        sql:deterministicSql,
        suggestions:[
          'How will this affect our operations?',
          plan.grain==='origin'?'Which commodities drive these origins?':'Which of these categories have the largest import exposure?',
          'Show the corresponding transport dependency and exposure together.'
        ],
        result,
        queryPlan:plan,
        fallbackUsed:false,
        followupContextUsed:hasFollowupContext,
        executionWarning:''
      });
    }

    if(plan.type==='operational_impact_followup'){
      const mappings=[
        {source:/^ORIGIN_COUNTRY$/i,target:'nova.origin_country',label:'ORIGIN_COUNTRY'},
        {source:/^HS4_CODE$|^HS4_STR$|^HS4$/i,target:'nova.hs4_code',label:'HS4_CODE'},
        {source:/^COMMODITY_GROUP$/i,target:'nova.commodity_group',label:'COMMODITY_GROUP'}
      ];
      const clauses=[];
      const mappingKeys=[];
      for(const map of mappings){
        const sourceCol=previousColumns.find(c=>map.source.test(String(c)));
        if(!sourceCol)continue;
        const values=[...new Set(previousRows.map(row=>String(row?.[sourceCol]??'').trim()).filter(Boolean))].slice(0,12);
        if(!values.length)continue;
        const safe=values.map(v=>`'${v.replace(/'/g,"''")}'`).join(',');
        clauses.push(`${map.target} IN (${safe})`);
        mappingKeys.push({sourceColumn:sourceCol,targetDimension:map.target,values});
      }

      if(!mappingKeys.length){
        return send(res,200,{
          source:'ontotrail-context-mapper',
          requestId:'operational-impact-no-shared-key',
          semanticView:novaSemanticView,
          semanticDomain:'nova-operations',
          intents:['cross_domain'],
          datasetCoverage:{dimensions:DATASET_DOMAINS.nova.dimensions.length,metrics:DATASET_DOMAINS.nova.metrics.length},
          warehouse,
          text:'I can see the previous governed result, but it does not contain a shared key such as origin country or HS4 that can be safely mapped into Nova Mobility operations. I will not invent a relationship.',
          sql:'',
          suggestions:[
            'Break the previous result down by origin country.',
            'Show the previous result by HS4 commodity.',
            'Which Nova suppliers have the highest operational risk?'
          ],
          result:null,
          queryPlan:{...plan,type:'operational_impact',mappingKeys:[]},
          needsMapping:true,
          fallbackUsed:false,
          followupContextUsed:true,
          executionWarning:''
        });
      }

      const matchExpression=clauses.length===1?clauses[0]:`(${clauses.join(' OR ')})`;
      const novaSql=`SELECT * FROM SEMANTIC_VIEW(
  ${novaSemanticView}
  METRICS nova.total_po_value_usd,
          nova.delayed_po_value_usd,
          nova.outstanding_quantity,
          nova.minimum_days_of_cover,
          nova.weather_linked_po_value_usd,
          nova.high_operational_risk_po_value_usd,
          nova.average_market_sea_dependency_pct
  DIMENSIONS nova.supplier_name,
             nova.origin_country,
             nova.material_name,
             nova.hs4_code,
             nova.commodity_group,
             nova.plant_name,
             nova.supplier_criticality,
             nova.material_criticality,
             nova.weather_risk_level,
             nova.operational_risk_level,
             nova.inventory_risk_level,
             nova.marketplace_match_status
  WHERE nova.marketplace_match_status = 'MATCHED'
    AND ${matchExpression}
)
ORDER BY HIGH_OPERATIONAL_RISK_PO_VALUE_USD DESC,
         DELAYED_PO_VALUE_USD DESC,
         WEATHER_LINKED_PO_VALUE_USD DESC,
         TOTAL_PO_VALUE_USD DESC,
         MINIMUM_DAYS_OF_COVER ASC
LIMIT 25`;

      const result=await executeSql(base,pat,warehouse,novaSql);
      return send(res,200,{
        source:'snowflake-governed-cross-domain',
        requestId:'operational-impact-shared-key',
        semanticView:novaSemanticView,
        semanticDomain:'nova-operations',
        intents:['cross_domain'],
        datasetCoverage:{dimensions:DATASET_DOMAINS.nova.dimensions.length,metrics:DATASET_DOMAINS.nova.metrics.length},
        warehouse,
        text:result?.rows?.length
          ? 'Mapped the previous governed result into Nova Mobility using shared semantic keys and returned the matching operational exposure.'
          : 'The previous governed result has valid shared keys, but none of those keys currently map to Marketplace-matched Nova operational records.',
        sql:novaSql,
        suggestions:[
          'Which matched suppliers need the most attention?',
          'Which matched materials have the lowest inventory cover?',
          'Which plants are exposed to these matched records?'
        ],
        result,
        queryPlan:{
          ...plan,
          type:'operational_impact',
          mappingKeys,
          contextColumns:previousColumns.slice(0,16),
          contextQuestion:previousQuestion.slice(0,500)
        },
        fallbackUsed:false,
        followupContextUsed:true,
        executionWarning:''
      });
    }

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
      queryPlan:plan,
      fallbackUsed,
      followupContextUsed:hasFollowupContext,
      executionWarning
    });
  }catch(err){
    const timedOut=err?.name==='AbortError';
    return send(res,502,{error:timedOut?'Snowflake Cortex Analyst timed out. Please try again.':(err?.message||'Could not reach Snowflake Cortex Analyst.')});
  }
}

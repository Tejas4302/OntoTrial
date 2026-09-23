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

    if(plan.type==='operational_impact_followup'&&plan.mode){
      if(plan.mode!=='sea'){
        return send(res,200,{
          source:'snowflake-governed-cross-domain',
          requestId:`operational-impact-${plan.mode}-limitation`,
          semanticView:novaSemanticView,
          semanticDomain:'nova-operations',
          intents:['cross_domain'],
          datasetCoverage:{dimensions:DATASET_DOMAINS.nova.dimensions.length,metrics:DATASET_DOMAINS.nova.metrics.length},
          warehouse,
          text:`The current Nova semantic layer does not expose an external ${plan.mode}-dependency metric, so I cannot quantify that cross-domain impact without extending the governed model. I can still analyze Nova operational risk independently.`,
          sql:'',
          suggestions:[
            'Which Nova suppliers have the highest operational risk?',
            'Which materials have the lowest inventory cover?',
            'Which purchase orders are delayed?'
          ],
          result:null,
          queryPlan:plan,
          fallbackUsed:false,
          followupContextUsed:true,
          executionWarning:''
        });
      }
      const novaSql=`SELECT * FROM SEMANTIC_VIEW(
  ${novaSemanticView}
  METRICS nova.total_po_value_usd,
          nova.delayed_po_value_usd,
          nova.outstanding_quantity,
          nova.minimum_days_of_cover,
          nova.average_market_sea_dependency_pct
  DIMENSIONS nova.supplier_name,
             nova.origin_country,
             nova.material_name,
             nova.hs4_code,
             nova.plant_name,
             nova.supplier_criticality,
             nova.material_criticality,
             nova.operational_risk_level,
             nova.inventory_risk_level,
             nova.marketplace_match_status
  WHERE nova.marketplace_match_status = 'MATCHED'
)
ORDER BY AVERAGE_MARKET_SEA_DEPENDENCY_PCT DESC,
         TOTAL_PO_VALUE_USD DESC,
         MINIMUM_DAYS_OF_COVER ASC
LIMIT 25`;
      const result=await executeSql(base,pat,warehouse,novaSql);
      return send(res,200,{
        source:'snowflake-governed-cross-domain',
        requestId:'operational-impact-sea',
        semanticView:novaSemanticView,
        semanticDomain:'nova-operations',
        intents:['cross_domain','supplier_risk','material_risk'],
        datasetCoverage:{dimensions:DATASET_DOMAINS.nova.dimensions.length,metrics:DATASET_DOMAINS.nova.metrics.length},
        warehouse,
        text:result?.rows?.length
          ? 'Mapped the prior external sea-dependency signal into Marketplace-matched Nova operational exposure.'
          : 'Nova Mobility currently has no Marketplace-matched operational rows for this external signal.',
        sql:novaSql,
        suggestions:[
          'Which matched materials have the lowest inventory cover?',
          'Which matched suppliers also have delayed PO exposure?',
          'Which plants are most exposed to these matched materials?'
        ],
        result,
        queryPlan:{...plan,type:'operational_impact',mode:'sea'},
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

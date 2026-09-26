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

const AI_MAPPING_CATALOG=Object.freeze([
  {key:'HS4_CODE',source:/^HS4_CODE$|^HS4_STR$|^HS4$/i,target:'nova.hs4_code',priority:1},
  {key:'COMMODITY_GROUP',source:/^COMMODITY_GROUP$/i,target:'nova.commodity_group',priority:2},
  {key:'ORIGIN_COUNTRY',source:/^ORIGIN_COUNTRY$/i,target:'nova.origin_country',priority:3}
]);

function parseCortexJson(body){
  const raw=body&&body.choices&&body.choices[0]&&body.choices[0].message&&body.choices[0].message.content;
  if(typeof raw!=='string'||!raw.trim())throw Error('Cortex AI returned no structured content.');
  try{return JSON.parse(raw);}catch{}
  const match=raw.match(/\{[\s\S]*\}/);
  if(match){try{return JSON.parse(match[0]);}catch{}}
  throw Error('Cortex AI returned invalid structured output.');
}
function parseJsonString(raw){
  if(raw&&typeof raw==='object')return raw;
  const text=String(raw||'').trim();
  if(!text)throw Error('Cortex AI returned an empty SQL completion.');
  try{return JSON.parse(text);}catch{}
  const match=text.match(/\{[\s\S]*\}/);
  if(match){try{return JSON.parse(match[0]);}catch{}}
  throw Error('Cortex AI SQL fallback returned invalid JSON.');
}
function sqlString(value){return "'"+String(value).replace(/'/g,"''")+"'";}
async function cortexAiJsonViaSql(base,pat,warehouse,models,system,user,schema,maxTokens){
  const prompt=[
    system,
    '',
    'Return ONLY a valid JSON object with no markdown fences.',
    'The JSON must match this schema exactly:',
    JSON.stringify(schema),
    '',
    'INPUT:',
    user
  ].join('\n');
  let lastError='Cortex AI SQL fallback failed.';
  for(const model of models){
    if(!model)continue;
    try{
      const statement=
        'SELECT AI_COMPLETE('+
        'model => '+sqlString(model)+', '+
        'prompt => '+sqlString(prompt)+', '+
        "model_parameters => {'temperature': 0, 'max_tokens': "+Number(maxTokens||1600)+"}"+
        ') AS RESPONSE';
      const result=await executeSql(base,pat,warehouse,statement);
      const row=result&&result.rows&&result.rows[0];
      if(!row)throw Error('AI_COMPLETE returned no rows.');
      const col=(result.columns||[])[0]||'RESPONSE';
      return parseJsonString(row[col]);
    }catch(err){
      lastError=err&&err.message?err.message:lastError;
    }
  }
  throw Error(lastError);
}
async function cortexAiJson(base,pat,warehouse,model,system,user,schema,maxTokens){
  const endpoint=base+'/api/v2/cortex/v1/chat/completions';
  const models=[...new Set([model,'openai-gpt-5-mini','openai-gpt-5-nano','mistral-large2','llama3.1-8b'].filter(Boolean))];
  let lastError='Cortex AI request failed.';

  for(const candidate of models){
    const baseBody={
      model:candidate,
      temperature:0,
      max_completion_tokens:maxTokens||1600,
      messages:[
        {role:'system',content:system},
        {role:'user',content:user}
      ]
    };
    const attempts=[
      {...baseBody,response_format:{type:'json_schema',json_schema:{name:'ontotrail_output',strict:true,schema}}},
      {...baseBody,messages:[
        {role:'system',content:system+'\nReturn ONLY a valid JSON object. Do not use markdown fences. The JSON must match this schema: '+JSON.stringify(schema)},
        {role:'user',content:user}
      ]}
    ];

    for(const bodyPayload of attempts){
      try{
        const response=await fetchWithTimeout(endpoint,{
          method:'POST',
          headers:snowHeaders(pat),
          body:JSON.stringify(bodyPayload)
        },50000);
        const body=await response.json().catch(()=>({}));
        if(!response.ok){
          lastError=(body&&body.message)||(body&&body.error&&body.error.message)||('Cortex AI returned '+response.status+'.');
          continue;
        }
        return parseCortexJson(body);
      }catch(err){
        lastError=err&&err.message?err.message:lastError;
      }
    }
  }

  try{
    return await cortexAiJsonViaSql(base,pat,warehouse,models,system,user,schema,maxTokens);
  }catch(err){
    throw Error((err&&err.message?err.message:lastError)+' | REST fallback: '+lastError);
  }
}
function aiDomainContract(){
  return [
    'TRADE DOMAIN dimensions: '+DATASET_DOMAINS.trade.dimensions.join(', '),
    'TRADE DOMAIN metrics: '+DATASET_DOMAINS.trade.metrics.join(', '),
    'TRADE DOMAIN rules: '+DATASET_DOMAINS.trade.constraints.join(' '),
    'NOVA DOMAIN dimensions: '+DATASET_DOMAINS.nova.dimensions.join(', '),
    'NOVA DOMAIN metrics: '+DATASET_DOMAINS.nova.metrics.join(', '),
    'NOVA DOMAIN rules: '+DATASET_DOMAINS.nova.constraints.join(' '),
    'VALID CROSS-DOMAIN ONTOLOGY: HS4_CODE <-> HS4_CODE; COMMODITY_GROUP <-> COMMODITY_GROUP; ORIGIN_COUNTRY <-> ORIGIN_COUNTRY.',
    'Supplier -> Material -> Purchase Order -> Shipment -> Plant relationships exist only inside Nova operations.',
    'A shared country or commodity means contextual overlap, not proof of causation or confirmed disruption.'
  ].join('\n');
}
async function aiPlanQuestion(base,pat,warehouse,model,input){
  const schema={
    type:'object',additionalProperties:false,
    properties:{
      request_type:{type:'string',enum:['single_domain','cross_domain','needs_context']},
      source_domain:{type:'string',enum:['trade','nova']},
      target_domain:{type:'string',enum:['trade','nova','none']},
      semantic_query:{type:'string'},
      answer_goal:{type:'string'},
      mapping_keys:{type:'array',items:{type:'string',enum:['HS4_CODE','COMMODITY_GROUP','ORIGIN_COUNTRY']},maxItems:3},
      required_dimensions:{type:'array',items:{type:'string'},maxItems:12},
      required_metrics:{type:'array',items:{type:'string'},maxItems:12},
      caution:{type:'string'},
      answer_mode:{type:'string',enum:['analysis','decision_support']},
      evidence_strategy:{type:'string',enum:['query_source','reuse_previous','map_previous_to_target','needs_context']}
    },
    required:['request_type','source_domain','target_domain','semantic_query','answer_goal','mapping_keys','required_dimensions','required_metrics','caution','answer_mode','evidence_strategy']
  };
  const system=[
    'You are the OntoTrail AI Orchestrator for governed supply-chain analytics.',
    'Understand meaning from the full conversation. Do not rely on memorized question wording.',
    'Choose the governed data domain, business metrics, dimensions, filters and valid ontology mappings needed to answer.',
    'In this workspace, us/our/our operations means Nova Mobility.',
    'For follow-up questions, use the previous governed result. Never invent a relationship.',
    'Infer whether the user wants analysis or decision support from meaning and conversation context, not exact wording.',
    'Choose evidence_strategy based on what evidence is actually required:',
    '- query_source: the current question can be answered by querying one governed semantic domain.',
    '- reuse_previous: the previous governed result already contains the evidence needed to answer this follow-up.',
    '- map_previous_to_target: the current question requires connecting the previous governed result to another domain through a valid ontology key.',
    '- needs_context: the question depends on missing prior context.',
    'Do not choose a strategy because of a specific phrase. Choose it from the semantic information need.',
    'Decision support for Nova Mobility must ultimately be grounded in Nova operational evidence. External trade/weather evidence can provide context, but not by itself justify a company action.',
    'Use only mappings in the VALID CROSS-DOMAIN ONTOLOGY. Prefer the narrowest valid mapping present in the previous result: HS4_CODE, then COMMODITY_GROUP, then ORIGIN_COUNTRY.',
    'Treat previous_semantic_domain, previous_semantic_view, previous_result_columns and previous_result_sample as authoritative provenance for the immediately prior governed evidence.',
    'If the previous governed result is Nova operational evidence and already contains sufficient facts for the current follow-up, choose reuse_previous. Do not switch back to the trade domain merely because the conversation originally began with an external trade or weather question.',
    'Choose query_source only when the current question genuinely requires new governed evidence that is not already present in the previous result.',
    'Choose map_previous_to_target only when the answer requires crossing semantic domains and a valid ontology key exists in the previous result.',
    'If the user refers to prior context and there is no usable previous result, use evidence_strategy needs_context.',
    'semantic_query must be a self-contained natural-language request for Cortex Analyst with the intended metric, dimensions, filters and period. Do not generate SQL.',
    aiDomainContract()
  ].join('\n');
  return cortexAiJson(base,pat,warehouse,model,system,JSON.stringify(input),schema,1600);
}
function selectAiMapping(mappingKeys,columns,rows){
  const wanted=new Set((mappingKeys||[]).map(function(x){return String(x).toUpperCase();}));
  const ordered=AI_MAPPING_CATALOG.filter(function(m){return wanted.has(m.key);}).sort(function(a,b){return a.priority-b.priority;});
  for(const map of ordered){
    const sourceColumn=(columns||[]).find(function(c){return map.source.test(String(c));});
    if(!sourceColumn)continue;
    const values=[...new Set((rows||[]).map(function(row){return String((row&&row[sourceColumn])||'').trim();}).filter(Boolean))].slice(0,20);
    if(values.length)return Object.assign({},map,{sourceColumn,values});
  }
  return null;
}
function sqlLiteral(value){return "'"+String(value).replace(/'/g,"''")+"'";}
function buildAiNovaMappingQuery(novaSemanticView,mapping){
  const values=mapping.values.map(sqlLiteral).join(',');
  return 'SELECT * FROM SEMANTIC_VIEW(\n  '+novaSemanticView+'\n  METRICS nova.total_po_value_usd,\n          nova.delayed_po_value_usd,\n          nova.delayed_po_count,\n          nova.outstanding_quantity,\n          nova.minimum_days_of_cover,\n          nova.weather_linked_po_value_usd,\n          nova.high_operational_risk_po_value_usd,\n          nova.average_market_sea_dependency_pct\n  DIMENSIONS nova.supplier_name,\n             nova.origin_country,\n             nova.material_name,\n             nova.hs4_code,\n             nova.commodity_group,\n             nova.plant_name,\n             nova.supplier_criticality,\n             nova.material_criticality,\n             nova.weather_risk_level,\n             nova.operational_risk_level,\n             nova.inventory_risk_level,\n             nova.marketplace_match_status\n  WHERE nova.marketplace_match_status = \'MATCHED\'\n    AND '+mapping.target+' IN ('+values+')\n)\nORDER BY HIGH_OPERATIONAL_RISK_PO_VALUE_USD DESC, DELAYED_PO_VALUE_USD DESC, WEATHER_LINKED_PO_VALUE_USD DESC, TOTAL_PO_VALUE_USD DESC, MINIMUM_DAYS_OF_COVER ASC\nLIMIT 40';
}
function compactAiResult(result,limit){
  const cols=(result&&result.columns||[]).slice(0,18);
  const rows=(result&&result.rows||[]).slice(0,limit||18).map(function(row){
    return Object.fromEntries(cols.map(function(c){return [c,row&&row[c]];}));
  });
  return {columns:cols,rows};
}
async function aiSynthesize(base,pat,warehouse,model,input){
  const schema={
    type:'object',additionalProperties:false,
    properties:{
      answer:{type:'string'},
      decision_implication:{type:'string'},
      limitations:{type:'array',items:{type:'string'},maxItems:4}
    },
    required:['answer','decision_implication','limitations']
  };
  const system=[
    'You are OntoTrail Intelligence, an executive supply-chain analyst.',
    'Answer the user directly from the supplied governed evidence. Do not output a metric dump.',
    'Use only supplied evidence. Distinguish Marketplace external context from Nova internal operational facts.',
    'A shared country, HS4 or commodity mapping means potential relevance, not causation and not confirmed disruption.',
    'Only describe confirmed operational disruption when internal data supports it. Otherwise describe monitoring priority, exposure, or potential vulnerability.',
    'Suppress zero-value metrics unless a zero changes the conclusion.',
    'Use 2 to 4 concise paragraphs: direct answer, strongest evidence, then decision implication.',
    'When orchestration_plan.answer_mode is decision_support, recommend an action only when the current Nova evidence supports it. Tie the recommendation to the specific internal evidence that justifies it.',
    'If the evidence shows exposure but not disruption, recommend monitoring, contingency validation, inventory protection, supplier engagement, or scenario testing rather than claiming an alternate source is required.',
    'If the evidence is insufficient for a concrete action, say what should be checked next instead of manufacturing a recommendation.',
    'Never invent a cause, forecast, supplier fact, event, owner, or risk absent from the evidence.',
    aiDomainContract()
  ].join('\n');
  const out=await cortexAiJson(base,pat,warehouse,model,system,JSON.stringify(input),schema,1400);
  out.combined_answer=[out.answer,out.decision_implication?('Decision implication: '+out.decision_implication):''].filter(Boolean).join('\n\n');
  return out;
}


async function runSemanticAnalyst(base,pat,semanticView,prompt){
  let lastError='Snowflake Cortex Analyst request failed.';
  for(let attempt=0;attempt<3;attempt++){
    try{
      const response=await fetchWithTimeout(base+'/api/v2/cortex/analyst/message',{
        method:'POST',
        headers:snowHeaders(pat),
        body:JSON.stringify({
          messages:[{role:'user',content:[{type:'text',text:prompt}]}],
          semantic_view:semanticView,
          stream:false
        })
      },50000);
      const body=await response.json().catch(()=>({}));
      if(response.ok){
        const parsed=normalizeAnalyst(body);
        return {parsed,requestId:body.request_id||response.headers.get('x-snowflake-request-id')||''};
      }
      lastError=body.message||body.error||('Snowflake Cortex Analyst returned '+response.status+'.');
      if(!(response.status===429||response.status>=500))throw Error(lastError);
    }catch(err){
      lastError=err&&err.message?err.message:lastError;
      if(attempt===2)break;
    }
    await new Promise(function(resolve){setTimeout(resolve,500*(attempt+1));});
  }
  throw Error(lastError);
}

function looksLikeInterpretationOnly(text){
  return /this is (our|my) interpretation of your question|interpretation of your question|here is how i interpreted|the question is asking/i.test(String(text||''));
}
async function directAnswerFromAnalystEvidence({base,pat,semanticView,question,previousQuestion,previousAnswer,result,semanticDomain,mapping}){
  if(!result||!Array.isArray(result.rows)||!result.rows.length)return '';
  const evidence=compactAiResult(result,12);
  const prompt=[
    'ONTO TRAIL FINAL ANSWER',
    'Current user question: '+question,
    previousQuestion?'Previous user question: '+previousQuestion:'',
    previousAnswer?'Previous governed answer: '+previousAnswer:'',
    'Selected semantic domain: '+semanticDomain,
    mapping?'Governed mapping used: '+mapping.key+' = '+mapping.values.join(', '):'',
    'Governed evidence returned by Snowflake: '+JSON.stringify(evidence),
    '',
    'Answer the current user question DIRECTLY from the governed evidence above.',
    'Do not restate or reinterpret the user question.',
    'Do not say "This is our interpretation of your question".',
    'Do not describe a query plan or list requested fields.',
    'Do not invent facts, causation, forecasts, disruptions, owners or recommendations.',
    'Distinguish external Marketplace context from Nova operational evidence.',
    'If the evidence shows exposure but not confirmed disruption, say that clearly.',
    'For an operational implication, explain what the evidence means for Nova in concise business language.',
    'For a decision question, recommend only bounded next steps justified by the evidence; otherwise say what should be checked next.',
    'Return 2 to 4 concise paragraphs. No SQL is needed because the governed rows are already supplied.'
  ].filter(Boolean).join('\n');

  const first=await runSemanticAnalyst(base,pat,semanticView,prompt);
  let text=String(first.parsed&&first.parsed.text||'').trim();
  if(text&&!looksLikeInterpretationOnly(text))return text;

  const retryPrompt=prompt+'\n\nSTRICT FINAL-ANSWER RULE: start with the business conclusion itself. Do not output an interpretation, semantic request, query plan, or field list.';
  const retry=await runSemanticAnalyst(base,pat,semanticView,retryPrompt);
  text=String(retry.parsed&&retry.parsed.text||'').trim();
  return looksLikeInterpretationOnly(text)?'':text;
}
function contextQuestionTokens(question){
  const stop=new Set(['what','which','that','this','these','those','does','mean','with','from','into','have','will','would','could','should','about','there','their','them','then','than','your','ours','take','action']);
  return [...new Set(String(question||'').toLowerCase().match(/[a-z0-9]+/g)||[])]
    .filter(function(x){return x.length>3&&!stop.has(x);});
}
function analystCandidateScore(candidate,question,previousSemanticDomain,mapping){
  let score=0;
  if(candidate.sql)score+=1;
  const rows=candidate.result&&candidate.result.rows||[];
  if(rows.length)score+=8;
  else if(candidate.sql)score-=3;
  const text=String(candidate.parsed&&candidate.parsed.text||'');
  if(/out of scope|outside the scope|cannot answer|not available in this semantic/i.test(text))score-=8;
  const haystack=((candidate.result&&candidate.result.columns||[]).join(' ')+' '+text).toLowerCase();
  for(const token of contextQuestionTokens(question))if(haystack.includes(token))score+=1;
  if(previousSemanticDomain&&candidate.semanticDomain===previousSemanticDomain)score+=1;
  if(candidate.domain==='nova'&&/\b(nova|our|ours|operations?|supplier|suppliers|material|materials|plant|plants|inventory|shipment|shipments|purchase|po|decision|mitigat|recommend|priority|prioritize)\b/i.test(question))score+=3;
  if(candidate.domain==='trade'&&/\b(import|imports|export|exports|trade|commodity|commodities|country|countries|origin|origins|sea|air|land|weather|transport)\b/i.test(question))score+=2;
  if(candidate.domain==='nova'&&mapping)score+=1;
  return score;
}
async function contextualAnalystOrchestration({base,pat,warehouse,question,previousQuestion,previousAnswer,previousResult,previousRows,previousColumns,previousSemanticDomain,tradeSemanticView,novaSemanticView}){
  const mapping=selectAiMapping(
    AI_MAPPING_CATALOG.map(function(x){return x.key;}),
    previousColumns,
    previousRows
  );
  const evidence=compactAiResult(previousResult&&previousResult.result||{},8);
  const common=[
    'ONTO TRAIL CONVERSATIONAL ANALYSIS',
    'Current user question: '+question,
    previousQuestion?'Immediately previous user question: '+previousQuestion:'',
    previousAnswer?'Immediately previous governed answer: '+previousAnswer:'',
    'Immediately previous governed evidence: '+JSON.stringify(evidence),
    'Interpret the current question in the context of the immediately previous turn.',
    'Do not invent facts or causal relationships.',
    'If the question is outside this semantic view, explicitly say OUT_OF_SCOPE and do not generate unrelated SQL.'
  ].filter(Boolean);

  const tradePrompt=[
    ...common,
    '',
    'You are evaluating whether the current question should be answered from the governed India trade-risk semantic view.',
    'Use this view only for bilateral trade flows, commodity exposure, transport dependency and weather-linked external context.',
    'If the previous turn already moved into Nova operational evidence and the current question is about an operational implication or decision, return OUT_OF_SCOPE rather than reverting to external trade data.'
  ].join('\n');

  const novaMappingHint=mapping
    ? 'A governed cross-domain overlap is available through '+mapping.key+' using these previous-result values: '+mapping.values.join(', ')+'. This overlap is contextual, not proof of causation.'
    : 'No governed shared key is available from the previous result. Do not invent a cross-domain relationship.';

  const novaPrompt=[
    ...common,
    '',
    'You are evaluating whether the current question should be answered from the governed Nova Mobility operational semantic view.',
    'Use this view for suppliers, materials, purchase orders, shipments, inventory, plants and operational risk.',
    novaMappingHint,
    mapping?'When useful, constrain the analysis to the matching '+mapping.key+' values above.':'',
    'For decision-support questions, recommend only bounded actions justified by the returned Nova operational evidence. If evidence shows exposure but not confirmed disruption, frame the action as monitoring, validation, contingency planning, inventory protection, supplier engagement or scenario testing rather than claiming a disruption.'
  ].filter(Boolean).join('\n');

  const settled=await Promise.allSettled([
    runSemanticAnalyst(base,pat,tradeSemanticView,tradePrompt),
    runSemanticAnalyst(base,pat,novaSemanticView,novaPrompt)
  ]);

  const candidates=[];
  const specs=[
    {domain:'trade',semanticDomain:'india-trade-risk',semanticView:tradeSemanticView},
    {domain:'nova',semanticDomain:'nova-operations',semanticView:novaSemanticView}
  ];

  for(let i=0;i<settled.length;i++){
    const item=settled[i];
    if(item.status!=='fulfilled')continue;
    const spec=specs[i];
    const parsed=item.value.parsed;
    const sql=safeSelect(parsed.sql);
    let result=null;
    let executionWarning='';
    if(sql){
      try{result=await executeSql(base,pat,warehouse,sql);}
      catch(err){executionWarning=err&&err.message?err.message:'Generated SQL could not be executed.';}
    }
    const candidate={...spec,parsed,sql:sql||'',result,executionWarning,requestId:item.value.requestId};
    candidate.score=analystCandidateScore(candidate,question,previousSemanticDomain,mapping);
    candidates.push(candidate);
  }

  if(!candidates.length)throw Error('Neither governed Cortex Analyst semantic view could evaluate this follow-up.');
  candidates.sort(function(a,b){return b.score-a.score;});
  const chosen=candidates[0];
  const initialText=String(chosen.parsed&&chosen.parsed.text||'').trim();
  if(chosen.score<0||/out of scope/i.test(initialText)||!chosen.result?.rows?.length){
    throw Error('No governed semantic view could answer this follow-up with sufficient governed rows.');
  }

  let chosenText='';
  try{
    chosenText=await directAnswerFromAnalystEvidence({
      base,pat,
      semanticView:chosen.semanticView,
      question,
      previousQuestion,
      previousAnswer,
      result:chosen.result,
      semanticDomain:chosen.semanticDomain,
      mapping
    });
  }catch{}
  if(!chosenText&&!looksLikeInterpretationOnly(initialText))chosenText=initialText;
  if(!chosenText){
    throw Error('Cortex Analyst produced governed rows but did not return a direct business answer.');
  }

  return {
    source:'snowflake-cortex-analyst-orchestrated',
    requestId:chosen.requestId||('analyst-orchestrated-'+chosen.domain),
    semanticView:chosen.semanticView,
    semanticDomain:chosen.semanticDomain,
    intents:['contextual_ai_orchestration'],
    datasetCoverage:{
      dimensions:DATASET_DOMAINS[chosen.domain].dimensions.length,
      metrics:DATASET_DOMAINS[chosen.domain].metrics.length
    },
    warehouse,
    text:chosenText||'I found governed evidence relevant to this follow-up.',
    sql:chosen.sql,
    suggestions:(chosen.parsed&&chosen.parsed.suggestions)||[],
    result:chosen.result,
    queryPlan:{
      type:'cortex_analyst_orchestration',
      evidence_strategy:'semantic_view_competition',
      selected_domain:chosen.domain,
      mapping_used:mapping?mapping.key:null,
      candidate_scores:Object.fromEntries(candidates.map(function(c){return [c.domain,c.score];}))
    },
    orchestrationPlan:{
      engine:'cortex_analyst',
      selected_domain:chosen.domain,
      mapping_used:mapping?mapping.key:null
    },
    aiOrchestrated:true,
    mappingUsed:mapping?mapping.key:null,
    fallbackUsed:false,
    followupContextUsed:true,
    executionWarning:chosen.executionWarning||''
  };
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
  const previousSemanticDomain=String(previousResult?.semanticDomain||'').trim();
  const previousSemanticView=String(previousResult?.semanticView||'').trim();
  const hasFollowupContext=Boolean(previousQuestion||previousAnswer||previousRows.length||previousPlan);
  const aiModel=process.env.SNOWFLAKE_CORTEX_MODEL||'openai-gpt-5';
  const enableGeneralPlanner=String(process.env.ENABLE_CORTEX_LLM_PLANNER||'').toLowerCase()==='true';
  let aiPlan=null;
  let aiPlannerWarning='';
  try{
    if(enableGeneralPlanner)aiPlan=await aiPlanQuestion(base,pat,warehouse,aiModel,{
      question,
      previous_question:previousQuestion||null,
      previous_answer:previousAnswer||null,
      previous_result_columns:previousColumns,
      previous_result_sample:compactAiResult(previousResult&&previousResult.result||{},8),
      previous_intents:previousIntents,
      previous_semantic_domain:previousSemanticDomain||null,
      previous_semantic_view:previousSemanticView||null,
      previous_rows_available:previousRows.length>0
    });
    else if(hasFollowupContext)aiPlannerWarning='General Cortex LLM planner disabled for this trial account.';
  }catch(err){
    aiPlannerWarning=err&&err.message?err.message:'AI planner unavailable.';
  }

  if(aiPlan){
    if(aiPlan.evidence_strategy==='needs_context'){
      aiPlan=Object.assign({},aiPlan,{request_type:'needs_context'});
    }
    if(aiPlan.evidence_strategy==='reuse_previous'&&!previousRows.length){
      aiPlan=Object.assign({},aiPlan,{
        request_type:'needs_context',
        evidence_strategy:'needs_context',
        caution:[aiPlan.caution,'The requested follow-up depends on previous governed evidence, but no previous governed rows are available.'].filter(Boolean).join(' ')
      });
    }
    if(aiPlan.evidence_strategy==='map_previous_to_target'&&!previousRows.length){
      aiPlan=Object.assign({},aiPlan,{
        request_type:'needs_context',
        evidence_strategy:'needs_context',
        caution:[aiPlan.caution,'Cross-domain mapping requires previous governed rows, but none are available.'].filter(Boolean).join(' ')
      });
    }
  }

  if(aiPlan){
    try{
      if(aiPlan.evidence_strategy==='reuse_previous'&&previousRows.length){
        const synthesis=await aiSynthesize(base,pat,warehouse,aiModel,{
          current_question:question,
          orchestration_plan:aiPlan,
          previous_question:previousQuestion||null,
          previous_answer:previousAnswer||null,
          mapping:null,
          previous_governed_evidence:compactAiResult(previousResult&&previousResult.result||{}),
          current_governed_evidence:compactAiResult(previousResult&&previousResult.result||{})
        });
        return send(res,200,{
          source:'snowflake-ai-orchestrated',
          requestId:'ai-reuse-previous-evidence',
          semanticView:previousSemanticView||'',
          semanticDomain:previousSemanticDomain||'conversation',
          intents:[aiPlan.answer_mode||'analysis'],
          datasetCoverage:{dimensions:0,metrics:0},
          warehouse,
          text:synthesis.combined_answer,
          sql:'',
          suggestions:[],
          result:previousResult&&previousResult.result?previousResult.result:null,
          queryPlan:aiPlan,
          orchestrationPlan:aiPlan,
          aiOrchestrated:true,
          reusedPriorEvidence:true,
          fallbackUsed:false,
          followupContextUsed:true,
          executionWarning:''
        });
      }

      if(aiPlan.request_type==='needs_context'){
        const synthesis=await aiSynthesize(base,pat,warehouse,aiModel,{
          current_question:question,
          orchestration_plan:aiPlan,
          previous_question:previousQuestion||null,
          previous_answer:previousAnswer||null,
          mapping:null,
          previous_governed_evidence:compactAiResult(previousResult&&previousResult.result||{}),
          current_governed_evidence:{columns:[],rows:[]}
        });
        return send(res,200,{
          source:'snowflake-ai-orchestrated',
          requestId:'ai-needs-context',
          semanticView:'',
          semanticDomain:'conversation',
          intents:['needs_context'],
          datasetCoverage:{dimensions:0,metrics:0},
          warehouse,
          text:synthesis.combined_answer,
          sql:'',
          suggestions:[],
          result:null,
          queryPlan:aiPlan,
          orchestrationPlan:aiPlan,
          aiOrchestrated:true,
          needsContext:true,
          fallbackUsed:false,
          followupContextUsed:false,
          executionWarning:''
        });
      }

      if(aiPlan.evidence_strategy==='map_previous_to_target'&&aiPlan.target_domain==='nova'&&previousRows.length){
        const mapping=selectAiMapping(aiPlan.mapping_keys,previousColumns,previousRows);
        if(!mapping){
          const synthesis=await aiSynthesize(base,pat,warehouse,aiModel,{
            current_question:question,
            orchestration_plan:aiPlan,
            previous_question:previousQuestion||null,
            previous_answer:previousAnswer||null,
            mapping:null,
            previous_governed_evidence:compactAiResult(previousResult&&previousResult.result||{}),
            current_governed_evidence:{columns:[],rows:[]}
          });
          return send(res,200,{
            source:'snowflake-ai-orchestrated',
            requestId:'ai-cross-domain-no-mapping',
            semanticView:novaSemanticView,
            semanticDomain:'nova-operations',
            intents:['cross_domain'],
            datasetCoverage:{dimensions:DATASET_DOMAINS.nova.dimensions.length,metrics:DATASET_DOMAINS.nova.metrics.length},
            warehouse,
            text:synthesis.combined_answer,
            sql:'',
            suggestions:[],
            result:null,
            queryPlan:aiPlan,
            orchestrationPlan:aiPlan,
            aiOrchestrated:true,
            needsMapping:true,
            fallbackUsed:false,
            followupContextUsed:true,
            executionWarning:''
          });
        }
        const mappedSql=buildAiNovaMappingQuery(novaSemanticView,mapping);
        const mappedResult=await executeSql(base,pat,warehouse,mappedSql);
        const synthesis=await aiSynthesize(base,pat,warehouse,aiModel,{
          current_question:question,
          orchestration_plan:aiPlan,
          previous_question:previousQuestion||null,
          previous_answer:previousAnswer||null,
          mapping:{key:mapping.key,source_column:mapping.sourceColumn,target_dimension:mapping.target,values:mapping.values},
          previous_governed_evidence:compactAiResult(previousResult&&previousResult.result||{}),
          current_governed_evidence:compactAiResult(mappedResult)
        });
        return send(res,200,{
          source:'snowflake-ai-orchestrated',
          requestId:'ai-cross-domain-'+String(mapping.key).toLowerCase(),
          semanticView:novaSemanticView,
          semanticDomain:'nova-operations',
          intents:['cross_domain'],
          datasetCoverage:{dimensions:DATASET_DOMAINS.nova.dimensions.length,metrics:DATASET_DOMAINS.nova.metrics.length},
          warehouse,
          text:synthesis.combined_answer,
          sql:mappedSql,
          suggestions:[],
          result:mappedResult,
          queryPlan:Object.assign({},aiPlan,{mapping_used:mapping.key}),
          orchestrationPlan:aiPlan,
          aiOrchestrated:true,
          mappingUsed:mapping.key,
          fallbackUsed:false,
          followupContextUsed:true,
          executionWarning:''
        });
      }

      if(aiPlan.evidence_strategy!=='query_source'){
        throw Error('AI orchestration produced an unsupported evidence strategy for this request.');
      }
      const aiDomain=aiPlan.source_domain==='nova'?'nova':'trade';
      const aiSemanticView=aiDomain==='nova'?novaSemanticView:tradeSemanticView;
      const aiProfile=DATASET_DOMAINS[aiDomain];
      const aiPrompt=[
        aiPlan.semantic_query||question,
        '',
        'ONTO TRAIL AI ORCHESTRATION',
        'Original user question: '+question,
        'Answer goal: '+(aiPlan.answer_goal||'Answer the user from governed evidence.'),
        aiPlan.required_dimensions&&aiPlan.required_dimensions.length?'Requested governed dimensions: '+aiPlan.required_dimensions.join(', '):'',
        aiPlan.required_metrics&&aiPlan.required_metrics.length?'Requested governed metrics: '+aiPlan.required_metrics.join(', '):'',
        aiPlan.caution?'Caution: '+aiPlan.caution:'',
        buildDatasetGuidance(question,aiDomain,classifyQuestion(question).intents)
      ].filter(Boolean).join('\n');
      const analyst=await fetchWithTimeout(base+'/api/v2/cortex/analyst/message',{
        method:'POST',
        headers:snowHeaders(pat),
        body:JSON.stringify({messages:[{role:'user',content:[{type:'text',text:aiPrompt}]}],semantic_view:aiSemanticView,stream:false})
      },50000);
      const analystBody=await analyst.json().catch(()=>({}));
      if(!analyst.ok)throw Error(analystBody.message||analystBody.error||('Snowflake Cortex Analyst returned '+analyst.status+'.'));
      const parsedAi=normalizeAnalyst(analystBody);
      const aiSql=safeSelect(parsedAi.sql);
      const aiResult=aiSql?await executeSql(base,pat,warehouse,aiSql):null;
      const synthesis=await aiSynthesize(base,pat,warehouse,aiModel,{
        current_question:question,
        orchestration_plan:aiPlan,
        previous_question:previousQuestion||null,
        previous_answer:previousAnswer||null,
        mapping:null,
        previous_governed_evidence:compactAiResult(previousResult&&previousResult.result||{}),
        current_governed_evidence:compactAiResult(aiResult||{})
      });
      return send(res,200,{
        source:'snowflake-ai-orchestrated',
        requestId:analystBody.request_id||analyst.headers.get('x-snowflake-request-id')||'ai-orchestrated',
        semanticView:aiSemanticView,
        semanticDomain:aiDomain==='nova'?'nova-operations':'india-trade-risk',
        intents:[aiPlan.request_type],
        datasetCoverage:{dimensions:aiProfile.dimensions.length,metrics:aiProfile.metrics.length},
        warehouse,
        text:synthesis.combined_answer,
        sql:aiSql||'',
        suggestions:parsedAi.suggestions||[],
        result:aiResult,
        queryPlan:aiPlan,
        orchestrationPlan:aiPlan,
        aiOrchestrated:true,
        fallbackUsed:false,
        followupContextUsed:hasFollowupContext,
        executionWarning:''
      });
    }catch(err){
      aiPlannerWarning='AI orchestration failure: '+(err&&err.message?err.message:'unknown orchestration error');
      if(hasFollowupContext){
        try{
          const fallback=await contextualAnalystOrchestration({
            base,pat,warehouse,question,previousQuestion,previousAnswer,previousResult,
            previousRows,previousColumns,previousSemanticDomain,tradeSemanticView,novaSemanticView
          });
          fallback.executionWarning='';
          return send(res,200,fallback);
        }catch(fallbackErr){
          return send(res,200,{
            source:'snowflake-cortex-analyst-orchestration-error',
            requestId:'analyst-followup-orchestration-error',
            semanticView:previousSemanticView||'',
            semanticDomain:previousSemanticDomain||'conversation',
            intents:['contextual_ai_orchestration_error'],
            datasetCoverage:{dimensions:0,metrics:0},
            warehouse,
            text:'I could not resolve this follow-up against either governed semantic view without risking an incorrect answer. Please retry or make the business entity you want to analyze explicit.',
            sql:'',
            suggestions:[],
            result:null,
            queryPlan:aiPlan||null,
            orchestrationPlan:{engine:'cortex_analyst'},
            aiOrchestrated:true,
            fallbackUsed:false,
            followupContextUsed:true,
            executionWarning:fallbackErr&&fallbackErr.message?fallbackErr.message:aiPlannerWarning
          });
        }
      }
    }
  }


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
        previousAnswer?`Previous Cortex Analyst answer: ${previousAnswer}`:'',
        previousGrounding?`Previous grounding: ${previousGrounding}`:'',
        previousColumns.length?`Previous governed result columns: ${previousColumns.slice(0,16).join(', ')}`:'',
        previousRows.length?`Previous governed result sample: ${JSON.stringify(previousRows.slice(0,8))}`:'',
        'Treat the prior governed result as conversation evidence. Answer the current question with Cortex Analyst using only valid semantic-view facts. Do not invent mappings or operational impacts.'
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
    const analystCall=await runSemanticAnalyst(base,pat,semanticView,governedQuestion);
    const body={request_id:analystCall.requestId};
    let parsed=analystCall.parsed;
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
      requestId:body.request_id||'',
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

import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/analyst.js';
import {makeSession} from '../lib/auth.js';

async function exercise(t,{vertex=false,gemini=false,rejected=false,question='Which origin countries have the highest India import value in 2026?'}={}){
  for(const [key,value] of Object.entries({VERTEX_AUTH_MODE:'',ONTOTRAIL_AUTH_SECRET:'test-only',SNOWFLAKE_PAT:'snow-test',SNOWFLAKE_ACCOUNT_URL:'https://test.snowflakecomputing.com',SNOWFLAKE_WAREHOUSE:'TEST',SNOWFLAKE_SEMANTIC_VIEW:'TEST.TRADE.VIEW',SNOWFLAKE_NOVA_SEMANTIC_VIEW:'',ENABLE_CORTEX_LLM_PLANNER:'',VERTEX_API_KEY:vertex?'vertex-test':'',VERTEX_MODEL:'test-model',GEMINI_API_KEY:gemini?'gemini-test':'',GEMINI_MODEL:'test-model'})){
    const before=process.env[key];process.env[key]=value;
    t.after(()=>{if(before===undefined)delete process.env[key];else process.env[key]=before;});
  }
  const calls=[];
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    const body=JSON.parse(options.body||'{}');calls.push({url,options,body});
    if(url.includes('googleapis.com')){
      assert.equal(options.headers['x-goog-api-key'],vertex?'vertex-test':'gemini-test');
      assert.ok(!JSON.stringify(options).includes('snow-test'));
      if(rejected)return new Response(JSON.stringify({error:{message:'Provider unavailable'}}),{status:503});
      return Response.json({candidates:[{content:{parts:[{thought:true,text:'private thought'},{text:'Country A leads with $120 in import value.'}]}}]});
    }
    if(url.endsWith('/cortex/analyst/message'))return Response.json({request_id:'test-request',message:{content:[{type:'text',text:'This is our interpretation of your question.'},{type:'sql',statement:'SELECT ORIGIN_COUNTRY, VALUE_USD FROM TEST.TRADE.VIEW'}]}});
    if(url.endsWith('/statements')&&body.statement==='SELECT ORIGIN_COUNTRY, VALUE_USD FROM TEST.TRADE.VIEW')return Response.json({resultSetMetaData:{rowType:[{name:'ORIGIN_COUNTRY'},{name:'VALUE_USD'}]},data:[['Country A','120']]});
    return new Response(JSON.stringify({message:'AI function _COMPLETE_WITH_PROMPT_HISTORY_LLM is not available for trial accounts.'}),{status:403});
  });
  let payload;
  const res={setHeader(){},end(body){payload=JSON.parse(body);}};
  await handler({method:'POST',headers:{cookie:'ontotrail_session='+makeSession({role:'client_user'})},body:{question}},res);
  return {status:res.statusCode,payload,calls};
}
test('trial completion denial preserves evidence and SQL without repeated Analyst passes',async t=>{
  const {status,payload,calls}=await exercise(t);
  assert.equal(status,200);assert.equal(payload.answerStatus,'evidence_only');
  assert.equal(payload.result.rows[0].VALUE_USD,'120');assert.match(payload.sql,/SELECT/);
  assert.match(payload.text,/unavailable/);assert.ok(payload.executionWarning);
  assert.equal(calls.filter(c=>c.url.endsWith('/cortex/analyst/message')).length,1);
});
test('Vertex key uses Vertex endpoint and synthesizes from governed rows',async t=>{
  const {status,payload,calls}=await exercise(t,{vertex:true});
  assert.equal(status,200);assert.equal(payload.answerStatus,'complete');
  assert.equal(payload.text,'Country A leads with $120 in import value.');
  const external=calls.find(c=>c.url.includes('googleapis.com'));
  assert.equal(external.url,'https://aiplatform.googleapis.com/v1/publishers/google/models/test-model:generateContent');
  assert.equal(JSON.parse(external.body.contents[0].parts[0].text).governed_evidence.rows[0].VALUE_USD,'120');
});
test('AI Studio key retains separate Gemini endpoint',async t=>{
  const {payload,calls}=await exercise(t,{gemini:true});
  assert.equal(payload.answerStatus,'complete');assert.ok(calls.some(c=>c.url.startsWith('https://generativelanguage.googleapis.com/')));
});
test('provider failure still preserves evidence',async t=>{
  const {payload}=await exercise(t,{vertex:true,rejected:true});
  assert.equal(payload.answerStatus,'evidence_only');assert.equal(payload.result.rows.length,1);
});
test('missing Nova configuration cannot route operational questions to old Nova view',async t=>{
  const {payload,calls}=await exercise(t,{question:'How will this affect our operations and suppliers?'});
  assert.equal(payload.semanticDomain,'india-trade-risk');
  const analyst=calls.find(c=>c.url.endsWith('/cortex/analyst/message'));
  assert.equal(analyst.body.semantic_view,'TEST.TRADE.VIEW');
  assert.match(analyst.body.messages[0].content[0].text,/No internal suppliers/);
});

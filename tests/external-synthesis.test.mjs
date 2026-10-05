import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('../api/analyst.js',import.meta.url),'utf8');

test('external synthesis uses server-side Responses API configuration',()=>{
  assert.match(source,/process\.env\.OPENAI_API_KEY/);
  assert.match(source,/process\.env\.OPENAI_MODEL/);
  assert.match(source,/https:\/\/api\.openai\.com\/v1\/responses/);
});

test('external synthesis receives governed evidence and preserves evidence boundary',()=>{
  assert.match(source,/governed_evidence:evidence/);
  assert.match(source,/shared keys indicate contextual overlap, not causation/i);
  assert.match(source,/Use ONLY the evidence supplied/i);
});

test('external synthesis never sends the Snowflake PAT in its request body',()=>{
  const openAiBlock=source.slice(source.indexOf('async function openAiSynthesize'),source.indexOf('async function executeSql'));
  assert.ok(openAiBlock.length>0);
  assert.doesNotMatch(openAiBlock,/SNOWFLAKE_PAT|snowHeaders\(|pat\b/);
});

test('OpenAI synthesis is preferred before Snowflake prose fallbacks',()=>{
  const direct=source.slice(source.indexOf('async function directAnswerFromAnalystEvidence'),source.indexOf('function contextQuestionTokens'));
  assert.ok(direct.indexOf('openAiSynthesize')>=0);
  assert.ok(direct.indexOf('aiSynthesize')>direct.indexOf('openAiSynthesize'));
  assert.ok(direct.indexOf('runSemanticAnalyst')>direct.indexOf('aiSynthesize'));
});

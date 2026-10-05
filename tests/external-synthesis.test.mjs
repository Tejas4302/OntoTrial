import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('../api/analyst.js',import.meta.url),'utf8');

test('external synthesis uses server-side Gemini configuration',()=>{
  assert.match(source,/process\.env\.GEMINI_API_KEY/);
  assert.match(source,/process\.env\.GEMINI_MODEL/);
  assert.match(source,/generativelanguage\.googleapis\.com\/v1beta\/models/);
  assert.match(source,/x-goog-api-key/);
});

test('external synthesis receives governed evidence and preserves evidence boundary',()=>{
  assert.match(source,/governed_evidence:evidence/);
  assert.match(source,/shared keys indicate contextual overlap, not causation/i);
  assert.match(source,/Use ONLY the evidence supplied/i);
});

test('Gemini synthesis never sends the Snowflake PAT in its request block',()=>{
  const geminiBlock=source.slice(source.indexOf('async function geminiSynthesize'),source.indexOf('async function executeSql'));
  assert.ok(geminiBlock.length>0);
  assert.doesNotMatch(geminiBlock,/SNOWFLAKE_PAT|snowHeaders\(|pat\b/);
});

test('Gemini synthesis is preferred before Snowflake prose fallbacks',()=>{
  const direct=source.slice(source.indexOf('async function directAnswerFromAnalystEvidence'),source.indexOf('function contextQuestionTokens'));
  assert.ok(direct.indexOf('geminiSynthesize')>=0);
  assert.ok(direct.indexOf('aiSynthesize')>direct.indexOf('geminiSynthesize'));
  assert.ok(direct.indexOf('runSemanticAnalyst')>direct.indexOf('aiSynthesize'));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyQuestion,DATASET_DOMAINS,buildDatasetGuidance} from '../api/intelligence-map.js';

test('routes national trade questions to trade domain',()=>{
  const c=classifyQuestion('Explain India import exposure to China in 2026 including commodity concentration, sea dependency and weather risk');
  assert.equal(c.domain,'trade');
  const ids=c.intents.map(x=>x.id);
  assert.ok(ids.includes('trade_exposure'));
  assert.ok(ids.includes('commodity_concentration'));
  assert.ok(ids.includes('transport_dependency'));
  assert.ok(ids.includes('weather_risk'));
});

test('routes supplier and inventory questions to Nova operations',()=>{
  const c=classifyQuestion('Which supplier has the highest operational risk and lowest days of cover?');
  assert.equal(c.domain,'nova');
  const ids=c.intents.map(x=>x.id);
  assert.ok(ids.includes('supplier_risk'));
  assert.ok(ids.includes('inventory_health'));
});

test('dataset profiles cover both governed semantic domains',()=>{
  assert.ok(DATASET_DOMAINS.trade.dimensions.length>=10);
  assert.ok(DATASET_DOMAINS.trade.metrics.length>=10);
  assert.ok(DATASET_DOMAINS.nova.dimensions.length>=15);
  assert.ok(DATASET_DOMAINS.nova.metrics.length>=10);
});

test('guidance requires multi-dimensional answers',()=>{
  const c=classifyQuestion('Explain China import exposure and weather risk');
  const g=buildDatasetGuidance('Explain China import exposure and weather risk',c.domain,c.intents);
  assert.match(g,/Never answer a multi-part analytical question with only one number/i);
  assert.match(g,/IMPORT_VALUE_USD/);
  assert.match(g,/WEATHER_COVERAGE_PCT/);
});

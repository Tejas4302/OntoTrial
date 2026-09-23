import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyQuestion,DATASET_DOMAINS,buildDatasetGuidance,resolveQuestionPlan} from '../api/intelligence-map.js';

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


const goldenQuestions=[
  {
    q:'Which supplier should Nova Mobility worry about most?',
    domain:'nova',
    intents:['supplier_risk'],
    guidance:['TOTAL_PO_VALUE_USD','DELAYED_PO_VALUE_USD','MINIMUM_DAYS_OF_COVER','WEATHER_LINKED_PO_VALUE_USD']
  },
  {
    q:'Which materials have the lowest inventory cover and what POs are affecting them?',
    domain:'nova',
    intents:['purchase_orders','inventory_health','material_risk'],
    guidance:['MATERIAL_NAME','MINIMUM_DAYS_OF_COVER','OUTSTANDING_QUANTITY','PO_ID']
  },
  {
    q:'Show delayed purchase-order exposure by supplier.',
    domain:'nova',
    intents:['supplier_risk','purchase_orders'],
    guidance:['SUPPLIER_NAME','DELAYED_PO_COUNT','DELAYED_PO_VALUE_USD']
  },
  {
    q:'Which plant is most exposed to supply disruption?',
    domain:'nova',
    intents:['plant_risk'],
    guidance:['PLANT_NAME','HIGH_OPERATIONAL_RISK_PO_VALUE_USD','MINIMUM_DAYS_OF_COVER']
  },
  {
    q:'Which Nova suppliers have both low inventory cover and elevated weather risk?',
    domain:'nova',
    intents:['supplier_risk','nova_weather_risk','inventory_health'],
    guidance:['SUPPLIER_NAME','WEATHER_LINKED_PO_VALUE_USD','MINIMUM_DAYS_OF_COVER']
  },
  {
    q:'Which shipments are delayed and what is their outstanding quantity?',
    domain:'nova',
    intents:['purchase_orders','shipment_logistics'],
    guidance:['SHIPMENT_ID','SHIPMENT_STATUS','OUTSTANDING_QUANTITY']
  },
  {
    q:'Which components have the highest high-risk PO exposure?',
    domain:'nova',
    intents:['material_risk'],
    guidance:['MATERIAL_NAME','HIGH_OPERATIONAL_RISK_PO_VALUE_USD']
  },
  {
    q:'How much of India’s China import exposure depends on sea transport?',
    domain:'trade',
    intents:['trade_exposure','transport_dependency'],
    guidance:['IMPORT_VALUE_USD','SEA_DEPENDENCY_PCT']
  },
  {
    q:'Which commodity groups have the highest import exposure from China?',
    domain:'trade',
    intents:['trade_exposure','commodity_concentration'],
    guidance:['COMMODITY_CHAPTER','IMPORT_VALUE_USD']
  },
  {
    q:'Which origins have the highest elevated weather-risk trade exposure?',
    domain:'trade',
    intents:['trade_exposure','weather_risk'],
    guidance:['ORIGIN_COUNTRY','ELEVATED_WEATHER_RISK_TRADE_VALUE_USD','WEATHER_COVERAGE_PCT']
  },
  {
    q:'Explain Rest of World import exposure in 2026 including commodity concentration and weather coverage.',
    domain:'trade',
    intents:['trade_exposure','commodity_concentration','weather_risk'],
    guidance:['ORIGIN_ISO','COMMODITY_CHAPTER','WEATHER_COVERAGE_PCT']
  }
];

for(const tc of goldenQuestions){
  test('golden AI routing: '+tc.q,()=>{
    const c=classifyQuestion(tc.q);
    assert.equal(c.domain,tc.domain);
    const ids=c.intents.map(x=>x.id);
    for(const id of tc.intents)assert.ok(ids.includes(id),`missing intent ${id}; got ${ids.join(', ')}`);
    const g=buildDatasetGuidance(tc.q,c.domain,c.intents);
    for(const token of tc.guidance)assert.match(g,new RegExp(token));
    assert.match(g,/Do not restate the user question, query plan, or requested fields as the final answer/i);
  });
}


const metricGovernanceQuestions=[
  {
    q:"What is India's total import value in 2026?",
    must:['metric_governance','trade_exposure'],
    tokens:['IMPORT_VALUE_USD','TRADE_YEAR','TRADE_DIRECTION']
  },
  {
    q:"What total import exposure does India represent in 2026?",
    must:['metric_governance','trade_exposure'],
    tokens:['IMPORT_VALUE_USD','TRADE_DIRECTION']
  },
  {
    q:"What total inbound trade value is represented by India imports in 2026?",
    must:['metric_governance','trade_exposure'],
    tokens:['IMPORT_VALUE_USD','TRADE_DIRECTION']
  },
  {
    q:"Which India imports are more than 70% sea dependent in 2026?",
    must:['metric_governance','transport_dependency'],
    tokens:['SEA_DEPENDENCY_PCT','IMPORT_VALUE_USD']
  },
  {
    q:"How much of India's 2026 import value has weather intelligence available?",
    must:['metric_governance','weather_risk'],
    tokens:['WEATHER_COVERED_TRADE_VALUE_USD','WEATHER_COVERAGE_PCT','IMPORT_VALUE_USD']
  },
  {
    q:"Among countries with weather coverage, which have the highest import exposure and weather risk?",
    must:['trade_exposure','weather_risk'],
    tokens:['IMPORT_VALUE_USD','TRADE_WEIGHTED_WEATHER_RISK_SCORE','WEATHER_COVERAGE_PCT']
  }
];

for(const tc of metricGovernanceQuestions){
  test('metric governance canonical routing: '+tc.q,()=>{
    const c=classifyQuestion(tc.q);
    assert.equal(c.domain,'trade');
    const ids=c.intents.map(x=>x.id);
    for(const id of tc.must)assert.ok(ids.includes(id),`missing ${id}; got ${ids.join(', ')}`);
    const g=buildDatasetGuidance(tc.q,c.domain,c.intents);
    for(const token of tc.tokens)assert.match(g,new RegExp(token));
  });
}


const crossDomainQuestions=[
  {
    q:'Which Nova suppliers are most exposed to elevated external weather risk?',
    must:['supplier_risk','cross_domain','nova_weather_risk'],
    tokens:['SUPPLIER_NAME','WEATHER_LINKED_PO_VALUE_USD','AVERAGE_MARKET_SEA_DEPENDENCY_PCT']
  },
  {
    q:'Which Nova materials depend on countries with high sea dependency?',
    must:['cross_domain','material_risk'],
    tokens:['MATERIAL_NAME','ORIGIN_COUNTRY','AVERAGE_MARKET_SEA_DEPENDENCY_PCT']
  },
  {
    q:'Which plants have the most supplier exposure to external country risk?',
    must:['cross_domain','plant_risk'],
    tokens:['PLANT_NAME','SUPPLIER_NAME','ORIGIN_COUNTRY']
  }
];

for(const tc of crossDomainQuestions){
  test('cross-domain routing: '+tc.q,()=>{
    const c=classifyQuestion(tc.q);
    assert.equal(c.domain,'nova');
    const ids=c.intents.map(x=>x.id);
    for(const id of tc.must)assert.ok(ids.includes(id),`missing ${id}; got ${ids.join(', ')}`);
    const g=buildDatasetGuidance(tc.q,c.domain,c.intents);
    for(const token of tc.tokens)assert.match(g,new RegExp(token));
    assert.match(g,/internal Nova operational exposure/i);
    assert.match(g,/external Marketplace context/i);
  });
}


test('transport dependency planner handles paraphrases consistently',()=>{
  const cases=[
    ['Which India imports are most dependent on sea transport in 2026?','sea','SEA_DEPENDENCY_PCT','commodity'],
    ['Rank India inbound products by maritime reliance for 2026.','sea','SEA_DEPENDENCY_PCT','commodity'],
    ['Show the countries India relies on most for air freight imports in 2026.','air','AIR_DEPENDENCY_PCT','origin'],
    ['Which 2026 India imports have the highest land transport dependency?','land','LAND_DEPENDENCY_PCT','commodity']
  ];
  for(const [q,mode,metric,grain] of cases){
    const p=resolveQuestionPlan(q,{});
    assert.equal(p.type,'transport_dependency_ranking',q);
    assert.equal(p.mode,mode,q);
    assert.equal(p.metric,metric,q);
    assert.equal(p.grain,grain,q);
    assert.equal(p.year,2026,q);
    assert.equal(p.direction,'IMPORT',q);
  }
});

test('operational impact follow-up uses conversation context rather than exact wording',()=>{
  const previousPlan={
    type:'transport_dependency_ranking',
    mode:'sea',
    metric:'SEA_DEPENDENCY_PCT',
    year:2026,
    direction:'IMPORT',
    grain:'commodity',
    order:'desc'
  };
  for(const q of [
    'How will this affect our operations?',
    'What does this mean for us?',
    'What is the impact on our supply chain?'
  ]){
    const p=resolveQuestionPlan(q,{previousQuestion:'Rank India imports by sea dependency in 2026',previousPlan,hasRows:true});
    assert.equal(p.type,'operational_impact_followup',q);
    assert.equal(p.domain,'nova',q);
    assert.equal(p.mode,'sea',q);
  }
});

test('context-dependent follow-up in a new chat asks for context',()=>{
  const p=resolveQuestionPlan('How will this affect us?',{});
  assert.equal(p.type,'needs_context');
});


test('weather operational follow-up preserves signal type',()=>{
  const p=resolveQuestionPlan('How will this affect us?',{
    previousQuestion:'Among countries with weather coverage, which have the highest import exposure and weather risk?',
    previousPlan:{type:'semantic_analyst'},
    previousIntents:['trade_exposure','weather_risk'],
    previousColumns:['ORIGIN_COUNTRY','IMPORT_VALUE_USD','TRADE_WEIGHTED_WEATHER_RISK_SCORE','WEATHER_COVERAGE_PCT'],
    hasRows:true
  });
  assert.equal(p.type,'operational_impact_followup');
  assert.equal(p.domain,'nova');
  assert.equal(p.signal,'weather');
  assert.equal(p.mode,null);
});

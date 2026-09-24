const TRADE_DIMENSIONS = [
  'TRADE_YEAR','TRADE_DIRECTION','ORIGIN_ISO','ORIGIN_COUNTRY','DESTINATION_ISO',
  'HS4_CODE','COMMODITY_SECTION','COMMODITY_CHAPTER','COMMODITY_HEADING','MODAL_SUBGROUP',
  'MODE','WEATHER_RISK_LEVEL','WEATHER_COVERAGE_STATUS','WEATHER_FORECAST_START_DATE','WEATHER_FORECAST_END_DATE'
];

const TRADE_METRICS = [
  'TOTAL_NOMINAL_TRADE_VALUE_USD','TOTAL_REAL_TRADE_VALUE_USD','TOTAL_TRADE_WEIGHT_TONNES',
  'TOTAL_AIR_TRADE_VALUE_USD','TOTAL_LAND_TRADE_VALUE_USD','TOTAL_SEA_TRADE_VALUE_USD',
  'AIR_DEPENDENCY_PCT','LAND_DEPENDENCY_PCT','SEA_DEPENDENCY_PCT',
  'IMPORT_VALUE_USD','EXPORT_VALUE_USD','WEATHER_COVERED_TRADE_VALUE_USD',
  'WEATHER_COVERAGE_PCT','ELEVATED_WEATHER_RISK_TRADE_VALUE_USD',
  'TRADE_WEIGHTED_WEATHER_RISK_SCORE','TRADE_WEIGHTED_AFFECTED_LOCATION_PCT',
  'ORIGIN_COUNTRY_COUNT','COMMODITY_COUNT'
];

const NOVA_DIMENSIONS = [
  'PO_ID','PO_STATUS','PROMISED_DATE','SUPPLIER_ID','SUPPLIER_NAME','ORIGIN_ISO','ORIGIN_COUNTRY',
  'SUPPLIER_TIER','CATEGORY','SUPPLIER_CRITICALITY','MATERIAL_ID','MATERIAL_NAME','HS4_CODE',
  'COMMODITY_GROUP','MATERIAL_CRITICALITY','PLANT_NAME','SHIPMENT_ID','TRANSPORT_MODE','ETA_DATE',
  'SHIPMENT_STATUS','INVENTORY_RISK_LEVEL','OPERATIONAL_RISK_LEVEL','WEATHER_RISK_LEVEL',
  'MARKETPLACE_MATCH_STATUS'
];

const NOVA_METRICS = [
  'TOTAL_PO_VALUE_USD','PURCHASE_ORDER_COUNT','SUPPLIER_COUNT','MATERIAL_COUNT','DELAYED_PO_COUNT',
  'TOTAL_ORDER_QUANTITY','TOTAL_RECEIVED_QUANTITY','OUTSTANDING_QUANTITY','MINIMUM_DAYS_OF_COVER',
  'AVERAGE_DAYS_OF_COVER','LOW_COVER_PO_COUNT','WEATHER_LINKED_PO_VALUE_USD','DELAYED_PO_VALUE_USD',
  'HIGH_OPERATIONAL_RISK_PO_VALUE_USD','AVERAGE_MARKET_SEA_DEPENDENCY_PCT'
];

export const DATASET_DOMAINS = Object.freeze({
  trade: {
    id: 'trade',
    label: 'India trade-risk intelligence',
    defaultSemanticView: 'ONTOTRAIL.SUPPLY_CHAIN.ONTOTRAIL_TRADE_RISK_ANALYST',
    dimensions: TRADE_DIMENSIONS,
    metrics: TRADE_METRICS,
    scope: 'India bilateral import/export exposure, commodities, transport dependency, annual forecasts and Pelmorex-derived weather intelligence.',
    constraints: [
      'For India imports filter TRADE_DIRECTION = IMPORT; for exports filter TRADE_DIRECTION = EXPORT.',
      'Use TRADE_YEAR whenever the user provides a year.',
      'Rest of World / ROW means ORIGIN_ISO = ROW and must not be replaced by a country ranking.',
      'TradePrism rows are annual bilateral trade flows/forecasts, not individual shipments or purchase orders.',
      'Weather metrics are only valid where weather coverage exists; never infer weather for uncovered geographies.',
      'Trade values are USD.'
    ]
  },
  nova: {
    id: 'nova',
    label: 'Nova Mobility operational intelligence',
    defaultSemanticView: 'ONTOTRAIL.SUPPLY_CHAIN.ONTOTRAIL_NOVA_MOBILITY_ANALYST',
    dimensions: NOVA_DIMENSIONS,
    metrics: NOVA_METRICS,
    scope: 'Synthetic Nova Mobility suppliers, purchase orders, materials, plants, shipments, inventory cover and operational risk enriched with Marketplace context.',
    constraints: [
      'Nova operational records are synthetic hackathon data and must never be described as real company records.',
      'Marketplace trade/weather enrichment is external context, not Nova proprietary market data.',
      'For cross-domain questions, connect supplier/material/PO/plant exposure to ORIGIN_COUNTRY, WEATHER_RISK_LEVEL, WEATHER_LINKED_PO_VALUE_USD and AVERAGE_MARKET_SEA_DEPENDENCY_PCT where available. Clearly label the Marketplace portion as external context.',
      'AVERAGE_MARKET_SEA_DEPENDENCY_PCT is external TradePrism context and is not Nova actual shipment-mode share.',
      'Use PO_ID for purchase-order questions, SUPPLIER_NAME for supplier questions and MATERIAL_NAME for component questions.',
      'Prefer semantic metrics over re-deriving formulas.'
    ]
  }
});

const INTENTS = [
  {id:'metric_governance', domain:'trade', re:/\b(total import value|total import exposure|total inbound trade value|weather intelligence available|more than\s+70%\s+sea dependent|weather[- ]covered trade value)\b/i,
    dimensions:['TRADE_YEAR','TRADE_DIRECTION','ORIGIN_COUNTRY','WEATHER_COVERAGE_STATUS'], metrics:['IMPORT_VALUE_USD','SEA_DEPENDENCY_PCT','WEATHER_COVERED_TRADE_VALUE_USD','WEATHER_COVERAGE_PCT','TRADE_WEIGHTED_WEATHER_RISK_SCORE'],
    guidance:'This is a Metric Governance question. Resolve persona-specific wording to the canonical semantic metric, state the metric name and filters, then give the business answer. Planning, Procurement and Logistics variants of total India imports must resolve to IMPORT_VALUE_USD for TRADE_YEAR 2026 and TRADE_DIRECTION = IMPORT.'},
  {id:'trade_exposure', domain:'trade', re:/\b(import|export|trade)\b.*\b(exposure|value|dependency|dependence)\b|\bexposure\b.*\b(country|china|india|origin|import|export)\b/i,
    dimensions:['ORIGIN_COUNTRY','ORIGIN_ISO','TRADE_YEAR','TRADE_DIRECTION'], metrics:['IMPORT_VALUE_USD','EXPORT_VALUE_USD','TOTAL_NOMINAL_TRADE_VALUE_USD'],
    guidance:'Lead with total exposure, then explain the main drivers rather than returning only one scalar.'},
  {id:'commodity_concentration', domain:'trade', re:/\b(commodity|commodities|hs4|chapter|heading|product group|concentration)\b/i,
    dimensions:['COMMODITY_CHAPTER','COMMODITY_HEADING','HS4_CODE'], metrics:['IMPORT_VALUE_USD','EXPORT_VALUE_USD','COMMODITY_COUNT'],
    guidance:'Return a ranked commodity breakdown with values and shares where possible.'},
  {id:'transport_dependency', domain:'trade', re:/\b(sea|air|land|transport|shipping|maritime|ocean|mode)\b/i,
    dimensions:['COMMODITY_CHAPTER','COMMODITY_HEADING','ORIGIN_COUNTRY','MODE'], metrics:['SEA_DEPENDENCY_PCT','AIR_DEPENDENCY_PCT','LAND_DEPENDENCY_PCT','IMPORT_VALUE_USD','TOTAL_SEA_TRADE_VALUE_USD','TOTAL_AIR_TRADE_VALUE_USD','TOTAL_LAND_TRADE_VALUE_USD'],
    guidance:'For questions asking which imports are most dependent on sea/air/land transport, rank by the corresponding DEPENDENCY_PCT metric, not by absolute mode trade value. Use import value only as secondary exposure context. For India imports, apply TRADE_DIRECTION = IMPORT and the requested TRADE_YEAR. Explain the transport mix and call out concentration in a single mode.'},
  {id:'weather_risk', domain:'trade', re:/\b(weather|storm|flood|temperature|external risk|climate)\b/i,
    dimensions:['WEATHER_RISK_LEVEL','WEATHER_COVERAGE_STATUS'], metrics:['WEATHER_COVERAGE_PCT','ELEVATED_WEATHER_RISK_TRADE_VALUE_USD','TRADE_WEIGHTED_WEATHER_RISK_SCORE','TRADE_WEIGHTED_AFFECTED_LOCATION_PCT'],
    guidance:'State weather coverage before interpreting weather risk; never infer uncovered risk.'},
  {id:'supplier_risk', domain:'nova', re:/\b(suppliers?|vendors?|tier 1|tier 2)\b/i,
    dimensions:['SUPPLIER_NAME','SUPPLIER_TIER','SUPPLIER_CRITICALITY','ORIGIN_COUNTRY','OPERATIONAL_RISK_LEVEL'], metrics:['TOTAL_PO_VALUE_USD','DELAYED_PO_COUNT','DELAYED_PO_VALUE_USD','MINIMUM_DAYS_OF_COVER','HIGH_OPERATIONAL_RISK_PO_VALUE_USD','WEATHER_LINKED_PO_VALUE_USD'],
    guidance:'Assess supplier risk using exposure, delay status, inventory cover and external risk together; do not rank on PO value alone unless asked.'},
  {id:'cross_domain', domain:'nova', re:/\b(nova|operations?|operational|suppliers?|vendors?|materials?|components?|plants?|purchase[- ]orders?|pos?|shipments?|inventory)\b.*\b(weather|trade|sea dependency|marketplace|external|country risk|origin risk|sea transport)\b|\b(weather|trade|sea dependency|marketplace|external|country risk|origin risk|sea transport)\b.*\b(nova|operations?|operational|suppliers?|vendors?|materials?|components?|plants?|purchase[- ]orders?|pos?|shipments?|inventory)\b/i,
    dimensions:['SUPPLIER_NAME','MATERIAL_NAME','PLANT_NAME','ORIGIN_COUNTRY','WEATHER_RISK_LEVEL','MARKETPLACE_MATCH_STATUS'], metrics:['TOTAL_PO_VALUE_USD','WEATHER_LINKED_PO_VALUE_USD','AVERAGE_MARKET_SEA_DEPENDENCY_PCT','MINIMUM_DAYS_OF_COVER','DELAYED_PO_VALUE_USD'],
    guidance:'Bridge internal Nova operational exposure with external Marketplace context. Start with the internal supplier/material/PO/plant exposure, then explain the linked origin-country trade dependency or weather signal. Keep internal operational facts and external context clearly distinguished.'},
  {id:'nova_weather_risk', domain:'nova', re:/\b(weather|storm|flood|external weather|weather-linked)\b/i,
    dimensions:['SUPPLIER_NAME','ORIGIN_COUNTRY','WEATHER_RISK_LEVEL','MATERIAL_NAME'], metrics:['WEATHER_LINKED_PO_VALUE_USD','TOTAL_PO_VALUE_USD','MINIMUM_DAYS_OF_COVER'],
    guidance:'For Nova questions, treat weather as external Marketplace context. Quantify weather-linked PO exposure and combine it with supplier/material and inventory evidence; do not infer weather risk where the enrichment is unavailable.'},
  {id:'purchase_orders', domain:'nova', re:/\b(purchase[- ]orders?|pos?|ordered|received|outstanding|delayed[- ]pos?)\b/i,
    dimensions:['PO_ID','PO_STATUS','PROMISED_DATE','SUPPLIER_NAME','MATERIAL_NAME'], metrics:['PURCHASE_ORDER_COUNT','TOTAL_PO_VALUE_USD','DELAYED_PO_COUNT','DELAYED_PO_VALUE_USD','TOTAL_ORDER_QUANTITY','TOTAL_RECEIVED_QUANTITY','OUTSTANDING_QUANTITY'],
    guidance:'Explain PO status, outstanding quantity/value and due-date risk when relevant.'},
  {id:'inventory_health', domain:'nova', re:/\b(inventory|stock|days? of cover|doi|cover|safety stock)\b/i,
    dimensions:['MATERIAL_NAME','PLANT_NAME','INVENTORY_RISK_LEVEL','MATERIAL_CRITICALITY'], metrics:['MINIMUM_DAYS_OF_COVER','AVERAGE_DAYS_OF_COVER','LOW_COVER_PO_COUNT','OUTSTANDING_QUANTITY'],
    guidance:'Prioritize low-cover critical materials and connect them to delayed or outstanding supply when data supports it.'},
  {id:'shipment_logistics', domain:'nova', re:/\b(shipments?|eta|in transit|booked|logistics|transport mode)\b/i,
    dimensions:['SHIPMENT_ID','SHIPMENT_STATUS','TRANSPORT_MODE','ETA_DATE','ORIGIN_COUNTRY','SUPPLIER_NAME'], metrics:['OUTSTANDING_QUANTITY','TOTAL_PO_VALUE_USD'],
    guidance:'Explain current shipment state, ETA and material/PO exposure; distinguish Nova shipment mode from external market sea dependency.'},
  {id:'material_risk', domain:'nova', re:/\b(materials?|components?|parts?|battery|inverter|motor|semiconductors?|connectors?|pumps?|thermal)\b/i,
    dimensions:['MATERIAL_NAME','COMMODITY_GROUP','MATERIAL_CRITICALITY','SUPPLIER_NAME','PLANT_NAME'], metrics:['TOTAL_PO_VALUE_USD','OUTSTANDING_QUANTITY','MINIMUM_DAYS_OF_COVER','HIGH_OPERATIONAL_RISK_PO_VALUE_USD'],
    guidance:'Combine material criticality, inventory cover, open quantity and supplier exposure.'},
  {id:'plant_risk', domain:'nova', re:/\b(plants?|factor(?:y|ies)|bengaluru|pune|chennai|hyderabad)\b/i,
    dimensions:['PLANT_NAME','MATERIAL_NAME','SUPPLIER_NAME','OPERATIONAL_RISK_LEVEL'], metrics:['TOTAL_PO_VALUE_USD','DELAYED_PO_COUNT','MINIMUM_DAYS_OF_COVER','HIGH_OPERATIONAL_RISK_PO_VALUE_USD'],
    guidance:'Summarize plant exposure and identify the materials/suppliers driving it.'},
  {id:'risk_summary', domain:'nova', re:/\b(operational risk|supply risk|high[- ]risk|at[- ]risk|risk exposure)\b/i,
    dimensions:['OPERATIONAL_RISK_LEVEL','INVENTORY_RISK_LEVEL','SUPPLIER_NAME','MATERIAL_NAME'], metrics:['HIGH_OPERATIONAL_RISK_PO_VALUE_USD','DELAYED_PO_VALUE_USD','WEATHER_LINKED_PO_VALUE_USD','MINIMUM_DAYS_OF_COVER'],
    guidance:'Triangulate operational, inventory and external weather risk; avoid a one-metric verdict.'}
];

export function classifyQuestion(question=''){
  const q=String(question||'').trim();
  const matched=INTENTS.filter(x=>x.re.test(q));
  const opsSignal=/\b(nova|operations?|operational|suppliers?|vendors?|purchase[- ]orders?|pos?|inventory|stock|shipments?|materials?|components?|plants?|factor(?:y|ies)|days? of cover|operational risk)\b/i.test(q);
  const tradeSignal=/\b(india|import|export|trade|country|china|origin|commodity|hs4|sea dependency|air dependency|weather coverage)\b/i.test(q);
  let domain='trade';
  if(opsSignal)domain='nova';
  else if(tradeSignal)domain='trade';
  else if(matched.some(x=>x.domain==='nova')&&!matched.some(x=>x.domain==='trade'))domain='nova';
  else if(matched.some(x=>x.domain==='trade'))domain='trade';
  const intents=matched.filter(x=>x.domain===domain);
  return {domain,intents:intents.length?intents:[{id:domain==='nova'?'operational_overview':'trade_overview',domain,dimensions:[],metrics:[],guidance:'Answer the exact question using governed dimensions and metrics.'}]};
}

export function buildDatasetGuidance(question,domain,intents=[]){
  const d=DATASET_DOMAINS[domain]||DATASET_DOMAINS.trade;
  const dims=[...new Set(intents.flatMap(i=>i.dimensions||[]))];
  const metrics=[...new Set(intents.flatMap(i=>i.metrics||[]))];
  const intentText=intents.map(i=>`${i.id}: ${i.guidance}`).join(' ');
  return [
    `Dataset domain: ${d.label}.`,
    `Scope: ${d.scope}`,
    `Available governed dimensions: ${d.dimensions.join(', ')}.`,
    `Available governed metrics: ${d.metrics.join(', ')}.`,
    dims.length?`For this question, prefer these dimensions when relevant: ${dims.join(', ')}.`:'',
    metrics.length?`For this question, prefer these metrics when relevant: ${metrics.join(', ')}.`:'',
    intentText?`Intent-specific guidance: ${intentText}`:'',
    `Rules: ${d.constraints.join(' ')}`,
    'Answer contract: start with a direct executive answer. Then explain the key drivers using the returned evidence. For multi-dimensional questions, cover every requested dimension that exists in the dataset. Use exact business labels and units, quantify concentrations where possible, state data limitations explicitly, and end with a concise decision implication only when the evidence supports one. Do not invent entities, causes, forecasts, supplier facts or risks that are absent from the governed dataset.',
    'Never answer a multi-part analytical question with only one number if other requested governed dimensions are available.',
    'Do not restate the user question, query plan, or requested fields as the final answer. If governed rows are returned, synthesize the result into a business conclusion backed by those rows.'
  ].filter(Boolean).join('\n');
}


export function resolveQuestionPlan(question='',context={}){
  const q=String(question||'').trim();
  const previousQuestion=String(context?.previousQuestion||'').trim();
  const previousPlan=context?.previousPlan&&typeof context.previousPlan==='object'?context.previousPlan:null;
  const hasContext=Boolean(previousQuestion||previousPlan||context?.hasRows);

  const deictic=/\b(this|that|these|those|it|they|them)\b/i.test(q);
  const impact=/\b(affect|impact|implication|mean for|matter to|risk to|exposure to)\b/i.test(q);
  const workspaceRef=/\b(us|our|operations?|business|supply chain|suppliers?|materials?|components?|plants?|inventory|purchase[- ]orders?|pos?|shipments?)\b/i.test(q);
  const operationalFollowup=(impact&&workspaceRef)||(deictic&&workspaceRef);

  if(operationalFollowup&&!hasContext){
    return {type:'needs_context',reason:'operational_followup_without_prior_turn'};
  }

  const modeMatch=q.match(/\b(sea|maritime|ocean|air|airfreight|air freight|land|road|rail)\b/i);
  const normalizedMode=modeMatch
    ? (/sea|maritime|ocean/i.test(modeMatch[1])?'sea':/air/i.test(modeMatch[1])?'air':'land')
    : null;
  const dependencyLanguage=/\b(depend(?:ent|ency)?|reli(?:ance|ant|es|ed|y)|share|most dependent|least dependent|highest dependency|lowest dependency)\b/i.test(q);
  const rankingLanguage=/\b(which|rank|top|most|highest|least|lowest|show|list)\b/i.test(q);
  const yearMatch=q.match(/\b(20\d{2})\b/);
  const direction=/\b(exports?|outbound)\b/i.test(q)?'EXPORT':/\b(imports?|inbound)\b/i.test(q)?'IMPORT':null;
  const grain=/\b(countries|country|origins?|source countries?)\b/i.test(q)?'origin':'commodity';
  const order=/\b(least|lowest|bottom)\b/i.test(q)?'asc':'desc';

  if(normalizedMode&&dependencyLanguage&&rankingLanguage){
    const metric={sea:'SEA_DEPENDENCY_PCT',air:'AIR_DEPENDENCY_PCT',land:'LAND_DEPENDENCY_PCT'}[normalizedMode];
    const valueMetric=direction==='EXPORT'?'EXPORT_VALUE_USD':'IMPORT_VALUE_USD';
    return {
      type:'transport_dependency_ranking',
      domain:'trade',
      mode:normalizedMode,
      metric,
      valueMetric,
      year:yearMatch?Number(yearMatch[1]):null,
      direction,
      grain,
      order
    };
  }

  const weatherLanguage=/\b(weather|weather risk|weather coverage|climate|risk score)\b/i.test(q);
  const exposureLanguage=/\b(import exposure|import value|trade exposure|exposure|highest import|largest import)\b/i.test(q);
  const countryLanguage=/\b(countries|country|origins?|origin countries?)\b/i.test(q);
  if(weatherLanguage&&exposureLanguage&&countryLanguage&&rankingLanguage){
    return {
      type:'trade_weather_exposure_ranking',
      domain:'trade',
      direction:direction||'IMPORT',
      year:yearMatch?Number(yearMatch[1]):null,
      grain:'origin',
      order
    };
  }

  if(operationalFollowup&&hasContext){
    return {type:'operational_impact_followup',domain:'nova',previousPlan};
  }

  return {type:'semantic_analyst'};
}

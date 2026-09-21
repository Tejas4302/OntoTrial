const KEY='ontotrail.decisions.v1';

const seed=()=>[
  {
    id:'DEC-001',title:'Qualify alternate source for Aruna Components',problem:'ARUNA_4D creates concentrated exposure on Aruna Components.',action:'Validate an alternate supplier and reserve emergency capacity for the highest-value affected orders.',owner:'Supply Planning',due:'2026-09-24',status:'In progress',priority:'High',expectedImpact:'Reduce exposure in the recovery scenario',scenario:'ARUNA_4D',source:'Scenario analysis',createdAt:'2026-09-21T08:30:00.000Z'
  },
  {
    id:'DEC-002',title:'Expedite critical inbound component shipments',problem:'Several customer orders miss their required-by dates under the disruption scenario.',action:'Escalate expedited logistics for the highest-priority shortage lines and confirm revised ETAs.',owner:'Logistics',due:'2026-09-22',status:'Open',priority:'High',expectedImpact:'Protect near-term customer commitments',scenario:'ARUNA_4D',source:'Control tower',createdAt:'2026-09-21T08:45:00.000Z'
  },
  {
    id:'DEC-003',title:'Review recovered exposure before supplier release',problem:'Recovery actions materially reduce modeled exposure but require premium supply.',action:'Review recovery cost versus protected order value and approve the final release plan.',owner:'Operations Lead',due:'2026-09-25',status:'Proposed',priority:'Medium',expectedImpact:'Convert modeled recovery into an approved action plan',scenario:'ARUNA_4D_RECOVERY',source:'Scenario comparison',createdAt:'2026-09-21T09:00:00.000Z'
  }
];

export function readDecisions(storage){
  try{const raw=storage.getItem(KEY);if(!raw)return seed();const parsed=JSON.parse(raw);return Array.isArray(parsed)?parsed:seed();}catch{return seed();}
}
export function writeDecisions(storage,items){try{storage.setItem(KEY,JSON.stringify(items));return true;}catch{return false;}}
export function nextDecisionId(items){const max=items.reduce((m,d)=>Math.max(m,Number(String(d.id||'').replace(/\D/g,''))||0),0);return `DEC-${String(max+1).padStart(3,'0')}`;}

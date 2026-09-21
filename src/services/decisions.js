const KEY='ontotrail.decisions.v2';
const now='2026-09-21T08:30:00.000Z';
const activity=(status,note,at=now)=>({status,note,at});
const seed=()=>[
  {
    id:'DEC-001',title:'Qualify alternate source for Aruna Components',problem:'ARUNA_4D creates concentrated exposure on Aruna Components.',action:'Validate an alternate supplier and reserve emergency capacity for the highest-value affected orders.',owner:'Supply Planning',ownerEmail:'jury@cococli.demo',due:'2026-09-24',status:'In progress',priority:'High',expectedImpact:'Reduce exposure in the recovery scenario',scenario:'ARUNA_4D',source:'Scenario analysis',createdAt:now,updatedAt:'2026-09-21T09:20:00.000Z',notification:{state:'sent',at:'2026-09-21T08:31:00.000Z'},activity:[activity('Proposed','Decision created from scenario analysis.'),activity('Assigned','Assigned to Supply Planning and notification sent.','2026-09-21T08:31:00.000Z'),activity('In progress','Mitigation work started.','2026-09-21T09:20:00.000Z')]
  },
  {
    id:'DEC-002',title:'Expedite critical inbound component shipments',problem:'Several customer orders miss their required-by dates under the disruption scenario.',action:'Escalate expedited logistics for the highest-priority shortage lines and confirm revised ETAs.',owner:'Logistics',ownerEmail:'jury@cococli.demo',due:'2026-09-22',status:'Assigned',priority:'High',expectedImpact:'Protect near-term customer commitments',scenario:'ARUNA_4D',source:'Control tower',createdAt:'2026-09-21T08:45:00.000Z',updatedAt:'2026-09-21T08:46:00.000Z',notification:{state:'sent',at:'2026-09-21T08:46:00.000Z'},activity:[activity('Proposed','Decision created from Control Tower.','2026-09-21T08:45:00.000Z'),activity('Assigned','Assigned to Logistics and notification sent.','2026-09-21T08:46:00.000Z')]
  },
  {
    id:'DEC-003',title:'Review recovered exposure before supplier release',problem:'Recovery actions materially reduce modeled exposure but require premium supply.',action:'Review recovery cost versus protected order value and approve the final release plan.',owner:'Operations Lead',ownerEmail:'admin@cococli.demo',due:'2026-09-25',status:'Proposed',priority:'Medium',expectedImpact:'Convert modeled recovery into an approved action plan',scenario:'ARUNA_4D_RECOVERY',source:'Scenario comparison',createdAt:'2026-09-21T09:00:00.000Z',updatedAt:'2026-09-21T09:00:00.000Z',notification:{state:'not_sent'},activity:[activity('Proposed','Decision created from scenario comparison.','2026-09-21T09:00:00.000Z')]
  }
];

function normalize(item){
  const created=item.createdAt||new Date().toISOString();
  return {...item,ownerEmail:item.ownerEmail||'',updatedAt:item.updatedAt||created,notification:item.notification||{state:'not_sent'},activity:Array.isArray(item.activity)&&item.activity.length?item.activity:[{status:item.status||'Proposed',note:'Decision created.',at:created}]};
}
export function readDecisions(storage){
  try{const raw=storage.getItem(KEY);if(!raw)return seed();const parsed=JSON.parse(raw);return Array.isArray(parsed)?parsed.map(normalize):seed();}catch{return seed();}
}
export function writeDecisions(storage,items){try{storage.setItem(KEY,JSON.stringify(items));return true;}catch{return false;}}
export function nextDecisionId(items){const max=items.reduce((m,d)=>Math.max(m,Number(String(d.id||'').replace(/\D/g,''))||0),0);return `DEC-${String(max+1).padStart(3,'0')}`;}
export function addDecisionActivity(item,status,note){const at=new Date().toISOString();item.status=status||item.status;item.updatedAt=at;item.activity=[...(item.activity||[]),{status:item.status,note,at}];return item;}

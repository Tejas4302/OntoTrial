const KEY='ontotrail.decisions.v3';
const LEGACY_KEYS=['ontotrail.decisions.v2'];
const now='2026-09-21T08:30:00.000Z';
const activity=(status,note,at=now)=>({status,note,at});
const seed=()=>[];

function normalize(item){
  const created=item.createdAt||new Date().toISOString();
  return {...item,ownerEmail:item.ownerEmail||'',updatedAt:item.updatedAt||created,notification:item.notification||{state:'not_sent'},activity:Array.isArray(item.activity)&&item.activity.length?item.activity:[{status:item.status||'Proposed',note:'Decision created.',at:created}]};
}
export function readDecisions(storage){
  try{
    for(const legacyKey of LEGACY_KEYS)storage.removeItem?.(legacyKey);
    const raw=storage.getItem(KEY);
    if(!raw)return seed();
    const parsed=JSON.parse(raw);
    return Array.isArray(parsed)?parsed.map(normalize):seed();
  }catch{return seed();}
}
export function writeDecisions(storage,items){try{storage.setItem(KEY,JSON.stringify(items));return true;}catch{return false;}}
export function nextDecisionId(items){const max=items.reduce((m,d)=>Math.max(m,Number(String(d.id||'').replace(/\D/g,''))||0),0);return `DEC-${String(max+1).padStart(3,'0')}`;}
export function addDecisionActivity(item,status,note){const at=new Date().toISOString();item.status=status||item.status;item.updatedAt=at;item.activity=[...(item.activity||[]),{status:item.status,note,at}];return item;}

import {validateDataset,validateScenario} from './validation.js';
export function shift(date,days){const dt=new Date(date+'T00:00:00Z');dt.setUTCDate(dt.getUTCDate()+days);return dt.toISOString().slice(0,10);}
export function daysBetween(a,b){return Math.round((Date.parse(b+'T00:00:00Z')-Date.parse(a+'T00:00:00Z'))/86400000);}
export function baseline(d){return {version:1,datasetId:d.id,delays:Object.fromEntries(d.suppliers.map(s=>[s.id,0])),recovery:false,bufferDays:2};}
export function example(d){const s=baseline(d);s.delays[d.suppliers[0].id]=4;return s;}
/**
 * Earliest due allocation. Reserve regular supply for late orders as well.
 * Use optional recovery only when it fills an on-time shortage; never take
 * earlier premium stock when on-time regular stock can cover an order.
 * This is a deterministic planning policy, not a global cost optimizer.
 */
export function evaluate(d,input){
 validateDataset(d);const scenario=validateScenario(input,d);const rows=[];const sources=[];
 for(const part of d.parts){
  const primary=[...d.inventory.filter(i=>i.partId===part.id).map(i=>({id:i.id,partId:part.id,eta:d.snapshot,remaining:i.quantity,quantity:i.quantity,kind:'stock',premiumPaise:0})),...d.shipments.filter(s=>s.partId===part.id).map(s=>({id:s.id,partId:part.id,supplierId:s.supplierId,eta:shift(s.eta,scenario.delays[s.supplierId]),remaining:s.quantity,quantity:s.quantity,kind:'shipment',premiumPaise:0}))].sort((a,b)=>a.eta.localeCompare(b.eta)||a.id.localeCompare(b.id));
  const alternate=(scenario.recovery?d.recoveryQuotes.filter(q=>q.partId===part.id):[]).map(q=>({...q,remaining:q.quantity,kind:'recovery'})).sort((a,b)=>a.premiumPaise-b.premiumPaise||a.eta.localeCompare(b.eta));
  for(const o of d.orders.filter(o=>o.partId===part.id).sort((a,b)=>a.due.localeCompare(b.due)||a.id.localeCompare(b.id))){
   const requiredBy=shift(o.due,-scenario.bufferDays),allocations=[];let needed=o.quantity;
   const take=source=>{const quantity=Math.min(needed,source.remaining);if(quantity<=0)return;source.remaining-=quantity;needed-=quantity;allocations.push({sourceId:source.id,quantity,eta:source.eta,kind:source.kind,premiumPaise:source.premiumPaise||0,onTime:source.eta<=requiredBy});};
   primary.filter(s=>s.eta<=requiredBy).forEach(take);
   alternate.filter(s=>s.eta<=requiredBy).forEach(take);
   const shortfall=needed;
   // Reserve future regular supply so downstream orders cannot reuse backlog stock.
   primary.filter(s=>s.eta>requiredBy).forEach(take);
   const latest=allocations.reduce((max,a)=>a.eta>max?a.eta:max,d.snapshot);
   const expectedDate=needed?null:shift(latest,scenario.bufferDays);
   const orderValuePaise=o.quantity*o.unitPricePaise;
   const shipmentRefs=d.shipments.filter(s=>s.partId===part.id);
   const supplierIds=[...new Set(shipmentRefs.map(s=>s.supplierId))];
   const evidence=[o.id,...d.inventory.filter(i=>i.partId===part.id).map(i=>i.id),...shipmentRefs.map(s=>s.id),...d.documents.filter(doc=>shipmentRefs.some(s=>s.id===doc.shipmentId)).map(doc=>doc.id),...allocations.filter(a=>a.kind==='recovery').map(a=>a.sourceId)];
   rows.push({...o,partName:part.name,requiredBy,allocations,shortfall,unallocated:needed,expectedDate,lateDays:expectedDate?Math.max(0,daysBetween(o.due,expectedDate)):null,atRisk:shortfall>0,orderValuePaise,exposurePaise:shortfall?orderValuePaise:0,supplierIds,evidence:[...new Set(evidence)]});
  }
  sources.push(...primary,...alternate);
 }
 rows.sort((a,b)=>a.due.localeCompare(b.due)||a.id.localeCompare(b.id));
 const atRisk=rows.filter(o=>o.atRisk);const recoveryAllocations=rows.flatMap(o=>o.allocations).filter(a=>a.kind==='recovery');
 return {scenario,rows,sources,metrics:{orders:rows.length,atRisk:atRisk.length,covered:rows.length-atRisk.length,exposurePaise:atRisk.reduce((s,o)=>s+o.orderValuePaise,0),shortfallUnits:atRisk.reduce((s,o)=>s+o.shortfall,0),recoveryUnits:recoveryAllocations.reduce((s,a)=>s+a.quantity,0),recoveryCostPaise:recoveryAllocations.reduce((s,a)=>s+a.quantity*a.premiumPaise,0),coveragePercent:Math.round((rows.length-atRisk.length)/Math.max(rows.length,1)*100)}};
}

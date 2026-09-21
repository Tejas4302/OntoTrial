/** Strict input validation at every persistence or calculation boundary. */
export class ValidationError extends Error { constructor(message,issues=[]) {super(message);this.name='ValidationError';this.issues=issues;} }
export function isDate(value) {
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const n=Date.parse(value+'T00:00:00.000Z');return Number.isFinite(n)&&new Date(n).toISOString().slice(0,10)===value;
}
export const integer=(n,min=0,max=1_000_000)=>Number.isSafeInteger(n)&&n>=min&&n<=max;
export const plain=o=>!!o&&typeof o==='object'&&!Array.isArray(o)&&[Object.prototype,null].includes(Object.getPrototypeOf(o));
export function validateDataset(d) {
 const errors=[];const fail=s=>errors.push(s);
 if(!plain(d))throw new ValidationError('Dataset must be an object.');
 if(typeof d.id!=='string'||d.id.length>120)fail('Dataset ID is missing or invalid.');
 if(!isDate(d.snapshot))fail('Snapshot must be a valid ISO date.');
 if(d.currency!=='INR')fail('This prototype supports INR only.');
 const groups=['suppliers','parts','inventory','shipments','orders','documents','recoveryQuotes'];
 for(const key of groups){if(!Array.isArray(d[key])||d[key].length>5000)fail(`${key}: expected an array of at most 5000 records.`);}
 if(errors.length)throw new ValidationError('Dataset structure is invalid.',errors);
 const maps={};
 for(const key of groups){maps[key]=new Map();for(const row of d[key]){
  if(!plain(row)||typeof row.id!=='string'||!/^[A-Z0-9-]{1,50}$/.test(row.id)){fail(`${key}: invalid record ID.`);continue;}
  if(maps[key].has(row.id))fail(`${key}: duplicate ID ${row.id}.`);maps[key].set(row.id,row);
 }}
 if(errors.length)throw new ValidationError('Dataset IDs are invalid.',errors);
 const ref=(group,id,owner)=>{if(!maps[group].has(id))fail(`${owner}: unknown ${group} reference ${String(id)}.`);};
 const label=(value,owner)=>{if(typeof value!=='string'||!value.trim()||value.length>1000)fail(`${owner}: invalid text.`);};
 for(const p of d.parts)label(p.name,p.id);
 for(const s of d.suppliers){label(s.name,s.id);label(s.city,s.id);ref('documents',s.documentId,s.id);if(!Array.isArray(s.partIds)||!s.partIds.length)fail(`${s.id}: parts missing.`);else for(const id of s.partIds)ref('parts',id,s.id);}
 for(const s of d.inventory){ref('parts',s.partId,s.id);if(!integer(s.quantity))fail(`${s.id}: invalid inventory quantity.`);}
 for(const s of d.shipments){ref('suppliers',s.supplierId,s.id);ref('parts',s.partId,s.id);if(!integer(s.quantity,1))fail(`${s.id}: invalid shipment quantity.`);if(!isDate(s.eta)||s.eta<d.snapshot)fail(`${s.id}: ETA invalid or before snapshot.`);const supplier=maps.suppliers.get(s.supplierId);if(supplier?.partIds&&!supplier.partIds.includes(s.partId))fail(`${s.id}: supplier does not supply this part.`);}
 let total=0;
 for(const o of d.orders){ref('parts',o.partId,o.id);label(o.customer,o.id);if(!integer(o.quantity,1))fail(`${o.id}: invalid order quantity.`);if(!integer(o.unitPricePaise,1,1_000_000_000))fail(`${o.id}: invalid price in paise.`);if(!isDate(o.due)||o.due<d.snapshot)fail(`${o.id}: invalid due date.`);if(!['High','Standard'].includes(o.priority))fail(`${o.id}: invalid priority.`);total+=o.quantity*o.unitPricePaise;}
 if(!Number.isSafeInteger(total))fail('Total order value exceeds safe integer precision.');
 for(const doc of d.documents){label(doc.title,doc.id);label(doc.text,doc.id);if(!isDate(doc.date))fail(`${doc.id}: invalid document date.`);ref('shipments',doc.shipmentId,doc.id);}
 for(const q of d.recoveryQuotes){ref('parts',q.partId,q.id);ref('documents',q.documentId,q.id);if(!integer(q.quantity,1)||!integer(q.premiumPaise,0,1_000_000_000)||!Number.isSafeInteger(q.quantity*q.premiumPaise))fail(`${q.id}: invalid recovery quantity or price.`);if(!isDate(q.eta)||q.eta<d.snapshot)fail(`${q.id}: invalid recovery ETA.`);}
 if(errors.length)throw new ValidationError('Dataset validation failed.',errors);
 return d;
}
export function validateScenario(value,d){
 if(!plain(value))throw new ValidationError('Scenario must be an object.');
 const allowed=['version','datasetId','delays','recovery','bufferDays'];
 if(Object.keys(value).some(k=>!allowed.includes(k)))throw new ValidationError('Scenario has unsupported fields.');
 if(value.version!==1||value.datasetId!==d.id)throw new ValidationError('Scenario version or dataset does not match this workspace.');
 if(!plain(value.delays)||Object.keys(value.delays).length!==d.suppliers.length)throw new ValidationError('A delay is required for every supplier.');
 const delays={};for(const s of d.suppliers){if(!Object.hasOwn(value.delays,s.id)||!integer(value.delays[s.id],0,14))throw new ValidationError('Supplier delays must be whole days between 0 and 14.');delays[s.id]=value.delays[s.id];}
 if(typeof value.recovery!=='boolean')throw new ValidationError('Recovery must be a boolean.');
 if(!integer(value.bufferDays,0,7))throw new ValidationError('Assembly buffer must be 0–7 whole days.');
 return {version:1,datasetId:d.id,delays,recovery:value.recovery,bufferDays:value.bufferDays};
}

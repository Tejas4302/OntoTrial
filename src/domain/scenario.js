import {validateScenario,ValidationError,plain} from './validation.js';
import {example} from './engine.js';
export const fingerprint=s=>JSON.stringify([s.datasetId,s.bufferDays,s.recovery,Object.keys(s.delays).sort().map(k=>[k,s.delays[k]])]);
export function encodeScenario(s,d){const valid=validateScenario(s,d);return new URLSearchParams({v:String(valid.version),dataset:valid.datasetId,delays:d.suppliers.map(s=>valid.delays[s.id]).join(','),recovery:valid.recovery?'1':'0',buffer:String(valid.bufferDays)}).toString();}
export function decodeScenario(search,d){
 if(!search||search==='?')return {scenario:example(d),warning:null};
 try {const p=new URLSearchParams(search);const values=(p.get('delays')||'').split(',');if(values.length!==d.suppliers.length||values.some(v=>!/^\d{1,2}$/.test(v))||!['0','1'].includes(p.get('recovery'))||!/^\d$/.test(p.get('buffer')||''))throw new Error('Invalid values');
  if([...p.keys()].some(k=>!['v','dataset','delays','recovery','buffer'].includes(k))||[...new Set(p.keys())].some(k=>p.getAll(k).length!==1))throw new Error('Unsupported parameters');
  return {scenario:validateScenario({version:Number(p.get('v')),datasetId:p.get('dataset'),delays:Object.fromEntries(d.suppliers.map((s,i)=>[s.id,Number(values[i])])),recovery:p.get('recovery')==='1',bufferDays:Number(p.get('buffer'))},d),warning:null};
 }catch{return {scenario:example(d),warning:'This scenario link is invalid or uses a different dataset. The example scenario was loaded instead.'};}
}
export function scenarioFile(s,d,name='Imported scenario') {return {format:'ontotrail-scenario',version:1,datasetId:d.id,name,scenario:validateScenario(s,d)};}
export function parseScenarioFile(text,d){
 if(typeof text!=='string'||text.length>25000)throw new ValidationError('Scenario files must be smaller than 25 KB.');
 let obj;try{obj=JSON.parse(text);}catch{throw new ValidationError('This is not a valid JSON file.');}
 if(!plain(obj)||obj.format!=='ontotrail-scenario'||obj.version!==1||obj.datasetId!==d.id)throw new ValidationError('Choose an OntoTrail scenario file for this dataset.');
 if(typeof obj.name!=='string'||!obj.name.trim()||obj.name.length>80)throw new ValidationError('Scenario name must be 1–80 characters.');
 return {name:obj.name.trim(),scenario:validateScenario(obj.scenario,d)};
}

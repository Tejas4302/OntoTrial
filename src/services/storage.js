import {validateScenario,isDate,plain} from '../domain/validation.js';
const KEY='ontotrail.workspace.v1';
export function readWorkspace(storage,d){
 try {const raw=storage.getItem(KEY);if(!raw)return {saved:[],activity:[],warning:null};if(raw.length>150000)throw Error('Too large');const value=JSON.parse(raw);if(!plain(value)||value.version!==1||!Array.isArray(value.saved)||!Array.isArray(value.activity))throw Error('Invalid storage');
 const saved=value.saved.slice(0,20).map(s=>{if(!plain(s)||typeof s.id!=='string'||!/^[\w-]{1,80}$/.test(s.id)||typeof s.name!=='string'||!s.name.trim()||s.name.length>80||typeof s.createdAt!=='string'||!Number.isFinite(Date.parse(s.createdAt)))throw Error('Invalid saved scenario');return {id:s.id,name:s.name,createdAt:s.createdAt,scenario:validateScenario(s.scenario,d)};});
 const activity=value.activity.slice(0,50).filter(a=>plain(a)&&typeof a.text==='string'&&a.text.length<=250&&typeof a.at==='string'&&Number.isFinite(Date.parse(a.at))).map(a=>({text:a.text,at:a.at}));
 return {saved,activity,warning:null};
 }catch{return {saved:[],activity:[],warning:'Saved browser data could not be loaded. You can continue without it.'};}
}
export function writeWorkspace(storage,saved,activity){try{storage.setItem(KEY,JSON.stringify({version:1,saved:saved.slice(0,20),activity:activity.slice(0,50)}));return true;}catch{return false;}}
export function downloadFile(name,content,type='application/json'){const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}

import crypto from 'node:crypto';

const COOKIE='ontotrail_session';
const MAX_AGE=60*60*8;
const enc=v=>Buffer.from(v).toString('base64url');
const dec=v=>Buffer.from(v,'base64url').toString('utf8');
const secret=()=>String(process.env.ONTOTRAIL_AUTH_SECRET||'');
function sign(value){return crypto.createHmac('sha256',secret()).update(value).digest('base64url');}
function timingEqual(a,b){try{return crypto.timingSafeEqual(Buffer.from(a),Buffer.from(b));}catch{return false;}}
export function configured(){return Boolean(secret()&&process.env.ONTOTRAIL_CLIENT_EMAIL&&process.env.ONTOTRAIL_CLIENT_PASSWORD);}
export function credentials(email,password){
  const e=String(email||'').trim().toLowerCase(); const p=String(password||'');
  const platformEmail=String(process.env.ONTOTRAIL_ADMIN_EMAIL||'').trim().toLowerCase();
  if(platformEmail&&e===platformEmail&&p===String(process.env.ONTOTRAIL_ADMIN_PASSWORD||''))return {role:'platform_admin',name:'OntoTrail Administrator',tenant:'OntoTrail',email:e};
  const clientAdminEmail=String(process.env.ONTOTRAIL_CLIENT_ADMIN_EMAIL||'').trim().toLowerCase();
  if(clientAdminEmail&&e===clientAdminEmail&&p===String(process.env.ONTOTRAIL_CLIENT_ADMIN_PASSWORD||''))return {role:'client_admin',name:'CoCo CLI Hackathon Admin',tenant:'CoCo CLI Hackathon',email:e};
  const clientEmail=String(process.env.ONTOTRAIL_CLIENT_EMAIL||'').trim().toLowerCase();
  if(e===clientEmail&&p===String(process.env.ONTOTRAIL_CLIENT_PASSWORD||''))return {role:'client_user',name:'CoCo CLI Hackathon User',tenant:'CoCo CLI Hackathon',email:e};
  return null;
}
export function makeSession(user){const payload=enc(JSON.stringify({...user,exp:Date.now()+MAX_AGE*1000}));return `${payload}.${sign(payload)}`;}
export function sessionCookie(user){return `${COOKIE}=${makeSession(user)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${MAX_AGE}`;}
export function clearCookie(){return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;}
export function readSession(req){
  if(!secret())return null;
  const raw=String(req.headers?.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(`${COOKIE}=`));
  if(!raw)return null; const token=raw.slice(COOKIE.length+1); const [payload,sig]=token.split('.');
  if(!payload||!sig||!timingEqual(sign(payload),sig))return null;
  try{const data=JSON.parse(dec(payload));if(!data?.exp||Date.now()>data.exp)return null;return {role:data.role,name:data.name,tenant:data.tenant,email:data.email||''};}catch{return null;}
}

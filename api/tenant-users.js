import {readSession} from '../lib/auth.js';
const headers={'Content-Type':'application/json','Cache-Control':'no-store, private'};
const store=new Map();
function send(res,status,body){res.statusCode=status;for(const [k,v] of Object.entries(headers))res.setHeader(k,v);res.end(JSON.stringify(body));}
function seed(){return [
  {id:'coco-admin',name:'CoCo CLI Hackathon Admin',email:String(process.env.ONTOTRAIL_CLIENT_ADMIN_EMAIL||'client.admin@cococli.demo'),role:'Client Admin',status:'Active'},
  {id:'coco-user',name:'CoCo CLI Hackathon User',email:String(process.env.ONTOTRAIL_CLIENT_EMAIL||'jury@cococli.demo'),role:'Client User',status:'Active'}
];}
function key(session){return session.tenant||'CoCo CLI Hackathon';}
function usersFor(session){if(!store.has(key(session)))store.set(key(session),seed());return store.get(key(session));}
export default async function handler(req,res){
  const session=readSession(req);
  if(!session)return send(res,401,{error:'Authentication required.'});
  if(!['client_admin','platform_admin'].includes(session.role))return send(res,403,{error:'Administrator access required.'});
  const users=usersFor(session);
  if(req.method==='GET')return send(res,200,{tenant:'CoCo CLI Hackathon',users});
  if(req.method==='POST'){
    const action=String(req.body?.action||'invite');
    if(action==='invite'){
      const email=String(req.body?.email||'').trim().toLowerCase(); const name=String(req.body?.name||'').trim();
      if(!email||!name)return send(res,400,{error:'Name and email are required.'});
      if(users.some(u=>u.email.toLowerCase()===email))return send(res,409,{error:'A user with this email already exists.'});
      users.push({id:`invite-${Date.now()}`,name,email,role:'Client User',status:'Invited'});
      return send(res,201,{users});
    }
    const id=String(req.body?.id||''); const user=users.find(u=>u.id===id);
    if(!user)return send(res,404,{error:'User not found.'});
    if(action==='deactivate'){user.status='Inactive';return send(res,200,{users});}
    if(action==='activate'){user.status='Active';return send(res,200,{users});}
    if(action==='remove'&&user.status==='Invited'){store.set(key(session),users.filter(u=>u.id!==id));return send(res,200,{users:store.get(key(session))});}
    return send(res,400,{error:'Unsupported action.'});
  }
  res.setHeader('Allow','GET, POST');return send(res,405,{error:'Method not allowed.'});
}

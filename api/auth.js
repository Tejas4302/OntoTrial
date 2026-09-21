import {configured,credentials,sessionCookie,clearCookie,readSession} from '../lib/auth.js';
const headers={'Content-Type':'application/json','Cache-Control':'no-store, private'};
function send(res,status,body){res.statusCode=status;for(const [k,v] of Object.entries(headers))res.setHeader(k,v);res.end(JSON.stringify(body));}
export default async function handler(req,res){
  if(req.method==='GET'){const session=readSession(req);return send(res,session?200:401,{authenticated:Boolean(session),session});}
  if(req.method==='POST'){
    if(!configured())return send(res,503,{error:'Authentication is not configured.'});
    const user=credentials(req.body?.email,req.body?.password);
    if(!user){await new Promise(r=>setTimeout(r,350));return send(res,401,{error:'Invalid email or password.'});}
    res.setHeader('Set-Cookie',sessionCookie(user));return send(res,200,{authenticated:true,session:user});
  }
  if(req.method==='DELETE'){res.setHeader('Set-Cookie',clearCookie());return send(res,200,{authenticated:false});}
  res.setHeader('Allow','GET, POST, DELETE');return send(res,405,{error:'Method not allowed.'});
}

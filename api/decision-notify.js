import {readSession} from '../lib/auth.js';
const headers={'Content-Type':'application/json','Cache-Control':'no-store, private'};
function send(res,status,body){res.statusCode=status;for(const [k,v] of Object.entries(headers))res.setHeader(k,v);res.end(JSON.stringify(body));}
function clean(v,max=500){return String(v||'').trim().slice(0,max);}
function email(v){const s=clean(v,254);return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)?s:'';}
function escapeHtml(v){return String(v||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
export default async function handler(req,res){
  if(req.method!=='POST'){res.setHeader('Allow','POST');return send(res,405,{error:'Method not allowed.'});}
  const session=readSession(req);if(!session)return send(res,401,{error:'Authentication required.'});
  const to=email(req.body?.to);if(!to)return send(res,400,{error:'A valid owner email is required.'});
  const title=clean(req.body?.title,140),id=clean(req.body?.id,40),status=clean(req.body?.status,40),priority=clean(req.body?.priority,40),due=clean(req.body?.due,40),action=clean(req.body?.action,800),problem=clean(req.body?.problem,800),workspaceUrl=clean(req.body?.workspaceUrl,500);
  const apiKey=String(process.env.RESEND_API_KEY||'').trim();
  const from=String(process.env.DECISION_EMAIL_FROM||'OntoTrail <onboarding@resend.dev>').trim();
  if(!apiKey)return send(res,202,{sent:false,reason:'email_not_configured',message:'Decision saved. Email delivery is ready once RESEND_API_KEY is configured.'});
  const subject=`OntoTrail decision assigned: ${title||id}`;
  const html=`<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;color:#17384e"><h2 style="margin-bottom:8px">${escapeHtml(title||'New decision')}</h2><p style="color:#607487">${escapeHtml(id)} · ${escapeHtml(priority)} priority · ${escapeHtml(status)}</p><div style="border:1px solid #dfe7ed;border-radius:10px;padding:18px;margin:18px 0"><p><strong>Evidence</strong><br>${escapeHtml(problem)}</p><p><strong>Action</strong><br>${escapeHtml(action)}</p><p><strong>Due date</strong><br>${escapeHtml(due)}</p></div>${workspaceUrl?`<p><a href="${escapeHtml(workspaceUrl)}" style="display:inline-block;background:#067d70;color:#fff;padding:10px 16px;border-radius:7px;text-decoration:none">Open Decision Board</a></p>`:''}<p style="font-size:12px;color:#7b8d9b">Sent by OntoTrail for ${escapeHtml(session.tenant||'your workspace')}.</p></div>`;
  try{
    const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({from,to:[to],subject,html})});
    const body=await r.json().catch(()=>({}));if(!r.ok)return send(res,502,{error:body.message||`Email provider returned ${r.status}.`});
    return send(res,200,{sent:true,id:body.id||''});
  }catch(err){return send(res,502,{error:err?.message||'Could not send decision notification.'});}
}

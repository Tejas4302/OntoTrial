export async function notifyDecision(payload){
  const response=await fetch('/api/decision-notify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  const body=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(body.error||`Decision notification failed (${response.status}).`);
  return body;
}

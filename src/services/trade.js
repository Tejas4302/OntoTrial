/** Live Marketplace trade-risk dashboard client. */
export async function loadTradeDashboard(){
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),45000);
 try{
  const response=await fetch('/api/trade-dashboard',{headers:{'Accept':'application/json'},signal:controller.signal});
  const payload=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(payload.error||`Trade dashboard request failed (${response.status}).`);
  return payload;
 }catch(err){if(err?.name==='AbortError')throw Error('Trade dashboard took too long to load.');throw err;}
 finally{clearTimeout(timer);}
}
/** Client for the server-side Cortex Analyst bridge. No Snowflake secrets reach the browser. */
export async function askAnalyst(question,context=null){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),55000);
  try{
    const response=await fetch('/api/analyst',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({question,context}),
      signal:controller.signal
    });
    const payload=await response.json().catch(()=>({}));
    if(!response.ok)throw Error(payload.error||`Cortex Analyst request failed (${response.status}).`);
    return payload;
  }catch(err){
    if(err?.name==='AbortError')throw Error('Cortex Analyst took too long to respond. Please try again.');
    throw err;
  }finally{clearTimeout(timer);}
}

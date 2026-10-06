import {readFile} from 'node:fs/promises';

const enabled=process.env.RUN_NOVA_MIGRATION==='true';

if(enabled){
  const base=String(process.env.SNOWFLAKE_ACCOUNT_URL||'').trim().replace(/\/+$/,'');
  const pat=String(process.env.SNOWFLAKE_PAT||'').trim();
  const warehouse=String(process.env.SNOWFLAKE_WAREHOUSE||'').trim();
  if(!base||!pat||!warehouse)throw Error('Nova migration requires the Snowflake account URL, PAT, and warehouse.');

  const headers={
    Authorization:`Bearer ${pat}`,
    'X-Snowflake-Authorization-Token-Type':'PROGRAMMATIC_ACCESS_TOKEN',
    'Content-Type':'application/json',
    Accept:'application/json',
    'User-Agent':'OntoTrail-Nova-Migration/1.0'
  };

  const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const errorText=(body,status)=>body?.message||body?.code||`Snowflake SQL API returned ${status}.`;

  async function poll(handle){
    for(let attempt=0;attempt<120;attempt++){
      const response=await fetch(`${base}/api/v2/statements/${encodeURIComponent(handle)}`,{headers});
      const body=await response.json().catch(()=>({}));
      if(response.status===200)return body;
      if(response.status!==202)throw Error(errorText(body,response.status));
      await wait(1000);
    }
    throw Error('Snowflake migration timed out.');
  }

  async function execute(statement,{multi=false}={}){
    const response=await fetch(`${base}/api/v2/statements`,{
      method:'POST',
      headers,
      body:JSON.stringify({
        statement,
        warehouse,
        timeout:600,
        ...(multi?{parameters:{MULTI_STATEMENT_COUNT:'0'}}:{})
      })
    });
    let body=await response.json().catch(()=>({}));
    if(response.status===202&&body.statementHandle)body=await poll(body.statementHandle);
    else if(!response.ok)throw Error(errorText(body,response.status));

    const handles=Array.isArray(body.statementHandles)?body.statementHandles:[];
    for(const handle of handles)await poll(handle);
    return body;
  }

  const files=[
    new URL('../snowflake/03_nova_mobility_internal_operations.sql',import.meta.url),
    new URL('../snowflake/04_nova_mobility_semantic_view.sql',import.meta.url)
  ];
  const sql=(await Promise.all(files.map(file=>readFile(file,'utf8'))))
    .join('\n')
    .replace(/^USE WAREHOUSE ONTOTRAIL_WH;\s*$/gmi,'');

  await execute(sql,{multi:true});
  const validation=await execute(`
    SELECT
      COUNT(DISTINCT PO_ID) AS PURCHASE_ORDERS,
      COUNT(DISTINCT MATERIAL_ID) AS MATERIALS,
      MIN(DAYS_OF_COVER) AS MINIMUM_DAYS_OF_COVER,
      SUM(IFF(PO_STATUS='DELAYED',PO_VALUE_USD,0)) AS DELAYED_PO_VALUE_USD
    FROM ONTOTRAIL.SUPPLY_CHAIN.NOVA_MOBILITY_RISK_ENRICHED
    WHERE SUPPLIER_NAME='Siam Thermal Solutions'
  `);
  const row=validation?.data?.[0]||[];
  if(Number(row[0])<1||Number(row[1])<1)throw Error('Nova migration validation found no Siam Thermal Solutions records.');
  console.log('[nova-migration] PASS: operational tables, risk view, semantic view, and Siam Thermal Solutions evidence are available');
}

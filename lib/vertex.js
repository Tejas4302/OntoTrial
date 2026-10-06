import {getVercelOidcToken} from '@vercel/oidc';

export function vertexOidcEnabled(){return process.env.VERTEX_AUTH_MODE==='oidc';}
function required(name){const value=String(process.env[name]||'').trim();if(!value)throw Error(`Vertex configuration missing: ${name}`);return value;}
async function post(url,body,headers={}){
  const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
  const data=await response.json().catch(()=>({}));
  if(!response.ok){
    // Never include request headers or tokens in errors.
    const message=typeof data.error==='string'?data.error_description||data.error:data.error?.message;
    throw Error(`Vertex ${new URL(url).hostname} (${response.status}): ${message||'request failed'}`);
  }
  return data;
}
export async function vertexOidcRequest(model){
  const project=required('GCP_PROJECT_ID');
  const number=required('GCP_PROJECT_NUMBER');
  const pool=required('GCP_WORKLOAD_IDENTITY_POOL_ID');
  const provider=required('GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID');
  const email=required('GCP_SERVICE_ACCOUNT_EMAIL');
  const location=String(process.env.GCP_LOCATION||'global');
  if(!/^[a-z0-9-]+$/.test(location))throw Error('Invalid GCP_LOCATION');
  const subjectToken=await getVercelOidcToken();
  const exchanged=await post('https://sts.googleapis.com/v1/token',{
    audience:`//iam.googleapis.com/projects/${number}/locations/global/workloadIdentityPools/${pool}/providers/${provider}`,
    grantType:'urn:ietf:params:oauth:grant-type:token-exchange',
    requestedTokenType:'urn:ietf:params:oauth:token-type:access_token',
    scope:'https://www.googleapis.com/auth/cloud-platform',
    subjectTokenType:'urn:ietf:params:oauth:token-type:jwt',subjectToken
  });
  if(!exchanged.access_token)throw Error('Google STS returned no access token');
  const impersonated=await post(`https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(email)}:generateAccessToken`,{
    scope:['https://www.googleapis.com/auth/cloud-platform'],lifetime:'3600s'
  },{Authorization:`Bearer ${exchanged.access_token}`});
  if(!impersonated.accessToken)throw Error('Google IAM returned no access token');
  const host=location==='global'?'aiplatform.googleapis.com':`${location}-aiplatform.googleapis.com`;
  return {
    endpoint:`https://${host}/v1/projects/${encodeURIComponent(project)}/locations/${location}/publishers/google/models/${encodeURIComponent(model)}:generateContent`,
    headers:{Authorization:`Bearer ${impersonated.accessToken}`,'Content-Type':'application/json'}
  };
}

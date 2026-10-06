import test from 'node:test';
import assert from 'node:assert/strict';
import {vertexOidcRequest} from '../lib/vertex.js';
function configure(t){
 const token=['e30',Buffer.from(JSON.stringify({exp:Math.floor(Date.now()/1000)+7200})).toString('base64url'),'test'].join('.');
 const vars={GCP_PROJECT_ID:'test-project',GCP_PROJECT_NUMBER:'123',GCP_WORKLOAD_IDENTITY_POOL_ID:'test-pool',GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID:'provider',GCP_SERVICE_ACCOUNT_EMAIL:'test@test-project.iam.gserviceaccount.com',GCP_LOCATION:'global',VERCEL_OIDC_TOKEN:token,VERCEL_OIDC_TOKEN_FILE:''};
 for(const [k,v] of Object.entries(vars)){const old=process.env[k];process.env[k]=v;t.after(()=>old===undefined?delete process.env[k]:process.env[k]=old);}
 return token;
}
test('OIDC exchanges identity, impersonates only configured account and targets project endpoint',async t=>{
 const token=configure(t);const calls=[];
 t.mock.method(globalThis,'fetch',async(url,opts)=>{
  calls.push({url,opts,body:JSON.parse(opts.body)});
  return Response.json(calls.length===1?{access_token:'federated-token'}:{accessToken:'service-token'});
 });
 const request=await vertexOidcRequest('gemini-test');
 assert.equal(calls.length,2);
 assert.equal(calls[0].body.subjectToken,token);assert.equal(calls[0].opts.headers.Authorization,undefined);
 assert.equal(calls[0].body.audience,'//iam.googleapis.com/projects/123/locations/global/workloadIdentityPools/test-pool/providers/provider');
 assert.equal(calls[1].opts.headers.Authorization,'Bearer federated-token');
 assert.ok(calls[1].url.includes('test%40test-project.iam.gserviceaccount.com'));
 assert.equal(request.headers.Authorization,'Bearer service-token');
 assert.equal(request.endpoint,'https://aiplatform.googleapis.com/v1/projects/test-project/locations/global/publishers/google/models/gemini-test:generateContent');
});
test('STS denial stops impersonation and generation',async t=>{
 configure(t);let calls=0;
 t.mock.method(globalThis,'fetch',async()=>{calls++;return new Response(JSON.stringify({error:'invalid_grant',error_description:'The audience is invalid'}),{status:400});});
 await assert.rejects(vertexOidcRequest('gemini-test'),/sts.googleapis.com.*audience is invalid/);assert.equal(calls,1);
});
test('missing provider configuration fails before exchanging credentials',async t=>{
 configure(t);process.env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID='';
 await assert.rejects(vertexOidcRequest('gemini-test'),/GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID/);
});

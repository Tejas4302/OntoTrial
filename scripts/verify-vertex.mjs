import {geminiSynthesize} from '../api/analyst.js';
if(process.env.VERCEL_ENV==='production'&&process.env.VERTEX_AUTH_MODE==='oidc'){
  const answer=await geminiSynthesize({current_question:'Which test country has the highest value?',governed_evidence:{columns:['COUNTRY','VALUE'],rows:[{COUNTRY:'Test Alpha',VALUE:120},{COUNTRY:'Test Beta',VALUE:80}]},evidence_boundary:'Synthetic connection test only. No actual business data.'});
  if(!answer.includes('Alpha'))throw Error('Vertex connection test did not answer from the supplied evidence');
  console.log('[vertex-check] PASS: production OIDC, STS exchange, service-account impersonation, and governed text generation');
}

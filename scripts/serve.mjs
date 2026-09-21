import http from 'node:http';import fs from 'node:fs/promises';import path from 'node:path';
const dist=process.argv.includes('--dist');const base=process.cwd();const port=Number(process.env.PORT||3000);
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.json':'application/json; charset=utf-8'};
const config=JSON.parse(await fs.readFile('vercel.json','utf8'));
const headers=Object.fromEntries(config.headers[0].headers.map(h=>[h.key,h.value]));
// HTTP local development does not upgrade localhost to HTTPS.
headers['Content-Security-Policy']=headers['Content-Security-Policy'].replace('; upgrade-insecure-requests','');
const server=http.createServer(async(req,res)=>{
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{Allow:'GET, HEAD'});res.end();return;}
 try{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const sourceRequest=!dist&&pathname.startsWith('/src/');
  const root=path.resolve(base,dist?'dist':sourceRequest?'src':'public');
  const relative=sourceRequest?pathname.slice(4):pathname;
  const target=path.resolve(root,'.'+(relative==='/'?'/index.html':relative));
  if(!target.startsWith(root+path.sep)){res.writeHead(403);res.end('Forbidden');return;}
  // The server exposes only public/ and src/, never arbitrary project files.
  const real=await fs.realpath(target);if(!real.startsWith(root+path.sep))throw Error('Outside root');
  const bytes=await fs.readFile(real);res.writeHead(200,{...headers,'Content-Type':types[path.extname(real)]||'application/octet-stream','Cache-Control':'no-store'});res.end(req.method==='HEAD'?undefined:bytes);
 }catch{res.writeHead(404,{...headers,'Content-Type':'text/plain'});res.end('Not found');}
});
server.listen(port,'127.0.0.1',()=>console.log(`OntoTrail ${dist?'built preview':'development'}: http://localhost:${port}`));
for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>server.close(()=>process.exit(0)));

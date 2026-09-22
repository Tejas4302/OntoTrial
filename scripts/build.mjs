import fs from 'node:fs/promises';import path from 'node:path';import crypto from 'node:crypto';
import {dataset} from '../src/domain/data.js';import {validateDataset} from '../src/domain/validation.js';
validateDataset(dataset);
await fs.rm('dist',{recursive:true,force:true});await fs.mkdir('dist',{recursive:true});
await fs.cp('public','dist',{recursive:true});await fs.cp('src','dist/src',{recursive:true});
const files=[];async function scan(dir){for(const ent of await fs.readdir(dir,{withFileTypes:true})){const p=path.join(dir,ent.name);if(ent.isDirectory())await scan(p);else{const bytes=await fs.readFile(p);files.push({path:p.slice(5).replaceAll('\\','/'),bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});}}}
await scan('dist');const pkg=JSON.parse(await fs.readFile('package.json','utf8'));
await fs.writeFile('dist/build-info.json',JSON.stringify({app:pkg.name,version:pkg.version,dataset:dataset.id,mode:'marketplace-trade-risk',files},null,2));
console.log(`Built ${files.length} static assets. ${Math.round(files.reduce((n,f)=>n+f.bytes,0)/1024)} KB uncompressed. No server secrets or source test files included.`);

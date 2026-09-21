import fs from 'node:fs/promises';import path from 'node:path';import {spawnSync} from 'node:child_process';
let checked=0;async function walk(dir){for(const f of await fs.readdir(dir,{withFileTypes:true})){const p=path.join(dir,f.name);if(f.isDirectory())await walk(p);else if(/\.(js|mjs)$/.test(p)){const r=spawnSync(process.execPath,['--check',p],{encoding:'utf8'});if(r.status!==0)throw Error(r.stderr);const code=await fs.readFile(p,'utf8');for(const m of code.matchAll(/(?:from\s*|import\s*)['"](\.[^'"]+)['"]/g))await fs.access(path.resolve(path.dirname(p),m[1]));checked++;}}}
await walk('src');await walk('scripts');await walk('tests');
const html=await fs.readFile('public/index.html','utf8');if(/<script(?![^>]*src=)[^>]*>/i.test(html)||/\son\w+=/i.test(html)||/\sstyle=/i.test(html))throw Error('Inline code is incompatible with the content security policy.');
for(const m of html.matchAll(/(?:src|href)="(\/[^"#]+)"/g)){const p=m[1].startsWith('/src/')?'.'+m[1]:'public'+m[1];await fs.access(p);}
const config=JSON.parse(await fs.readFile('vercel.json','utf8'));if(config.outputDirectory!=='dist')throw Error('Deployment output mismatch');
console.log(`Checked ${checked} JavaScript files, relative imports, entry assets and Vercel output configuration.`);

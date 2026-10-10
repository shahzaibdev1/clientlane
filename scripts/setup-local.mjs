import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';
import console from 'node:console';
function cli(args) {
  return spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['supabase', ...args], {encoding:'utf8',shell:process.platform === 'win32',windowsHide:true,maxBuffer:10*1024*1024});
}
if(existsSync('.env.local') && /^NEXT_PUBLIC_SUPABASE_URL=https:\/\//m.test(readFileSync('.env.local','utf8'))) throw new Error('Hosted environment detected. Keep it safe and use a separate local environment file.');
console.log('Starting isolated local Supabase and email inbox.');
const started=cli(['start','-x','studio,imgproxy,realtime,edge-runtime,logflare,vector,supavisor']);
if(started.status!==0) throw new Error('Local Supabase could not start. Ensure Docker Desktop is running; use npx supabase start for diagnostics.');
const status=cli(['status','-o','json']);
if(status.status!==0) throw new Error('Cannot read local Supabase configuration.');
const data=JSON.parse(status.stdout);
const key=data.PUBLISHABLE_KEY ?? data.ANON_KEY;
const secret=data.SERVICE_ROLE_KEY ?? data.SECRET_KEY;
if(!data.API_URL || !key || !secret) throw new Error('Local API keys unavailable.');
writeFileSync('.env.local',`NEXT_PUBLIC_SUPABASE_URL=${data.API_URL}\nNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${key}\nNEXT_PUBLIC_APP_URL=http://127.0.0.1:3001\nSUPABASE_SERVICE_ROLE_KEY=${secret}\nSMTP_HOST=127.0.0.1\nSMTP_PORT=55325\nSMTP_FROM=Clientlane <hello@clientlane.local>\nSMTP_SECURE=false\nJOBS_SECRET=${randomBytes(32).toString('hex')}\n`);
console.log('Local environment saved privately. App: http://127.0.0.1:3001. Local test inbox: http://127.0.0.1:55324.');

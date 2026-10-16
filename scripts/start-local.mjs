import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import metadata from '../package.json' with {type:'json'};
import {selectLocalPort} from './server-port.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
try{process.loadEnvFile(path.join(root,'.env'));}catch(error){if(error.code!=='ENOENT')throw error;}
if(process.argv.includes('--workbuddy'))process.env.USE_WORKBUDDY_MCP='1';
let selected;
try{selected=await selectLocalPort({port:Number(process.env.PORT||4326),explicit:Boolean(process.env.PORT),version:metadata.version,probe:async port=>{
 try{const response=await fetch(`http://127.0.0.1:${port}/api/status`,{signal:AbortSignal.timeout(1800)});return response.ok?(await response.json()??{}):{};}
 catch(e){if(e.cause?.code==='ECONNREFUSED'||e.code==='ECONNREFUSED')return null;throw e;}
}});}catch(e){console.error(e.message);process.exit(1);}
const port=selected.port;process.env.PORT=String(port);
if(selected.existing){console.log(`麦麦预算助手已经运行：http://127.0.0.1:${port}`);console.log('如需更新认证配置，请先在原终端停止服务，再启动。');process.exit(0);}
if(port!==4326)console.log(`本次启动地址：http://127.0.0.1:${port}，请使用这个端口。`);
const child=spawn(process.execPath,['--env-file-if-exists=.env',path.join(root,'server/start.mjs')],{cwd:root,stdio:'inherit',env:process.env});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
child.on('error',()=>{console.error('无法启动 Node 服务，请检查 Node.js 22+ 及 npm ci 是否已完成。');process.exitCode=1;});
child.on('exit',code=>{process.exitCode=code||0;});

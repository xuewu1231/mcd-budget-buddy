import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
if(process.argv.includes('--workbuddy'))process.env.USE_WORKBUDDY_MCP='1';
const port=Number(process.env.PORT||4310);
try {
 const response=await fetch(`http://127.0.0.1:${port}/api/status`,{signal:AbortSignal.timeout(1800)});
 const data=await response.json();
 if(data.app==='mcd-budget-buddy'){
  console.log(`麦麦预算助手已经运行：http://127.0.0.1:${port}`);
  console.log('如需更新认证配置，请先在原终端停止服务，再启动。');
  process.exit(0);
 }
 console.error(`端口 ${port} 被其他服务占用。请使用 PORT=4313 启动。`);process.exit(1);
} catch(e) {if(e.name==='SyntaxError'){console.error('该端口上的服务不是麦麦预算助手，请改用其他端口。');process.exit(1);}}
const child=spawn(process.execPath,['--env-file-if-exists=.env',path.join(root,'server/start.mjs')],{cwd:root,stdio:'inherit',env:process.env});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
child.on('error',()=>{console.error('无法启动 Node 服务，请检查 Node.js 22+ 及 npm ci 是否已完成。');process.exitCode=1;});
child.on('exit',code=>{process.exitCode=code||0;});

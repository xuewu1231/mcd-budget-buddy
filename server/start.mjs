import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {homedir} from 'node:os';
import {createHandler} from './http.mjs';
const port=Number(process.env.PORT||4326);
let token=process.env.MCD_MCP_TOKEN?.replace(/^Bearer\s+/i,'').trim();
let authSource=token?'env':'none';
if(!token && process.env.USE_WORKBUDDY_MCP === '1') {
 try {const config=JSON.parse(await readFile(path.join(homedir(),'.workbuddy','mcp.json'),'utf8'));
 const auth=config.mcpServers?.['mcd-mcp']?.headers?.Authorization;
 if(typeof auth==='string' && !auth.includes('${')) {token=auth.replace(/^Bearer\s+/i,'').trim();authSource=token?'workbuddy':'none';}
 } catch {console.log('未能读取有效的本地 WorkBuddy MCP 配置，请先完成真实连接配置。');}
}
const server=http.createServer(createHandler({token,authSource,port}));
server.on('error',error=>{console.error(error.code==='EADDRINUSE'?`端口 ${port} 已被占用，请使用另一端口或确认已有服务。`:['EPERM','EACCES'].includes(error.code)?`当前环境不允许监听本地端口 ${port}（${error.code}）。请在本机终端运行 npm run start:workbuddy，或双击“启动麦麦助手.command”。`:'本地服务启动失败');process.exitCode=1;});
server.listen(port,'127.0.0.1',()=>console.log(`麦麦预算助手 http://127.0.0.1:${port} · ${token?'真实连接已配置':'真实连接未配置，请先连接麦当劳 MCP'}`));

export class ServiceError extends Error {
  constructor(message,code,status=502){super(message);this.name='ServiceError';this.code=code;this.status=status;}
}
export function connectionError(error) {
 const status=Number(error?.status ?? error?.code);
 const message=String(error?.message||'');
 if([401,403].includes(status)||/\b401\b|\b403\b|unauthorized|forbidden/i.test(message)) return new ServiceError('麦当劳认证失败或访问受限。请在 WorkBuddy 或本地 .env 中更新 Token，重启服务后重试。','MCP_AUTH',502);
 if(/timeout|timed out/i.test(message))return new ServiceError('麦当劳接口响应超时，请稍后重试。','MCP_TIMEOUT',504);
 return new ServiceError('本地服务正常，但无法连接麦当劳 MCP。请检查网络及 Token 配置。','MCP_CONNECTION',502);
}

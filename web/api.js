export class RequestError extends Error {
  constructor(message, code, status = 0) { super(message); this.name = 'RequestError'; this.code = code; this.status = status; }
}
export async function requestJSON(url, {body, timeoutMs = 15000, fetchImpl = globalThis.fetch} = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let response;
    try {
      response = await fetchImpl(url, {method:body === undefined ? 'GET' : 'POST', headers:body === undefined ? {} : {'Content-Type':'application/json'}, ...(body === undefined ? {} : {body:JSON.stringify(body)}), signal:controller.signal, cache:'no-store'});
    } catch (e) {
      if (controller.signal.aborted) throw new RequestError('请求等待超时。请检查连接后重试；本次没有取得可用结果。', 'TIMEOUT');
      throw new RequestError('无法连接本地点餐服务。请启动项目中的“启动麦麦助手.command”，保持终端运行，再点击重连。', 'OFFLINE');
    }
    let data;
    try { data = await response.json(); }
    catch { if(controller.signal.aborted)throw new RequestError('响应读取超时，请稍后重试。','TIMEOUT');throw new RequestError('服务返回了非 JSON 内容。请检查启动的是否是麦麦预算助手，并刷新页面。', 'INVALID_RESPONSE', response.status); }
    if (!response.ok) throw new RequestError(data.error || `请求失败（HTTP ${response.status}）`, data.code || 'HTTP_ERROR', response.status);
    return data;
  } finally {clearTimeout(timer);}
}

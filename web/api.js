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

// Presentation uses confirmed integer fen only; it never infers a discount.
export function budgetView(priceFen, budgetFen, dirty = false) {
  if (dirty) return {kind: 'pending'};
  if (!Number.isSafeInteger(priceFen) || priceFen < 0 || !Number.isSafeInteger(budgetFen) || budgetFen <= 0) return {kind: 'unknown'};
  const percent = Math.round(priceFen / budgetFen * 100);
  return {kind: priceFen <= budgetFen ? 'within' : 'over', percent, fill: Math.min(100, percent), remainingFen: budgetFen - priceFen};
}

export function comparePlans(plans, budgetFen) {
  if (plans.length !== 2) return {kind: 'unavailable'};
  if (plans.some(p => p.dirty)) return {kind: 'pending'};
  if (plans.some(p => budgetView(p.priceFen, budgetFen).kind !== 'within')) return {kind: 'unavailable'};
  const differenceFen = Math.abs(plans[0].priceFen - plans[1].priceFen);
  if (!differenceFen) return {kind: 'same'};
  return {kind: 'different', cheaperIndex: plans[0].priceFen < plans[1].priceFen ? 0 : 1, differenceFen};
}

// Category chips filter text only; they do not establish offer eligibility.
export function activityMatches(event, category = 'all', query = '') {
  const text = `${event.title || ''} ${event.content || ''}`.normalize('NFKC').toLowerCase();
  const patterns = {breakfast:/早餐|早八|早班|厚松饼/, new:/上新|新品|焕新/, collab:/联名|联动|peaceminusone|g-dragon/};
  return (category === 'all' || Boolean(patterns[category]?.test(text))) && text.includes(String(query).normalize('NFKC').trim().toLowerCase());
}

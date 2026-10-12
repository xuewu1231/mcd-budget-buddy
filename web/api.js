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

const iconPaths = {
  "calendar": "<rect x=\"3\" y=\"5\" width=\"18\" height=\"16\" rx=\"3\"/><path d=\"M7 3v4M17 3v4M3 10h18M7 14h2M13 14h2M7 18h2\"/>",
  "meal": "<path d=\"M4 10c0-4 3-7 8-7s8 3 8 7H4Z M3 14h18M4 17h16v1a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-1Z M8 7h.01M12 5h.01M16 7h.01\"/>",
  "location": "<path d=\"M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0Z\"/><circle cx=\"12\" cy=\"10\" r=\"3\"/>",
  "compare": "<path d=\"M4 7h15l-3-3M20 17H5l3 3M4 7l3 3M20 17l-3-3\"/>",
  "settings": "<path d=\"M4 6h16M4 12h16M4 18h16\"/><circle cx=\"8\" cy=\"6\" r=\"2\" fill=\"white\"/><circle cx=\"16\" cy=\"12\" r=\"2\" fill=\"white\"/><circle cx=\"10\" cy=\"18\" r=\"2\" fill=\"white\"/>",
  "arrow": "<path d=\"M4 12h15M13 5l7 7-7 7\"/>",
  "refresh": "<path d=\"M20 7v5h-5M4 17v-5h5\"/><path d=\"M6 7a7 7 0 0 1 12-1l2 3M18 17a7 7 0 0 1-12 1l-2-3\"/>",
  "clock": "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M12 7v5l3 2\"/>",
  "search": "<circle cx=\"10.5\" cy=\"10.5\" r=\"6.5\"/><path d=\"m16 16 5 5\"/>",
  "star": "<path d=\"m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z\"/>",
  "sun": "<circle cx=\"12\" cy=\"12\" r=\"4\"/><path d=\"M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.4 1.4M17.6 17.6 19 19M5 19l1.4-1.4M17.6 6.4 19 5\"/>",
  "moon": "<path d=\"M20 15.5A9 9 0 0 1 8.5 4a9 9 0 1 0 11.5 11.5Z\"/>",
  "sparkle": "<path d=\"m12 3 2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4L12 3Z\"/>",
  "ticket": "<path d=\"M3 7h18v4a2 2 0 0 0 0 4v4H3v-4a2 2 0 0 0 0-4V7Z M15 7v2M15 12v2M15 17v2\"/>",
  "close": "<path d=\"m6 6 12 12M18 6 6 18\"/>",
  "check": "<path d=\"m5 12 4 4L19 6\"/>",
  "zoom": "<path d=\"M14 4h6v6M20 4l-7 7M10 20H4v-6M4 20l7-7\"/>"
};
export function icon(name){return `<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPaths[name]||iconPaths.sparkle}</svg>`;}

# 麦麦预算助手 · McD Budget Buddy

在 WorkBuddy 等支持 Skill 与 MCP 的 AI 客户端里，根据地点、预算和饮食偏好，推荐最多两套经过麦当劳价格接口核算的到店自取方案。

## 当前状态

第一版 Skill 与本地校验脚本已完成。用户已在 WorkBuddy 中做过真实接口探索验证；本版本尚待在新对话中完整试用。不宣称已完成实时端到端测试，也尚未提交比赛报名。

## 使用

1. 按 [官方指南](https://github.com/M-China/mcd-mcp-server)在客户端连接麦当劳 MCP，Token 仅保存在本地。
2. 下载本仓库，将整个 `mcd-budget-buddy` 文件夹通过客户端的本地 Skill 导入功能加载（需保留 SKILL.md 和 scripts、examples）。不同客户端的导入入口以其版本为准。
3. 如果客户端没有文件夹导入功能，可在项目目录打开客户端，要求其“读取当前目录 SKILL.md，并按麦麦预算助手流程执行”。这是手动试用，不代表已安装或自动触发。
4. 在新对话中输入：

> 使用麦麦预算助手。我在大钟寺附近，到店自取，预算30元，只接受无糖饮品，推荐两套方案。只查询和计算。

助手会让你选门店，然后查询菜单与券、读取套餐选配并核算。推荐必须与算价参数一致。若响应不回显选配，会明确说明限制。无解或工具失败时不会编造价格。

`mcp-config.example.json` 中的 ${MCD_MCP_TOKEN} 仅为占位符。不要假设客户端自动展开环境变量，须根据客户端文档在本地配置真实值，不提交真实配置。

## 本地验证

需要 Python 3，无额外依赖。

```bash
python3 scripts/check_plan.py examples/plan.json
python3 -m unittest discover -s tests -v
```

脚本检查具体选配与请求一致、金额不超过预算、错误响应不标为已核算、请求仅为算价。它不连接 MCP，也不证明餐品可售或饮料分类正确。历史示例来自用户提供的 2026-10-09 记录，不代表实时价格。

## 第一版范围

支持单门店到店自取、预算与偏好、最多两套核算方案。不执行下单、领券、积分兑换。无糖和无添加糖分别处理；餐品可售性未知、营养数据缺失及未来用餐价格均明确标注。

## 参赛进度

- [x] 编写 Skill、MCP 集成说明和校验脚本
- [x] 导入官方参赛声明原文
- [ ] WorkBuddy 新对话试用并记录结果
- [ ] 导出和清理真实开发记录 workbuddy.md（申请专项奖励时需要）
- [ ] 录制短演示
- [ ] 官方 Issue 报名并确认成功

WorkBuddy 记录必须由真实使用过程导出，不以 Codex 开发记录冒充。公开前检查 Token、个人信息和真实账户配置。

[赛事规则](https://github.com/M-China/mcd-developer-innovation-challenge/blob/main/activityGuidelines.md) · [MCP 集成](MCP_INTEGRATION.md)

本项目为独立开发的参赛作品，不代表麦当劳或腾讯官方产品。

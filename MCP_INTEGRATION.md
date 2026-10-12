# MCP 集成说明

使用麦当劳官方远程 MCP https://mcp.mcd.cn，客户端负责认证和调用。本项目的 Skill 指导已接入的 AI 客户端使用工具；本地校验脚本不负责网络连接。

| 工具 | 用途 |
|---|---|
| query-nearby-stores | 获取门店并由用户选择 |
| query-meals | 获取门店菜单 |
| query-store-coupons | 获取当前场景可用券 |
| query-meal-detail | 读取真实套餐轮次与选项 |
| calculate-price | 核算具体选配与优惠 |
| now-time-info | 获取时间上下文 |
| list-nutrition-foods | 按需查询官方营养数据 |

到店自取在历史验证中使用 beType=1、orderType=1，未传 beCode。参数以运行时真实 schema 为准。套餐饮料必须作为 roundList 子项传入；金额单位以 schema 为准。

用户在 WorkBuddy 中提供的历史验证显示，2026-10-09 在北京四道口餐厅将套餐饮料指定为无糖可乐后，算价返回 2500 分。响应未回显饮料，因此此结果仅说明按指定参数提交后取得该价格，不证明选配在最终订单中被确认。

第一版不提供订单创建和账户修改。Token 留在客户端本地配置，仓库只保存占位符。公开记录须移除认证头、手机号、私人地址、账号标识等。

## 网页后端（0.2.0）

Node.js 服务使用官方 MCP SDK，配置 MCD_MCP_TOKEN 后从固定官方地址发现工具；Ajv 对每次输入按实时 schema 校验。业务结果必须 success=true，错误响应不能成为价格。允许工具列表与 WorkBuddy 共用 shared/policy.json。

真实推荐以当前菜单显示元金额排序，尝试最多8个套餐，读取详情后按严格饮料条件组配，再向 calculate-price 提交 roundList。实际价格按整数分检查预算。本版仅查券不自动使用券，不承诺最低价；已完成真实门店、套餐核价和饮料调整后重算联调，见 examples/web-live-2026-10-12.json。

网页演示通过合成数据运行，同样使用计划与预算校验，界面始终显示演示标记。演示模式不会发起官方接口调用。

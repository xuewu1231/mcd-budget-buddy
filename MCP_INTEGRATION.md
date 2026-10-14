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

推荐与活动默认只查询；0.6.0 新增用户确认后的创建订单和订单查询。Token 留在客户端本地配置，仓库只保存占位符。公开记录须移除认证头、手机号、私人地址、账号标识等。

## 网页后端（当前 0.7.0）

Node.js 服务使用官方 MCP SDK，配置 MCD_MCP_TOKEN 后从固定官方地址发现工具；Ajv 对每次输入按实时 schema 校验。业务结果必须 success=true，错误响应不能成为价格。允许工具列表与 WorkBuddy 共用 shared/policy.json。

真实推荐以当前菜单显示元金额排序，尝试最多12个套餐，读取详情后按严格饮料条件组配，优先中杯/大杯及口味倾向；先覆盖各套餐，再探索主食/小食变体，最多18份搭配分别向 calculate-price 提交完整 roundList。按成功核价、预算和口味/差异排序返回最多3套，不用只换杯型凑方案。实际价格按整数分检查预算。门店券查询失败时明确标注，继续按无券参数核价；本版仅查券不自动使用券，不承诺最低价；已完成真实门店、套餐核价和饮料调整后重算联调，见 examples/web-live-2026-10-12.json。

网页仅提供真实查询。前端没有模式切换，后端拒绝非 live 请求；未配置时返回 NOT_CONFIGURED，接口失败保留真实错误。离线合成数据仅位于 tests/fixtures，用于自动化测试，不被应用服务导入。

## 活动日历与同款比价（0.3.0）

新增只读 `campaign-calendar` 和 `available-coupons`，均按实时 schema 校验。日历读取前查询 `now-time-info`，归一化 dailyList/events；活动只保留公开内容，不将订阅信息、couponId/couponCode 或原始响应透传。结构化时段以 couponInfo 为准；price=0 占位不生成免费报价。可领券不等于已拥有或门店可用券；本版不自动领取或应用。

`/api/compare` 要求两个不同门店与一份完整 roundList，两次 `calculate-price` 独立核算。商品与选配不同、其中一店失败时不输出价差。真实活动图片仅允许已确认的公开 HTTPS CDN，拒绝签名 URL 和任意远程地址。

## 下单交接（0.6.0）

2026-10-13 读取官方实时 tools/list 确认：create-order 的 items 支持完整 roundList；到店自取不传 beCode，takeWayCode 来自 calculate-price.takeWayList。官方 [工具列表](https://github.com/M-China/mcd-mcp-server#3-工具列表)提供 create-order、query-order，并说明返回支付链接。

- 普通 connect 仍只有 allowedTools；独立 checkout 流程才开放 checkoutTools（create-order/query-order），没有任意工具代理接口。
- /api/checkout-prepare 重新查询门店、详情和金额，保存服务端固定选配，5分钟内有效；尚不创建订单。
- /api/checkout-confirm 必须带明确确认与当前取餐方式；提交前再次算价，金额改变、超预算或过期时停止。创建参数来自服务端记录，忽略客户端另传餐品。
- 创建前先将防重复记录写入忽略提交的 local/checkout-receipts.json；响应丢失保留结果未确认，重复点击或重启不自动创建同一未结束搭配。不要删除该文件来处理不确定订单，先在官方渠道核对。
- /api/checkout-recent 和 /api/checkout-refresh 仅访问当前 Token 对应的本机创建记录。不等同于完整账户历史 order-list。
- 订单输出保留用户需要的公共门店、餐品、金额、状态、订单编号和取餐码，不透传手机号、客户昵称、配送私址或 Token。
- 支付入口只接受真实返回、订单编号一致的 https://m.mcd.cn/mcp/scanToPay 地址；未知地址先在官方渠道核对。没有直接代付工具，也不将打开链接当作付款成功。
- 返回的实付金额超预算或未知时停用支付链接；付款前仍需用户核对官方订单内容，特别是套餐饮料和杯型。

当前测试不调用 create-order，真实支付与取餐状态仍待用户验收；不宣称已跑通购买闭环。


## 麦乐送、官方热量与积分（0.7.0）

- 新增只读delivery-query-addresses、delivery-query-stores、query-my-account。外送用beType=2/orderType=2；beCode必须来自所选addressId的实时配送门店。算价不添加schema未定义的addressId，创建订单才传addressId；外送不传takeWayCode，备注最多50字。
- 推荐、重算、跨店对比和确认均使用同一场景；对比外送须保持同一地址。需要餐具时核价和创建都保持needTableware，整单总价而非餐品小计决定预算内外。配送/打包/餐具明细未返回时保持未知，不按0处理。
- 后端重新核对已有地址，浏览器只显示脱敏手机号；配送地址不写入浏览器偏好，公开测试记录不包含地址、联系人或订单数据。创建记录的配送详情仅保存在忽略提交且权限0600的local文件。
- list-nutrition-foods的当前data为带表头/行数的紧凑字符串，验证完整行数和列后解析energyKcal；也支持数组或JSON数组字符串。名字只作有限字形/空白/数量连接符归一化，保留杯型与份数。重复冲突数据、未知产品和特制保持未知，全部选配匹配才汇总整餐。缓存5分钟，显示真实数据查询时间，失败不阻断报价或造0。
- 积分只输出availablePoint、currentMouthExpirePoint、nextMouthExpirePoint的有效非负整数，未知不是0，不输出accountId，未返回具体到期日不推断日期。
- 订单确认和刷新新增共享文件锁并刷新磁盘记录，防止同版本多个本地服务重复创建。进程异常中断遗留锁时暂停创建，应先在官方渠道核对；不自动清锁后重试不确定订单。旧服务版本不兼容，不能同时用旧版本下单。

真实查询已验证：已有配送地址、可配送门店、含配送与打包费的整单核价、外送确认页和官方热量。未创建或支付真实订单。积分查询已返回三项字段。详见docs/FUNCTIONAL_REVIEW.md。

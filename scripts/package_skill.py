"""Package the WorkBuddy entrypoint and its actual local dependencies only."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
root = Path(__file__).resolve().parents[1]
out = root / 'releases' / 'mcd-budget-buddy-skill.zip'
out.parent.mkdir(exist_ok=True)
files = ['SKILL.md', 'LICENSE', 'MCP_INTEGRATION.md', 'mcp-config.example.json',
         'shared/policy.json', 'shared/nutrition.mjs', 'shared/order-state.mjs', 'scripts/check_plan.py', 'examples/plan.json', 'examples/web-live-2026-10-12.json', 'examples/discovery-live-2026-10-12.json']
with ZipFile(out, 'w', ZIP_DEFLATED) as z:
    z.writestr('mcd-budget-buddy/README.md', '# 麦麦预算助手 · WorkBuddy Skill\n\n在 WorkBuddy 中连接麦当劳 MCP 后导入此文件夹，或让客户端读取 SKILL.md 执行。保留 shared、scripts、examples 目录。无需启动网页服务。\n\n购买用法：先按预算搭配，明确确认门店、餐品、取餐方式和最新金额后创建待支付订单，付款在官方渠道完成。\n\n活动用法：查看今天的活动日历和明确使用时段，只展示可领券，不领取。\n\n点餐用法：我在大钟寺附近，预算30元，饮料明确无糖，先让我选择门店，只查询与计算。\n\nPython校验：python3 scripts/check_plan.py examples/plan.json。示例是历史数据，非实时价格。\n\n完整网页源码：https://github.com/xuewu1231/mcd-budget-buddy\n')
    for name in files:
        z.write(root / name, 'mcd-budget-buddy/' + name)
print(out)

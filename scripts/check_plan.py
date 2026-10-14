"""Validate declared selections against a price request; never sends network requests."""
import json
import sys
from decimal import Decimal
from pathlib import Path
POLICY = json.loads((Path(__file__).resolve().parents[1] / "shared/policy.json").read_text())


def validate(plan):
    errors = []
    req = plan.get('request', {})
    if req.get('method') != 'tools/call' or req.get('params', {}).get('name') != 'calculate-price':
        errors.append('请求必须是 calculate-price')
    args = req.get('params', {}).get('arguments', {})
    scene = plan.get('fulfillment', 'pickup')
    expected = POLICY.get(scene) if scene in ('pickup', 'delivery') else None
    if not expected or args.get('beType') != expected['beType'] or args.get('orderType') != expected['orderType']:
        errors.append('用餐场景与请求不一致')
    if scene == 'delivery' and not isinstance(args.get('beCode'), str):
        errors.append('外送必须使用对应门店的真实 beCode')
    elif scene == 'delivery' and not args.get('beCode'):
        errors.append('外送 beCode 不能为空')
    if scene == 'pickup' and args.get('beCode') is not None:
        errors.append('到店自取不传 beCode')
    items = args.get('items', [])
    declared = plan.get('selections', [])
    if not items or len(items) != len(declared):
        errors.append('餐品声明与请求数量不一致')
    for selection, item in zip(declared, items):
        if selection.get('productCode') != item.get('productCode') or selection.get('quantity') != item.get('quantity'):
            errors.append('餐品或数量不一致')
        expected = selection.get('roundList', [])
        if expected != item.get('roundList', []):
            errors.append('套餐选配与核算请求不一致')
        if selection.get('requiresCustomization') and not expected:
            errors.append('有选配要求但缺少 roundList')
    result = plan.get('result', {})
    if plan.get('priceStatus') == 'calculated':
        if result.get('isError') is not False or plan.get('businessSuccess') is not True:
            errors.append('不能把错误或未确认业务成功的响应标为已核算')
        price = result.get('price')
        if type(price) is not int or price < 0:
            errors.append('price 必须是非负整数分')
        else:
            budget = Decimal(str(plan['budgetYuan'])) * 100
            if price > budget:
                errors.append('核算价格超过预算')
    return errors


if __name__ == '__main__':
    with open(sys.argv[1], encoding='utf-8') as f:
        issues = validate(json.load(f))
    print(json.dumps({'valid': not issues, 'errors': issues}, ensure_ascii=False))
    sys.exit(bool(issues))

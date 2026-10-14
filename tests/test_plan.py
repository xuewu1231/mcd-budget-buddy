import copy
import json
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from check_plan import validate

class PlanTests(unittest.TestCase):
    def setUp(self):
        self.plan = json.loads((Path(__file__).resolve().parents[1] / 'examples/plan.json').read_text())
    def test_valid_historical_plan(self):
        self.assertEqual(validate(self.plan), [])
    def test_missing_customization(self):
        self.plan['request']['params']['arguments']['items'][0].pop('roundList')
        self.assertTrue(validate(self.plan))
    def test_over_budget(self):
        self.plan['budgetYuan'] = 24
        self.assertTrue(validate(self.plan))
    def test_error_not_calculated(self):
        self.plan['result']['isError'] = True
        self.assertTrue(validate(self.plan))
    def test_wrong_tool(self):
        self.plan['request']['params']['name'] = 'create-order'
        self.assertTrue(validate(self.plan))
    def test_different_drink(self):
        self.plan['request']['params']['arguments']['items'][0]['roundList'][2]['comboItemList'][0]['code'] = '3050'
        self.assertTrue(validate(self.plan))

    def test_delivery_scope(self):
        self.plan['fulfillment'] = 'delivery'
        args = self.plan['request']['params']['arguments']
        args.update(beType=2, orderType=2, beCode='test-be')
        self.assertEqual(validate(self.plan), [])
        args.pop('beCode')
        self.assertTrue(validate(self.plan))
    def test_wrong_delivery_or_pickup_be_code(self):
        args = self.plan['request']['params']['arguments']
        args['beCode'] = 'wrong-for-pickup'
        self.assertTrue(validate(self.plan))
        self.plan['fulfillment'] = 'delivery'
        self.assertTrue(validate(self.plan))

if __name__ == '__main__':
    unittest.main()

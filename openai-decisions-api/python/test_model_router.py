import unittest

from model_router import (
    estimate_cost,
    estimate_input_tokens,
    pick_model,
    routed_completion,
)


class ModelRouterTests(unittest.TestCase):
    def test_cost_example_matches_published_rates(self):
        self.assertAlmostEqual(estimate_cost("gpt-6-luna", 1000, 500), 0.00035)
        self.assertAlmostEqual(estimate_cost("gpt-6.1-terra", 1000, 500), 0.0035)

    def test_selects_cheapest_allowed_model(self):
        self.assertEqual(pick_model("summary", 1000), "gpt-6-luna")
        self.assertEqual(pick_model("reasoning", 1000), "gpt-6.1-terra")
        self.assertEqual(pick_model("coding", 1000), "gpt-6.1-terra")

    def test_input_estimate_has_a_minimum_of_one(self):
        self.assertEqual(estimate_input_tokens(""), 1)
        self.assertEqual(estimate_input_tokens("abcdefgh"), 2)

    def test_routed_completion_uses_actual_usage(self):
        class FakeResponse:
            output_text = "A concise summary."
            usage = type("Usage", (), {"input_tokens": 12, "output_tokens": 6})()

        class FakeClient:
            class responses:
                @staticmethod
                def create(**kwargs):
                    FakeClient.request = kwargs
                    return FakeResponse()

        client = FakeClient()
        result = routed_completion("Summarize this.", "summary", client=client)
        self.assertEqual(FakeClient.request["model"], "gpt-6-luna")
        self.assertEqual(FakeClient.request["reasoning"], {"effort": "low"})
        self.assertEqual(result["text"], "A concise summary.")
        self.assertAlmostEqual(result["cost_usd"], estimate_cost("gpt-6-luna", 12, 6))

    def test_rejects_unknown_task_and_negative_usage(self):
        with self.assertRaises(ValueError):
            pick_model("translation", 100)
        with self.assertRaises(ValueError):
            estimate_cost("gpt-6-luna", -1, 0)


if __name__ == "__main__":
    unittest.main()

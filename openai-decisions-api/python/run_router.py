"""Run a prompt through the cost-aware model router."""

import argparse

from model_router import routed_completion


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--task", required=True, choices=("summary", "extraction", "reasoning", "coding"))
    parser.add_argument("prompt", help="Prompt text to send to the Responses API")
    args = parser.parse_args()

    result = routed_completion(args.prompt, args.task)
    print(result["text"])
    print(
        f"\nModel: {result['model']} | "
        f"tokens: {result['input_tokens']} in / {result['output_tokens']} out | "
        f"estimated cost: ${result['cost_usd']:.6f}"
    )


if __name__ == "__main__":
    main()

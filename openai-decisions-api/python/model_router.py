"""Cost-aware model selection and Responses API calls."""

from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class ModelPrice:
    input: float
    output: float


MODELS = {
    "gpt-6-luna": ModelPrice(input=0.10, output=0.50),
    "gpt-6.1-terra": ModelPrice(input=1.00, output=5.00),
}

TASKS = {
    "summary": ("gpt-6-luna", "gpt-6.1-terra"),
    "extraction": ("gpt-6-luna", "gpt-6.1-terra"),
    "reasoning": ("gpt-6.1-terra",),
    "coding": ("gpt-6.1-terra",),
}


class ResponsesClient(Protocol):
    class responses(Protocol):
        @staticmethod
        def create(**kwargs: object) -> object: ...


def estimate_cost(model: str, input_tokens: int, output_tokens: int) -> float:
    """Estimate USD cost from per-million-token prices."""
    try:
        price = MODELS[model]
    except KeyError as exc:
        raise ValueError(f"Unknown model: {model}") from exc
    if input_tokens < 0 or output_tokens < 0:
        raise ValueError("Token counts must be non-negative.")
    return (input_tokens * price.input + output_tokens * price.output) / 1_000_000


def pick_model(task: str, input_tokens: int, output_tokens: int = 300) -> str:
    """Choose the cheapest model permitted for a task."""
    try:
        candidates = TASKS[task]
    except KeyError as exc:
        raise ValueError(f"Unknown task: {task}") from exc
    return min(
        candidates,
        key=lambda model: estimate_cost(model, input_tokens, output_tokens),
    )


def estimate_input_tokens(prompt: str) -> int:
    """Roughly estimate tokens at one token per four characters."""
    return max(1, len(prompt) // 4)


def routed_completion(
    prompt: str,
    task: str,
    *,
    client: ResponsesClient | None = None,
    output_token_budget: int = 300,
) -> dict[str, object]:
    """Call the Responses API using the cheapest allowed model and return usage."""
    if not prompt.strip():
        raise ValueError("Prompt must not be empty.")
    if output_token_budget < 1:
        raise ValueError("Output token budget must be positive.")
    if client is None:
        from openai import OpenAI

        client = OpenAI()

    input_tokens_estimate = estimate_input_tokens(prompt)
    model = pick_model(task, input_tokens_estimate, output_token_budget)
    response = client.responses.create(
        model=model,
        input=prompt,
        reasoning={"effort": "low"},
        max_output_tokens=max(2000, output_token_budget),
    )
    usage = response.usage
    actual_input_tokens = usage.input_tokens
    actual_output_tokens = usage.output_tokens
    return {
        "text": response.output_text,
        "model": model,
        "input_tokens": actual_input_tokens,
        "output_tokens": actual_output_tokens,
        "estimated_input_tokens": input_tokens_estimate,
        "cost_usd": estimate_cost(model, actual_input_tokens, actual_output_tokens),
    }

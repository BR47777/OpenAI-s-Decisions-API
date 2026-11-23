const ROUTES = [
  {
    value: "account_access",
    label: "Account access",
    description: "The customer cannot sign in or recover access",
  },
  {
    value: "billing",
    label: "Billing",
    description: "The customer needs help with a charge or invoice",
  },
  {
    value: "technical_support",
    label: "Technical support",
    description: "A product operation fails after the customer signs in",
  },
  {
    value: "needs_review",
    label: "Needs review",
    description: "The request is unclear or does not fit the available routes",
  },
];

function normalizedText(input) {
  return String(input || "").toLowerCase();
}

export function classifySupportRequest(input) {
  const text = normalizedText(input);
  const scores = Object.fromEntries(ROUTES.map((route) => [route.value, 0]));

  const accountTerms = ["sign in", "signin", "login", "log in", "password", "account", "locked", "access", "recover"];
  const billingTerms = ["charge", "charged", "invoice", "refund", "payment", "subscription", "card", "bill"];
  const technicalTerms = ["crash", "error", "bug", "broken", "fails", "failure", "technical", "cannot", "can't", "slow"];

  for (const term of accountTerms) if (text.includes(term)) scores.account_access += 1;
  for (const term of billingTerms) if (text.includes(term)) scores.billing += 1;
  for (const term of technicalTerms) if (text.includes(term)) scores.technical_support += 1;

  if (text.includes("can't sign in") || text.includes("cannot sign in") || text.includes("download") && text.includes("sign")) {
    scores.account_access += 2;
  }

  const ranked = ROUTES
    .map((route) => ({ ...route, score: scores[route.value] }))
    .sort((a, b) => b.score - a.score);
  const winner = ranked[0];

  if (winner.score === 0 || ranked[0].score === ranked[1].score) {
    return {
      type: "choice",
      value: "needs_review",
      label: "Needs review",
      confidence: 0.82,
      probabilities: Object.fromEntries(ROUTES.map((route) => [route.value, route.value === "needs_review" ? 0.82 : 0.06]))
    };
  }

  const probability = Math.min(0.96, 0.58 + winner.score * 0.07);
  const remaining = (1 - probability) / (ROUTES.length - 1);
  return {
    type: "choice",
    value: winner.value,
    label: winner.label,
    confidence: probability,
    probabilities: Object.fromEntries(ROUTES.map((route) =>
      [route.value, route.value === winner.value ? probability : remaining]
    ))
  };
}

export function evaluatePredicate(input, instructions) {
  const text = normalizedText(input);
  const positive = ["create", "replace", "update", "revoke", "rotate", "step", "then"];
  const negative = ["mention", "does not", "not explain", "unknown"];
  let probability = 0.5;

  for (const term of positive) if (text.includes(term)) probability += 0.06;
  for (const term of negative) if (text.includes(term)) probability -= 0.08;
  probability = Math.max(0.02, Math.min(0.98, probability));

  return {
    type: "predicate",
    probability,
    confidence: probability >= 0.75 || probability <= 0.25 ? 0.88 : 0.54,
  };
}

export function evaluateCoverage(input) {
  const text = normalizedText(input);
  const levels = [
    { index: 0, label: "No coverage", keywords: [] },
    { index: 1, label: "Partial coverage", keywords: ["mention", "overview", "general"] },
    { index: 2, label: "Complete coverage", keywords: ["create", "update", "revoke", "then", "steps"] },
  ];
  const scores = [0.08, 0.27, 0.65];
  if (!text.includes("create") && !text.includes("step")) {
    scores[0] += 0.38;
    scores[1] += 0.12;
    scores[2] -= 0.5;
  } else if (!text.includes("revoke") && !text.includes("update")) {
    scores[0] -= 0.05;
    scores[1] += 0.32;
    scores[2] -= 0.27;
  }
  const total = scores.reduce((sum, value) => sum + Math.max(0.01, value), 0);
  const probabilities = scores.map((value) => Math.max(0.01, value) / total);
  const score = probabilities.reduce((sum, probability, index) => sum + probability * index, 0);

  return {
    type: "score",
    score,
    confidence: probabilities.reduce((best, probability) => Math.max(best, probability), 0),
    levels,
    probabilities,
  };
}

export function choiceRequest(input) {
  return {
    model: process.env.DECISIONS_MODEL || "gpt-6-luna",
    input,
    questions: [{
      type: "choice",
      name: "support_route",
      instructions: "Choose the first team that should handle this request.",
      answers: ROUTES.map(({ value, description }) => ({ value, description })),
    }],
  };
}

export async function callDecisionsApi(payload, apiKeyOverride) {
  const apiKey = apiKeyOverride || process.env.OPENAI_API_KEY || process.env.AI_GATEWAY_API_KEY;
  if (!apiKey) throw new Error("Set OPENAI_API_KEY or AI_GATEWAY_API_KEY for live mode.");

  const url = process.env.DECISIONS_API_URL ||
    (process.env.AI_GATEWAY_API_KEY
      ? "https://ai-gateway.vercel.sh/v1/decisions"
      : "https://api.openai.com/v1/decisions");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error?.message || `Decisions API returned ${response.status}`);
  }
  return body;
}

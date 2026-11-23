const input = document.querySelector("#input");
const result = document.querySelector("#result");
const evaluateButton = document.querySelector("#evaluate-button");
const predicateOptions = document.querySelector("#predicate-options");
const instructions = document.querySelector("#instructions");
const apiKeyInput = document.querySelector("#api-key");
const keyStatus = document.querySelector("#key-status");
let decisionType = "choice";
let apiKey = sessionStorage.getItem("decisions_api_key") || "";

if (apiKey) {
  apiKeyInput.value = "••••••••••••";
  keyStatus.textContent = "Live API mode";
  document.querySelector("#save-key-button").textContent = "Clear key";
}

async function loadStatus() {
  if (apiKey) {
    document.querySelector("#status-text").textContent = "Live API";
    document.querySelector("#status-dot").classList.add("ready");
    return;
  }
  try {
    const response = await fetch("/api/health");
    const status = await response.json();
    document.querySelector("#status-text").textContent =
      status.mode === "live" ? "Live API" : "Local evaluator";
    document.querySelector("#status-dot").classList.add("ready");
  } catch {
    document.querySelector("#status-text").textContent = "Offline";
  }
}

function setType(type) {
  decisionType = type;
  document.querySelectorAll(".mode-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.type === type);
  });
  predicateOptions.hidden = type !== "predicate";
  const title = document.querySelector("#decision-title");
  title.textContent = type === "choice"
    ? "Which team should handle this request first?"
    : type === "predicate"
      ? "Does the passage satisfy the predicate?"
      : "How complete is the passage against the rubric?";
  result.hidden = true;
}

function percent(value) {
  return `${Math.round(Number(value || 0) * 100)}%`;
}

function formatLabel(value) {
  return String(value)
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function renderResult(payload) {
  const { result: decision, mode } = payload;
  if (decision.type === "refusal") {
    result.innerHTML = `<div class="error"><strong>Review required</strong><p>The model refused or could not provide a typed answer. Preserve the original request for human review.</p></div>`;
  } else if (decision.type === "choice") {
    const entries = Object.entries(decision.probabilities || {}).sort((a, b) => b[1] - a[1]).slice(0, 4);
    result.innerHTML = `
      <div class="result-grid">
        <div><div class="result-label">Selected answer</div><p class="result-value">${formatLabel(decision.label || decision.value)}</p></div>
        <div>${entries.map(([name, probability]) => `
          <div class="probability-row">
            <span>${formatLabel(name)}</span>
            <div class="bar"><span style="width:${percent(probability)}"></span></div>
            <strong>${percent(probability)}</strong>
          </div>`).join("")}</div>
      </div>`;
  } else if (decision.type === "predicate") {
    result.innerHTML = `
      <div class="result-grid">
        <div><div class="result-label">Estimated probability</div><p class="result-value">${percent(decision.probability)}</p></div>
        <div class="probability-row"><span>${decision.probability >= 0.5 ? "Condition likely true" : "Condition likely false"}</span><div class="bar"><span style="width:${percent(decision.probability)}"></span></div><strong>${percent(decision.confidence || 0)}</strong></div>
      </div>`;
  } else if (decision.type === "score") {
    result.innerHTML = `
      <div class="result-grid">
        <div><div class="result-label">Rubric score</div><p class="result-value">${Number(decision.score).toFixed(2)} / 2</p></div>
        <div>${decision.levels.map((level, index) => `
          <div class="probability-row"><span>${level.label}</span><div class="bar"><span style="width:${percent(decision.probabilities[index])}"></span></div><strong>${percent(decision.probabilities[index])}</strong></div>`).join("")}</div>
      </div>`;
  }
  result.insertAdjacentHTML("beforeend", `<p class="result-label" style="margin-top:14px">${mode === "live" ? "Native Decisions API" : "Local demonstration evaluator"}</p>`);
  result.hidden = false;
}

document.querySelector("#save-key-button").addEventListener("click", () => {
  const entered = apiKeyInput.value.trim();
  if (apiKey && entered.startsWith("••")) {
    apiKey = "";
    sessionStorage.removeItem("decisions_api_key");
    apiKeyInput.value = "";
    apiKeyInput.placeholder = "sk-...";
    keyStatus.textContent = "Local evaluator mode";
    document.querySelector("#save-key-button").textContent = "Use this key";
  } else if (entered) {
    apiKey = entered;
    sessionStorage.setItem("decisions_api_key", apiKey);
    apiKeyInput.value = "••••••••••••";
    keyStatus.textContent = "Live API mode";
    document.querySelector("#save-key-button").textContent = "Clear key";
  } else {
    keyStatus.textContent = "Enter an API key to enable live mode.";
  }
  loadStatus();
});

document.querySelectorAll(".mode-button").forEach((button) => {
  button.addEventListener("click", () => setType(button.dataset.type));
});

document.querySelectorAll("[data-example]").forEach((button) => {
  button.addEventListener("click", () => {
    if (button.dataset.title === "predicate") setType("predicate");
    else setType("choice");
    input.value = button.dataset.example;
  });
});

document.querySelector("#clear-button").addEventListener("click", () => {
  input.value = "";
  result.hidden = true;
  input.focus();
});

evaluateButton.addEventListener("click", async () => {
  if (!input.value.trim()) {
    result.innerHTML = `<div class="error"><strong>Input required</strong><p>Enter a request or passage before evaluating.</p></div>`;
    result.hidden = false;
    input.focus();
    return;
  }

  evaluateButton.disabled = true;
  evaluateButton.querySelector("span").textContent = "Evaluating...";
  try {
    const response = await fetch("/api/decisions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: decisionType,
        input: input.value,
        instructions: instructions.value,
        apiKey,
      }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Decision evaluation failed.");
    renderResult(payload);
  } catch (error) {
    result.innerHTML = `<div class="error"><strong>Review required</strong><p>${error.message}</p></div>`;
    result.hidden = false;
  } finally {
    evaluateButton.disabled = false;
    evaluateButton.querySelector("span").textContent = "Evaluate decision";
  }
});

loadStatus();

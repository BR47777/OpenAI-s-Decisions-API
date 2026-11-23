import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  classifySupportRequest,
  evaluatePredicate,
  evaluateCoverage,
  choiceRequest,
  callDecisionsApi,
} from "./decisions.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "..", "public");
const port = Number(process.env.PORT || 3000);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

async function readJson(request) {
  let body = "";
  for await (const chunk of request) body += chunk;
  if (!body) return {};
  try {
    return JSON.parse(body);
  } catch {
    throw new Error("Request body must be valid JSON.");
  }
}

function json(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function normalizeLiveChoice(apiResponse) {
  const answer = apiResponse.answers?.[0];
  if (!answer || answer.type === "refusal") return null;
  if (answer.type === "choice") {
    return {
      type: "choice",
      value: answer.value,
      label: answer.value,
      confidence: answer.confidence,
      probabilities: answer.option_probabilities || answer.probabilities || {},
    };
  }
  return null;
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);

  if (request.method === "GET" && url.pathname === "/api/health") {
    return json(response, 200, {
      ok: true,
      live: process.env.DECISIONS_LIVE === "1",
      mode: process.env.DECISIONS_LIVE === "1" ? "live" : "local",
    });
  }

  if (request.method === "POST" && url.pathname === "/api/decisions") {
    try {
      const body = await readJson(request);
      const input = String(body.input || "").trim();
      const apiKeyFromUi = String(body.apiKey || "").trim();
      const apiKey = apiKeyFromUi || (
        process.env.DECISIONS_LIVE === "1"
          ? process.env.OPENAI_API_KEY || process.env.AI_GATEWAY_API_KEY
          : ""
      );
      if (!input) return json(response, 400, { error: "Input is required." });
      if (input.length > 12000) return json(response, 413, { error: "Input is too long." });

      if (body.type === "predicate") {
        if (apiKey) {
          const payload = {
            model: process.env.DECISIONS_MODEL || "gpt-6-luna",
            input,
            questions: [{ type: "predicate", name: "answers_query", instructions: body.instructions }],
          };
          const apiResponse = await callDecisionsApi(payload, apiKey);
          return json(response, 200, { result: apiResponse.answers?.[0] || { type: "refusal" }, mode: "live" });
        }
        return json(response, 200, {
          result: evaluatePredicate(input, body.instructions),
          mode: "local",
        });
      }

      if (body.type === "score") {
        if (apiKey) {
          const payload = {
            model: process.env.DECISIONS_MODEL || "gpt-6-luna",
            input,
            questions: [{
              type: "score",
              name: "coverage",
              instructions: "Rate the passage against the coverage rubric.",
              levels: [
                { name: "no_coverage", description: "The passage provides no concrete coverage." },
                { name: "partial_coverage", description: "The passage provides some but incomplete coverage." },
                { name: "complete_coverage", description: "The passage provides complete, concrete coverage." },
              ],
            }],
          };
          const apiResponse = await callDecisionsApi(payload, apiKey);
          return json(response, 200, { result: apiResponse.answers?.[0] || { type: "refusal" }, mode: "live" });
        }
        return json(response, 200, {
          result: evaluateCoverage(input),
          mode: "local",
        });
      }

      if (apiKey) {
        const apiResponse = await callDecisionsApi(choiceRequest(input), apiKey);
        const result = normalizeLiveChoice(apiResponse);
        if (!result) return json(response, 200, { result: { type: "refusal" }, mode: "live" });
        return json(response, 200, { result, mode: "live" });
      }

      return json(response, 200, {
        result: classifySupportRequest(input),
        mode: "local",
      });
    } catch (error) {
      return json(response, 502, { error: error.message || "Unable to evaluate the decision." });
    }
  }

  const requestedPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = path.resolve(publicDir, `.${requestedPath}`);
  if (!filePath.startsWith(publicDir)) return json(response, 403, { error: "Forbidden" });

  try {
    const content = await readFile(filePath);
    const type = mimeTypes[path.extname(filePath)] || "application/octet-stream";
    response.writeHead(200, { "Content-Type": type });
    response.end(content);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
});

server.listen(port, () => {
  console.log(`Decisions app listening on http://localhost:${port}`);
});

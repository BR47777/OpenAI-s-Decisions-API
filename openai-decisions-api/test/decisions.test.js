import test from "node:test";
import assert from "node:assert/strict";
import { classifySupportRequest, evaluatePredicate, evaluateCoverage } from "../src/decisions.js";

test("account access takes priority over invoice mentions", () => {
  const result = classifySupportRequest("I cannot sign in to download the invoice.");
  assert.equal(result.value, "account_access");
});

test("billing requests route to billing", () => {
  const result = classifySupportRequest("I was charged twice and need a refund.");
  assert.equal(result.value, "billing");
});

test("unrecognized requests route to review", () => {
  const result = classifySupportRequest("The weather is nice today.");
  assert.equal(result.value, "needs_review");
});

test("predicate returns a probability", () => {
  const result = evaluatePredicate("Create a replacement key, update services, then revoke the old key.");
  assert.equal(result.type, "predicate");
  assert.ok(result.probability > 0.5);
});

test("coverage returns probability-weighted score", () => {
  const result = evaluateCoverage("Create a replacement key, update services, then revoke the old key.");
  assert.equal(result.type, "score");
  assert.ok(result.score >= 0 && result.score <= 2);
  assert.ok(Math.abs(result.probabilities.reduce((sum, value) => sum + value, 0) - 1) < 0.0001);
});

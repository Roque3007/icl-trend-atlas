import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the ICL Atlas application shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>ICL Atlas/);
  assert.match(html, /In-context learning shot-count evidence/);
  assert.match(html, /Trajectory overview/);
  assert.match(html, /Source evidence/);
  assert.match(html, /Screening pipeline/);
  assert.match(html, /icl-master-extraction\.xlsx/);
  assert.match(html, /Trajectory shapes across experiments/);
  assert.match(html, /Where additional shots help/);
  assert.match(html, /paper-weighted improved endpoints/);
  assert.match(html, /Architecture and parameter scale/);
  assert.match(html, /checkpoint-matched/);
  assert.match(html, /Selected experiment/);
  assert.match(html, /Data and methodology/);
  assert.match(html, /Download dataset/);
  assert.match(html, /taxonomy v(?:<!-- -->)?8/);
});

test("published evidence is source-verified and excludes timing outcomes", () => {
  const atlas = JSON.parse(readFileSync(new URL("../app/data/atlas.json", import.meta.url), "utf8"));
  // A verified-only export can contain no verified timing observations. The
  // invariant is that any such observations never enter performance analysis.
  assert.ok(atlas.trajectories.length > 0);
  assert.ok(atlas.trajectories.every((row) => row.verificationStatus === "source_table_verified"));
  assert.ok(atlas.trajectories.every((row) => row.resultTableLink?.startsWith("https://")));
  assert.ok(atlas.trajectories.every((row) => row.semanticOperation !== "System efficiency"));
  assert.ok(atlas.trajectories.every((row) => !/^(inference time|latency)/i.test(row.metric ?? "")));
  const matched = atlas.trajectories.filter((row) => row.modelParameterSource === "matched_public_checkpoint");
  assert.ok(matched.every((row) => row.modelParameterLabel.startsWith("≈") && row.modelParameterSourceUrl?.startsWith("https://")));
  assert.ok(atlas.trajectories.filter((row) => row.modelParameterSource === "not_reported").every((row) => row.modelParameterMillions === null));
  assert.ok(atlas.trajectories.filter((row) => row.semanticOperation === "Benchmark aggregate").every((row) => row.semanticScope === "Suite-level"));
  assert.ok(atlas.trajectories.filter((row) => row.task === "Aspect sentiment quad prediction").every((row) => row.semanticOperation === "Structured extraction"));
  assert.ok(atlas.trajectories.filter((row) => row.task === "Lexical simplification").every((row) => row.semanticOperation === "Rewriting / transformation"));
  const eventArguments = atlas.trajectories.filter((row) => row.paperId === "2023.acl-long.202");
  assert.equal(eventArguments.length, 6);
  assert.ok(eventArguments.every((row) => row.semanticOperation === "Structured extraction"));
  assert.ok(eventArguments.every((row) => row.results.map((point) => point.shotCount).join(",") === "0,1,10"));
  assert.ok(eventArguments.every((row) => row.statisticalTests.length === 0));
  const indicTranslation = atlas.trajectories.filter((row) => row.paperId === "2024.wmt-1.71");
  assert.equal(indicTranslation.length, 4);
  assert.ok(indicTranslation.every((row) => row.results.map((point) => point.shotCount).join(",") === "0,3,5,10"));
  assert.ok(indicTranslation.every((row) => row.resultTableLink.endsWith("2024.wmt-1.71.pdf#page=4")));
  const affect = atlas.trajectories.filter((row) => row.paperId === "2025.acl-long.1217");
  assert.equal(affect.length, 12);
  assert.ok(affect.every((row) => row.semanticOperation === "Rating prediction"));
  assert.equal(new Set(affect.map((row) => row.inputType)).size, 2);
  assert.ok(affect.every((row) => row.results.map((point) => point.shotCount).join(",") === "0,4,8,16,32"));
  assert.ok(affect.filter((row) => row.metric === "MAE").every((row) => row.metricDirection === "lower_is_better"));
});

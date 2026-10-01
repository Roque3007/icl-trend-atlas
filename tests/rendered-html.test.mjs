import assert from "node:assert/strict";
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
  assert.match(html, /Shot-count trajectory explorer/);
  assert.match(html, /Systematic evidence synthesis/);
  assert.match(html, /Trajectory comparison/);
  assert.match(html, /Evidence explorer/);
  assert.match(html, /icl-master-extraction\.xlsx/);
  assert.match(html, /All normalized trajectories/);
  assert.match(html, /Selected trajectory/);
  assert.match(html, /Data &amp; methodology/);
  assert.match(html, /Download dataset/);
});

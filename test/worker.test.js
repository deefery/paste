import test from "node:test";
import assert from "node:assert/strict";
import { handleRequest, escapeHtml, randomId, tokenMatches, MAX_PASTE_BYTES } from "../src/worker.js";

class MemoryKV {
  constructor() { this.values = new Map(); }
  async get(key) { return this.values.get(key)?.value ?? null; }
  async put(key, value, options) { this.values.set(key, { value, options }); }
  async delete(key) { this.values.delete(key); }
}

const env = () => ({ PASTES: new MemoryKV(), WRITE_TOKEN: "secret-token" });

test("escapes untrusted HTML", () => {
  assert.equal(escapeHtml('<script>alert("x")</script>'), "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
});

test("generates URL-safe 16-character IDs", () => {
  const ids = new Set(Array.from({ length: 100 }, randomId));
  assert.equal(ids.size, 100);
  for (const id of ids) assert.match(id, /^[A-Za-z0-9_-]{16}$/);
});

test("requires exact bearer token", () => {
  assert.equal(tokenMatches(new Request("https://paste.test", { headers: { Authorization: "Bearer secret-token" } }), "secret-token"), true);
  assert.equal(tokenMatches(new Request("https://paste.test", { headers: { Authorization: "Bearer secret-taken" } }), "secret-token"), false);
});

test("creates, reads, and serves raw paste", async () => {
  const bindings = env();
  const create = await handleRequest(new Request("https://paste.test/api/pastes", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer secret-token" },
    body: JSON.stringify({ content: "hello <world>", language: "text", expiresIn: 3600 }),
  }), bindings);
  assert.equal(create.status, 201);
  const created = await create.json();
  assert.match(created.id, /^[A-Za-z0-9_-]{16}$/);

  const page = await handleRequest(new Request(created.url), bindings);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /hello &lt;world&gt;/);

  const raw = await handleRequest(new Request(`${created.url}/raw`), bindings);
  assert.equal(raw.status, 200);
  assert.equal(await raw.text(), "hello <world>");
  assert.equal(raw.headers.get("X-Robots-Tag"), "noindex, nofollow, noarchive");
});

test("rejects unauthorized and oversized writes", async () => {
  const bindings = env();
  const unauthorized = await handleRequest(new Request("https://paste.test/api/pastes", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: "hello" }),
  }), bindings);
  assert.equal(unauthorized.status, 401);

  const oversized = await handleRequest(new Request("https://paste.test/api/pastes", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer secret-token" },
    body: JSON.stringify({ content: "x".repeat(MAX_PASTE_BYTES + 1) }),
  }), bindings);
  assert.equal(oversized.status, 413);
});

test("returns 404 for missing paste and disallows indexing", async () => {
  const missing = await handleRequest(new Request("https://paste.test/abcdefghijklmnop"), env());
  assert.equal(missing.status, 404);
  assert.equal(missing.headers.get("X-Robots-Tag"), "noindex, nofollow, noarchive");
});

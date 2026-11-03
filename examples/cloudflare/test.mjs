import assert from "node:assert/strict";

const base = process.argv[2] ?? "http://127.0.0.1:8794";
const results = [];
async function check(label, path = "/qa", method = "GET", status = 200) {
  const response = await fetch(new URL(path, base), { method, signal: AbortSignal.timeout(15000) });
  const text = await response.text();
  const result = { label, status: response.status, ray: response.headers.get("cf-ray") };
  results.push(result);
  assert.equal(response.status, status, `${label}: ${text}`);
  if (status === 200) {
    const body = JSON.parse(text);
    assert.equal(body.ok, true);
    assert.equal(body.output, "23");
    assert.equal(body.mapping.output, "😀23");
  }
}

try {
  await check("initial");
  for (let i = 0; i < 3; i++) await check(`repeat-${i}`);
  await Promise.all(Array.from({ length: 4 }, (_, i) => check(`concurrent-${i}`)));
  await check("unknown-path", "/qa-missing", "GET", 404);
  await check("wrong-method", "/qa", "POST", 405);
  console.log(JSON.stringify({ ok: true, base, requests: results.length, results }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ ok: false, base, results }, null, 2));
  throw error;
}

import assert from "node:assert/strict";
import { test } from "node:test";
import { validateProviderJobEndpoint } from "./providerJobs";

test("provider job endpoint validation accepts public HTTP(S) endpoints", async () => {
  assert.deepEqual(await validateProviderJobEndpoint("https://8.8.8.8/fish/jobs"), { ok: true, url: "https://8.8.8.8/fish/jobs" });
  assert.deepEqual(await validateProviderJobEndpoint("http://[2001:4860:4860::8888]/fish/jobs"), { ok: true, url: "http://[2001:4860:4860::8888]/fish/jobs" });
});

test("provider job endpoint validation rejects local and private destinations", async () => {
  const blocked = [
    "http://localhost/fish/jobs",
    "http://127.0.0.1/fish/jobs",
    "http://10.0.0.1/fish/jobs",
    "http://172.16.0.10/fish/jobs",
    "http://192.168.1.10/fish/jobs",
    "http://169.254.169.254/latest/meta-data",
    "http://[::1]/fish/jobs",
    "http://[fc00::1]/fish/jobs",
    "http://[fe80::1]/fish/jobs",
    "http://[::ffff:127.0.0.1]/fish/jobs",
    "http://[::127.0.0.1]/fish/jobs"
  ];

  for (const endpoint of blocked) {
    assert.deepEqual(await validateProviderJobEndpoint(endpoint), { ok: false, errorCode: "provider_job_endpoint_private" }, endpoint);
  }
});

test("provider job endpoint validation rejects unsupported schemes and credentialed URLs", async () => {
  assert.deepEqual(await validateProviderJobEndpoint("file:///etc/passwd"), { ok: false, errorCode: "provider_job_endpoint_invalid_scheme" });
  assert.deepEqual(await validateProviderJobEndpoint("https://fish:secret@8.8.8.8/fish/jobs"), { ok: false, errorCode: "provider_job_endpoint_invalid_auth" });
});

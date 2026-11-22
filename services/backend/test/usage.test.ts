import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { appendFile, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseMetricLine } from "../src/usage/metricsLog";
import { MetricsLogCollector } from "../src/usage/MetricsLogCollector";
import { rangeWindow, summarize } from "../src/usage/summarize";
import { InMemoryUsageRepository, startTestServer, type TestServer } from "./helpers";

/** A line as WSO2 4.7.0's gateway writes it (trimmed of fields we ignore). */
function line(kind: "response" | "faulty", props: Record<string, unknown>): string {
  return `20:51:15,229 [-] [PassThroughMessageProcessor-2]  INFO ELKCounterMetric apimMetrics: apim:${kind}, properties :${JSON.stringify(props)}`;
}

const OK = {
  apiName: "QuotaProbe",
  proxyResponseCode: 200,
  apiMethod: "GET",
  apiVersion: "1.0.0",
  correlationId: "c-1",
  apiId: "api-1",
  applicationName: "quota-a",
  targetResponseCode: 200,
  requestTimestamp: "2026-11-22T20:51:14.307Z",
  userIp: "192.168.65.1",
  apiResourceTemplate: "/get",
  responseLatency: 846,
  applicationId: "wso2-app-1",
};

describe("parseMetricLine", () => {
  it("reads a successful call", () => {
    assert.deepEqual(parseMetricLine(line("response", OK)), {
      correlationId: "c-1",
      timestamp: new Date("2026-11-22T20:51:14.307Z"),
      wso2ApplicationId: "wso2-app-1",
      apiId: "api-1",
      apiName: "QuotaProbe",
      apiVersion: "1.0.0",
      resource: "/get",
      method: "GET",
      status: 200,
      latencyMs: 846,
    });
  });

  it("reads a failed call, keeping its error type", () => {
    const event = parseMetricLine(
      line("faulty", {
        ...OK,
        correlationId: "c-2",
        proxyResponseCode: 429,
        errorType: "THROTTLED",
        errorCode: 900800,
        responseLatency: undefined,
      }),
    );
    assert.equal(event?.status, 429);
    assert.equal(event?.errorType, "THROTTLED");
    assert.equal(event?.latencyMs, undefined);
  });

  it("doesn't keep the caller's IP address", () => {
    assert.ok(!("userIp" in (parseMetricLine(line("response", OK)) ?? {})));
  });

  it("skips calls it can't tie to an application, and anything else", () => {
    for (const text of [
      line("faulty", { ...OK, applicationId: "UNKNOWN", proxyResponseCode: 401 }),
      line("response", { ...OK, correlationId: undefined }),
      line("response", { ...OK, requestTimestamp: "nonsense" }),
      "20:50:58,551 [-] INFO ELKMetricReporter LogMetricReporter successfully initialized",
      "apimMetrics: apim:response, properties :{not json",
      "",
    ]) {
      assert.equal(parseMetricLine(text), null, text);
    }
  });
});

describe("summarize", () => {
  const now = new Date("2026-11-22T20:30:00Z");

  it("puts 24 hours in hourly buckets ending with the current hour", () => {
    const { from, to, unit } = rangeWindow("24h", now);
    assert.equal(unit, "hour");
    assert.equal(to.toISOString(), "2026-11-22T21:00:00.000Z");
    assert.equal(from.toISOString(), "2026-11-21T21:00:00.000Z");
    const days = rangeWindow("7d", now);
    assert.equal(days.unit, "day");
    assert.equal(days.to.toISOString(), "2026-11-23T00:00:00.000Z");
  });

  it("totals calls, errors, throttling and latency, and fills empty buckets", () => {
    const { from, to, unit } = rangeWindow("24h", now);
    const at = (iso: string) => new Date(iso);
    const s = summarize(
      [
        { bucket: at("2026-11-22T20:00:00Z"), apiId: "a", apiName: "Alpha", status: 200, calls: 8, latencySum: 800, latencyCount: 8 },
        { bucket: at("2026-11-22T20:00:00Z"), apiId: "a", apiName: "Alpha", status: 429, calls: 2, latencySum: 0, latencyCount: 0 },
        { bucket: at("2026-11-22T18:00:00Z"), apiId: "b", apiName: "Beta", status: 500, calls: 1, latencySum: 50, latencyCount: 1 },
      ],
      { range: "24h", from, to, unit, p95: 149.6, lastCallAt: at("2026-11-22T20:29:00Z") },
    );
    assert.deepEqual(s.totals, { calls: 11, errors: 3, throttled: 2, errorRate: 3 / 11, avgLatencyMs: 94, p95LatencyMs: 150 });
    assert.equal(s.series.length, 24);
    assert.deepEqual(s.series.at(-1), { start: "2026-11-22T20:00:00.000Z", calls: 10, errors: 2 });
    assert.deepEqual(s.series.at(-3), { start: "2026-11-22T18:00:00.000Z", calls: 1, errors: 1 });
    assert.deepEqual(s.series[0], { start: "2026-11-21T21:00:00.000Z", calls: 0, errors: 0 });
    assert.deepEqual(s.apis, [
      { apiId: "a", apiName: "Alpha", calls: 10, errors: 2, avgLatencyMs: 100 },
      { apiId: "b", apiName: "Beta", calls: 1, errors: 1, avgLatencyMs: 50 },
    ]);
    assert.deepEqual(s.statuses, [
      { status: 200, calls: 8 },
      { status: 429, calls: 2 },
      { status: 500, calls: 1 },
    ]);
    assert.equal(s.lastCallAt, "2026-11-22T20:29:00.000Z");
  });

  it("reports zeros, without latency, when there were no calls", () => {
    const { from, to, unit } = rangeWindow("30d", now);
    const s = summarize([], { range: "30d", from, to, unit });
    assert.deepEqual(s.totals, { calls: 0, errors: 0, throttled: 0, errorRate: 0 });
    assert.equal(s.series.length, 30);
  });
});

describe("MetricsLogCollector", () => {
  let dir: string;
  let file: string;
  let usage: InMemoryUsageRepository;
  const event = (id: string) => line("response", { ...OK, correlationId: id }) + "\n";

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "opengate-usage-"));
    file = path.join(dir, "apim_metrics.log");
    usage = new InMemoryUsageRepository();
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  it("waits for the file to exist", async () => {
    assert.equal(await new MetricsLogCollector(file, usage).poll(), 0);
  });

  it("stores new events, and only whole lines", async () => {
    const collector = new MetricsLogCollector(file, usage);
    const partial = event("c-3");
    await writeFile(file, "noise\n" + event("c-1") + event("c-2") + partial.slice(0, 40));
    assert.equal(await collector.poll(), 2);
    assert.deepEqual([...usage.events.keys()], ["c-1", "c-2"]);

    await appendFile(file, partial.slice(40));
    assert.equal(await collector.poll(), 1);
    assert.equal(usage.events.size, 3);
    assert.equal(await collector.poll(), 0);
  });

  it("works through a backlog in chunks", async () => {
    await writeFile(file, Array.from({ length: 50 }, (_, i) => event(`c-${i}`)).join(""));
    await new MetricsLogCollector(file, usage, { chunkBytes: 2048 }).poll();
    assert.equal(usage.events.size, 50);
  });

  it("carries on where it stopped after a restart", async () => {
    await writeFile(file, event("c-1"));
    await new MetricsLogCollector(file, usage).poll();
    await appendFile(file, event("c-2"));
    const restarted = new MetricsLogCollector(file, usage);
    assert.equal(await restarted.poll(), 1);
    assert.equal(usage.events.size, 2);
  });

  it("starts over when the log rotates, without counting anything twice", async () => {
    await writeFile(file, event("c-1") + event("c-2"));
    const collector = new MetricsLogCollector(file, usage);
    await collector.poll();

    await rename(file, path.join(dir, "apim_metrics-1.log"));
    await writeFile(file, event("c-3"));
    assert.equal(await collector.poll(), 1);

    await writeFile(file, event("c-3")); // truncated and rewritten in place
    await collector.poll();
    assert.deepEqual([...usage.events.keys()].sort(), ["c-1", "c-2", "c-3"]);
  });
});

describe("GET /applications/:id/usage", () => {
  let server: TestServer;
  let usage: InMemoryUsageRepository;
  let alice: Record<string, string>;
  let bob: Record<string, string>;
  let appId: string;

  before(async () => {
    usage = new InMemoryUsageRepository();
    server = await startTestServer({ usage });
    alice = await server.login("alice@example.com");
    bob = await server.login("bob@example.com");
    server.wso2.respond = () => ({ status: 201, data: { applicationId: "wso2-app-1" } });
    appId = (await server.post("/applications", { name: "app" }, alice)).body.application.id;

    const recent = Date.now() - 5 * 60_000;
    await usage.insertMany([
      { correlationId: "1", timestamp: new Date(recent), wso2ApplicationId: "wso2-app-1", apiId: "a", apiName: "Alpha", status: 200, latencyMs: 100 },
      { correlationId: "2", timestamp: new Date(recent), wso2ApplicationId: "wso2-app-1", apiId: "a", apiName: "Alpha", status: 429 },
      { correlationId: "3", timestamp: new Date(recent), wso2ApplicationId: "someone-else", apiId: "a", apiName: "Alpha", status: 200 },
      { correlationId: "4", timestamp: new Date(Date.now() - 3 * 86_400_000), wso2ApplicationId: "wso2-app-1", apiId: "b", apiName: "Beta", status: 200, latencyMs: 300 },
    ]);
  });
  after(() => server.close());

  it("summarises the owner's calls for the range", async () => {
    const day = await server.get(`/applications/${appId}/usage`, alice);
    assert.equal(day.status, 200);
    assert.equal(day.body.range, "24h");
    assert.deepEqual(day.body.totals, { calls: 2, errors: 1, throttled: 1, errorRate: 0.5, avgLatencyMs: 100, p95LatencyMs: 100 });

    const week = await server.get(`/applications/${appId}/usage?range=7d`, alice);
    assert.equal(week.body.totals.calls, 3);
    assert.equal(week.body.series.length, 7);
    assert.deepEqual(week.body.apis.map((a: { apiName: string }) => a.apiName), ["Alpha", "Beta"]);
  });

  it("returns 404 for another user's application", async () => {
    assert.equal((await server.get(`/applications/${appId}/usage`, bob)).status, 404);
  });

  it("rejects an unknown range", async () => {
    assert.equal((await server.get(`/applications/${appId}/usage?range=1y`, alice)).status, 400);
  });

  it("says when usage isn't being collected", async () => {
    const plain = await startTestServer();
    try {
      const owner = await plain.login();
      plain.wso2.respond = () => ({ status: 201, data: { applicationId: "w" } });
      const id = (await plain.post("/applications", { name: "x" }, owner)).body.application.id;
      const res = await plain.get(`/applications/${id}/usage`, owner);
      assert.deepEqual(res.body, { enabled: false });
    } finally {
      await plain.close();
    }
  });
});

import { EventEmitter } from "node:events";
import http from "node:http";
import path from "node:path";
import { Readable } from "node:stream";
import { Worker } from "node:worker_threads";
import { crawlSite } from "../../dist/crawl.js";

const [marker, outputDir] = process.argv.slice(2);
const baseUrl = "http://127.0.0.1:19876";
const normal = marker === "NORMAL";
const routes = new Map([
  ["/", `<html><head><title>Before</title></head><body><p>BEFORE BODY</p>${normal ? "" : '<a href="/broken">Broken</a>'}<a href="/after">After</a></body></html>`],
  ["/broken", marker],
  ["/after", "<html><head><title>After</title></head><body><p>AFTER BODY</p></body></html>"],
]);

const originalRequest = http.request;
http.request = (url, _options, onResponse) => {
  const request = Object.assign(new EventEmitter(), {
    setTimeout: () => request,
    destroy: () => request,
    end: () => queueMicrotask(() => {
      const body = routes.get(url.pathname);
      const response = Object.assign(Readable.from([Buffer.from(body ?? "missing")]), {
        statusCode: body === undefined ? 404 : 200,
        headers: { "content-type": "text/html" },
      });
      onResponse(response);
    }),
  });
  return request;
};

const workers = new Map();
const terminatedThreadIds = [];
const originalPostMessage = Worker.prototype.postMessage;
const originalTerminate = Worker.prototype.terminate;
Worker.prototype.postMessage = function (...args) {
  if (!workers.has(this)) {
    workers.set(this, { threadId: this.threadId, limits: { ...this.resourceLimits } });
  }
  return originalPostMessage.apply(this, args);
};
Worker.prototype.terminate = function () {
  terminatedThreadIds.push(workers.get(this)?.threadId ?? this.threadId);
  return originalTerminate.call(this);
};

try {
  const started = performance.now();
  const result = await crawlSite(baseUrl, {
    maxPages: 10,
    maxDepth: 2,
    minContentWords: 1,
    outputMode: "jsonl",
    outputPath: path.join(outputDir, "crawl.jsonl"),
    json: false,
    mapOnly: false,
    rateLimitMs: 0,
    timeoutMs: 1000,
    maxSitemaps: 5,
    userAgent: "paperboy-conversion-test",
    ...(normal ? {} : {
      conversionWorkerUrl: new URL("./controlled-convert-worker.mjs", import.meta.url),
      conversionTimeoutMs: marker === "HANG" ? 200 : 2000,
      conversionResourceLimits: { maxOldGenerationSizeMb: 16, maxYoungGenerationSizeMb: 4 },
    }),
  });
  process.stdout.write(JSON.stringify({
    result,
    elapsedMs: performance.now() - started,
    workers: Array.from(workers, ([worker, info]) => ({ ...info, currentThreadId: worker.threadId })),
    terminatedThreadIds,
  }));
} finally {
  http.request = originalRequest;
  Worker.prototype.postMessage = originalPostMessage;
  Worker.prototype.terminate = originalTerminate;
  // Keep a missing failure-path termination from leaving a busy worker in the test process.
  await Promise.all(Array.from(workers.keys(), (worker) => originalTerminate.call(worker)));
}

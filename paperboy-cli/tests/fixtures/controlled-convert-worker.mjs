import { parentPort, threadId } from "node:worker_threads";

let conversions = 0;
parentPort.on("message", ({ id, filename, body }) => {
  if (body === "HANG") {
    while (true) {}
  }
  if (body === "OOM") {
    const retained = [];
    while (true) retained.push(new Array(100_000).fill(0));
  }
  if (body === "CRASH") process.exit(7);
  if (body === "ERROR") throw new Error("synthetic worker error");
  if (body === "FAIL") {
    parentPort.postMessage({ id, error: "synthetic conversion failure" });
    return;
  }
  conversions += 1;
  parentPort.postMessage({
    id,
    result: {
      markdown: body,
      title: filename,
      warnings: [`worker:${threadId}`, `conversion:${conversions}`],
    },
  });
});

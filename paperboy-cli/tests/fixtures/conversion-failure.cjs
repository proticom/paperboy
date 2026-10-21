const workerThreads = require("node:worker_threads");
const { pathToFileURL } = require("node:url");
const { syncBuiltinESMExports } = require("node:module");
const path = require("node:path");

const controlledWorker = pathToFileURL(path.join(__dirname, "controlled-convert-worker.mjs"));
const RealWorker = workerThreads.Worker;
workerThreads.Worker = class extends RealWorker {
  constructor(_filename, options) {
    super(controlledWorker, options);
  }
};
syncBuiltinESMExports();

const realSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = (callback, delay, ...args) => realSetTimeout(
  callback,
  delay === 30_000 ? 200 : delay,
  ...args,
);

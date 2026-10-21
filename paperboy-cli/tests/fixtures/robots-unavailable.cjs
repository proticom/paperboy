const http = require("node:http");
const { EventEmitter } = require("node:events");
const { Readable } = require("node:stream");
const { appendFileSync } = require("node:fs");

http.request = (url, _options, onResponse) => {
  appendFileSync(process.env.PAPERBOY_TEST_REQUEST_LOG, `${url.pathname}\n`);
  const request = new EventEmitter();
  request.setTimeout = () => request;
  request.destroy = (error) => request.emit("error", error);
  request.end = () => queueMicrotask(() => {
    if (process.env.PAPERBOY_TEST_ROBOTS_STATUS === "error") {
      request.emit("error", new Error("ECONNRESET"));
      return;
    }
    const response = Readable.from(["Unavailable"]);
    response.statusCode = Number(process.env.PAPERBOY_TEST_ROBOTS_STATUS);
    response.headers = { "content-type": "text/plain" };
    onResponse(response);
  });
  return request;
};

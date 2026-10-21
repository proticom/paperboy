const http = require("node:http");
const { EventEmitter } = require("node:events");
const { Readable } = require("node:stream");
const { appendFileSync } = require("node:fs");

http.request = (url, _options, onResponse) => {
  const scenario = process.env.PAPERBOY_TEST_ROBOTS_SCENARIO;
  appendFileSync(process.env.PAPERBOY_TEST_REQUEST_LOG, `${scenario ? url.toString() : url.pathname}\n`);
  const request = new EventEmitter();
  request.setTimeout = () => request;
  request.destroy = (error) => request.emit("error", error);
  request.end = () => queueMicrotask(() => {
    if (scenario) {
      const seedOrigin = "http://127.0.0.1:12345";
      const targetOrigin = "http://localhost:23456";
      let status = 200;
      let body = "";
      const headers = { "content-type": "text/html" };
      if (url.origin === targetOrigin && url.pathname === "/robots.txt") {
        if (process.env.PAPERBOY_TEST_ROBOTS_STATUS === "error") {
          request.emit("error", new Error("ECONNRESET"));
          return;
        }
        status = Number(process.env.PAPERBOY_TEST_ROBOTS_STATUS);
      } else if (url.origin === seedOrigin && url.pathname === "/robots.txt") {
        body = "User-agent: *\nAllow: /";
      } else if (url.pathname === "/sitemap.xml") {
        status = 404;
      } else if ((scenario === "seed" && url.pathname === "/") || url.pathname.startsWith("/offhost")) {
        status = 302;
        headers.location = `${targetOrigin}/wild/y`;
      } else {
        body = '<html><head><title>Public</title></head><body><h1>Public page</h1><p>Public content with enough words to save this page.</p>' +
          (url.pathname === "/" ? '<a href="/offhost2">Other</a><a href="/next">Next</a><a href="/offhost3">Other again</a>' : "") + '</body></html>';
      }
      const response = Readable.from([body]);
      response.statusCode = status;
      response.headers = headers;
      onResponse(response);
      return;
    }
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

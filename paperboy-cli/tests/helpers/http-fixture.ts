import { EventEmitter } from "node:events";
import { Readable } from "node:stream";

export type HttpRoute =
  | { kind: "response"; status: number; body: string | Iterable<Buffer>; location?: string; contentType?: string }
  | { kind: "error"; message: string }
  | { kind: "timeout" };

export function createHttpFixture(routes: Record<string, HttpRoute>) {
  const requests: Array<{ url: string; at: number }> = [];
  const responses: Readable[] = [];
  const request = (url: URL, _options: unknown, onResponse: (response: Readable & {
    statusCode: number; headers: Record<string, string>;
  }) => void) => {
    requests.push({ url: url.toString(), at: Date.now() });
    const route: HttpRoute = routes[url.toString()] ?? routes[url.pathname] ?? { kind: "response", status: 404, body: "" };
    let onTimeout = () => {};
    const request = new EventEmitter();
    return Object.assign(request, {
      setTimeout(_ms: number, callback: () => void) { onTimeout = callback; },
      destroy(error: Error) { queueMicrotask(() => request.emit("error", error)); },
      end() {
        queueMicrotask(() => {
          if (route.kind === "error") {
            request.emit("error", new Error(route.message));
          } else if (route.kind === "timeout") {
            onTimeout();
          } else {
            const response = Object.assign(Readable.from(
              typeof route.body === "string" ? [Buffer.from(route.body)] : route.body,
              { highWaterMark: 1 },
            ), {
              statusCode: route.status,
              headers: {
                "content-type": route.contentType ?? "text/html",
                ...(route.location ? { location: route.location } : {}),
              },
            });
            response.on("close", () => {
              if (!response.readableEnded) response.emit("aborted");
            });
            responses.push(response);
            onResponse(response);
          }
        });
      },
    });
  };
  return { request, requests, responses };
}

import { createServer, request as createRequest } from "node:http";
import {
  brotliDecompressSync,
  gunzipSync,
  inflateSync,
} from "node:zlib";

function assertLoopbackTarget(targetOrigin) {
  const target = new URL(targetOrigin);
  if (
    target.protocol !== "http:" ||
    !["127.0.0.1", "localhost"].includes(target.hostname)
  ) {
    throw new Error("Runtime app proxy target must be loopback HTTP.");
  }
  return target;
}

function snapshotRecord(record) {
  return {
    body: Buffer.concat(record.chunks),
    complete: record.complete,
    contentEncoding: record.contentEncoding,
    contentType: record.contentType,
    hasNextAction: record.hasNextAction,
    method: record.method,
    path: record.path,
    status: record.status,
  };
}

export function decodeRuntimeProxyBody(record) {
  const encoding = record.contentEncoding.trim().toLowerCase();
  if (!encoding || encoding === "identity") return record.body;
  if (encoding === "gzip") return gunzipSync(record.body);
  if (encoding === "deflate") return inflateSync(record.body);
  if (encoding === "br") return brotliDecompressSync(record.body);
  throw new Error(`Unsupported runtime proxy content encoding: ${encoding}`);
}

export async function createRuntimeAppProxy({ targetOrigin }) {
  const target = assertLoopbackTarget(targetOrigin);
  const actionRecords = [];

  const server = createServer((incoming, outgoing) => {
    const requestUrl = new URL(incoming.url ?? "/", target);
    const hasNextAction =
      incoming.method === "POST" &&
      typeof incoming.headers["next-action"] === "string" &&
      incoming.headers["next-action"].trim().length > 0;
    const record = hasNextAction
      ? {
          chunks: [],
          complete: false,
          contentEncoding: "",
          contentType: "",
          hasNextAction: true,
          method: incoming.method,
          path: `${requestUrl.pathname}${requestUrl.search}`,
          status: null,
        }
      : null;
    if (record) actionRecords.push(record);

    const upstream = createRequest(
      requestUrl,
      {
        headers: incoming.headers,
        method: incoming.method,
      },
      (upstreamResponse) => {
        if (record) {
          record.contentEncoding = String(
            upstreamResponse.headers["content-encoding"] ?? "",
          );
          record.contentType = String(
            upstreamResponse.headers["content-type"] ?? "",
          );
          record.status = upstreamResponse.statusCode ?? 0;
        }

        outgoing.writeHead(
          upstreamResponse.statusCode ?? 502,
          upstreamResponse.statusMessage,
          upstreamResponse.headers,
        );
        upstreamResponse.on("data", (chunk) => {
          if (record) record.chunks.push(Buffer.from(chunk));
          outgoing.write(chunk);
        });
        upstreamResponse.on("end", () => {
          if (record) record.complete = true;
          outgoing.end();
        });
        upstreamResponse.on("error", () => {
          if (record) record.complete = true;
          outgoing.destroy();
        });
      },
    );

    upstream.on("error", () => {
      if (record) record.complete = true;
      if (!outgoing.headersSent) {
        outgoing.writeHead(502, { "content-type": "text/plain" });
      }
      outgoing.end("Loopback runtime target unavailable.");
    });
    incoming.pipe(upstream);
  });

  await new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolvePromise);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Runtime app proxy did not expose a TCP port.");
  }

  return {
    async close() {
      await new Promise((resolvePromise, reject) =>
        server.close((error) =>
          error ? reject(error) : resolvePromise(),
        ),
      );
    },
    getActionCount() {
      return actionRecords.length;
    },
    origin: `http://127.0.0.1:${address.port}`,
    async waitForAction(index, timeoutMs = 10_000) {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const record = actionRecords[index];
        if (record?.complete) return snapshotRecord(record);
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 10));
      }
      throw new Error("Timed out waiting for the proxied Server Action body.");
    },
  };
}

/**
 * An in-process forward proxy that decides the destination ADDRESS a capture may connect to (mwg-train-ypgu).
 *
 * Chrome is launched with `--proxy-server` pointing here, so every request the browser makes - the navigation, a
 * redirect it follows, a subresource a page pulls in - arrives as a request to this process, which resolves the host,
 * applies the address policy in src/capture/target.mjs, and then connects to the address IT resolved. Nothing else in
 * the path owns the connection, which is the property two earlier attempts lacked:
 *   - checking the landing URL after the navigation described a redirect instead of preventing it (mwg-train-zpjt);
 *   - CDP interception plus a launch-time --host-resolver-rules pin protected a direct connection and was bypassed
 *     entirely once a proxy was configured, because the proxy resolves and connects (mwg-train-car1, third FAIL).
 *
 * The rebinding case is closed by construction rather than by a check: the address returned by
 * resolveAllowedAddress() is the address connected to, and the name is never resolved a second time, so an answer
 * that changes between the check and the connection cannot matter.
 *
 * Two request shapes are handled, because a browser uses both:
 *   - plain HTTP arrives in absolute form (`GET http://host/path HTTP/1.1`) and is forwarded to the validated
 *     address with the original Host header intact;
 *   - HTTPS arrives as CONNECT, which names host:port, so the tunnel is opened to the validated address and never
 *     inspected. TLS still verifies in the browser against the hostname the operator asked for, which a proxy that
 *     terminated TLS would break.
 *
 * The proxy binds loopback only. It is an enforcing proxy for one browser this process launched, not a service: an
 * open listener here would be an open proxy, and every request through it would be attributed to this host.
 *
 * Failing closed, stated because it is a deliberate difference from the earlier interceptor: a name this process
 * cannot resolve is REFUSED. Under the proxy there is no other resolver in the path - the browser will connect
 * wherever it is told - so "I could not resolve it" and "it is safe" are not the same statement, and the earlier
 * reasoning that justified continuing (the browser might resolve names this process could not) does not survive here.
 */
import http from 'node:http';
import net from 'node:net';
import { CaptureTargetError, resolveAllowedAddress } from './target.mjs';

/** The port a CONNECT target names, and the port an absolute-form URL implies. */
function targetPort(url) {
  if (url.port) return Number(url.port);
  return url.protocol === 'https:' ? 443 : 80;
}

/** Host and port from a CONNECT request, which names `host:port` and brackets an IPv6 literal. */
function connectTarget(authority) {
  const text = String(authority ?? '');
  const bracketed = /^\[([^\]]+)\]:(\d+)$/.exec(text);
  if (bracketed) return { hostname: bracketed[1], port: Number(bracketed[2]) };
  const separator = text.lastIndexOf(':');
  if (separator === -1) return { hostname: text, port: 443 };
  return { hostname: text.slice(0, separator), port: Number(text.slice(separator + 1)) || 443 };
}

/**
 * Start the proxy. Returns its port, its URL, the refusals it has made (the evidence a caller reports), and a close()
 * that also destroys any tunnel still open - a browser killed mid-navigation leaves sockets behind, and a leaked
 * tunnel would keep the proxy from closing and the process from exiting.
 */
export async function startCaptureProxy({ allowPrivate = false, lookup = undefined, onBlocked = null } = {}) {
  const blocked = [];
  // Every socket the proxy holds, tunnels and forwarded requests alike. close() must be able to finish even when a
  // browser was killed mid-request: server.close() waits for open connections, so a socket left behind keeps the
  // promise pending and the capture hanging after its work is done (measured: a test file sat for 400s on exactly
  // this before the socket set was tracked).
  const live = new Set();
  // Resolved by the first refusal, so a caller waiting on a navigation does not have to wait for the browser's own
  // timeout to learn that the request was refused: the decision is already made.
  let signalBlocked;
  const blockedSignal = new Promise((resolveSignal) => {
    signalBlocked = resolveSignal;
  });

  const record = (entry) => {
    blocked.push(entry);
    signalBlocked(entry);
    if (onBlocked) onBlocked(entry);
  };

  /** Ask the policy for the one address this connection may use, or the refusal to answer with. */
  const decide = async ({ hostname, port }) => {
    try {
      return { allowed: await resolveAllowedAddress({ hostname, port, allowPrivate, lookup }) };
    } catch (error) {
      if (!(error instanceof CaptureTargetError)) throw error;
      record({ host: hostname, port, code: error.code, message: error.message });
      return { error };
    }
  };

  const server = http.createServer((request, response) => {
    void (async () => {
      let target;
      try {
        target = new URL(request.url);
        if (target.protocol !== 'http:') throw new Error(`unexpected protocol ${target.protocol}`);
      } catch {
        // Not an absolute-form http URL: nothing to enforce, and guessing at it would be worse than refusing it.
        response.writeHead(400, { 'content-type': 'text/plain' });
        response.end('capture proxy: expected an absolute-form http URL\n');
        return;
      }
      const port = targetPort(target);
      const decision = await decide({ hostname: target.hostname, port });
      if (decision.error) {
        response.writeHead(403, { 'content-type': 'text/plain' });
        response.end(`capture proxy refused the destination: ${decision.error.message}\n`);
        return;
      }
      const { address, family } = decision.allowed;
      const headers = { ...request.headers };
      delete headers['proxy-connection'];
      const upstream = http.request(
        { host: address, family, port, method: request.method, path: `${target.pathname}${target.search}`, headers },
        (upstreamResponse) => {
          response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
          upstreamResponse.pipe(response);
        },
      );
      // Recorded rather than answered with a guess: a refused destination and an unreachable one are different, and
      // the caller can only tell a reader which happened if this is not flattened into one 403.
      upstream.on('error', () => {
        if (!response.headersSent) response.writeHead(502, { 'content-type': 'text/plain' });
        if (!response.writableEnded) response.end('capture proxy: the validated address could not be reached\n');
      });
      request.pipe(upstream);
    })().catch(() => {
      if (!response.headersSent) response.writeHead(502, { 'content-type': 'text/plain' });
      if (!response.writableEnded) response.end('capture proxy: request failed\n');
    });
  });

  server.on('connection', (socket) => {
    live.add(socket);
    socket.on('close', () => live.delete(socket));
  });

  server.on('connect', (request, clientSocket, head) => {
    clientSocket.on('error', () => clientSocket.destroy());
    void (async () => {
      const { hostname, port } = connectTarget(request.url);
      const decision = await decide({ hostname, port });
      if (decision.error) {
        clientSocket.end('HTTP/1.1 403 Forbidden\r\n\r\n');
        return;
      }
      const { address, family } = decision.allowed;
      const upstream = net.connect({ host: address, family, port });
      live.add(upstream);
      upstream.on('close', () => live.delete(upstream));
      upstream.on('error', () => {
        // The address was allowed; it just did not answer. A 502 keeps that distinct from a policy refusal.
        clientSocket.end('HTTP/1.1 502 Bad Gateway\r\n\r\n');
      });
      upstream.on('connect', () => {
        clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        if (head && head.length > 0) upstream.write(head);
        clientSocket.pipe(upstream);
        upstream.pipe(clientSocket);
      });
    })().catch(() => clientSocket.end('HTTP/1.1 502 Bad Gateway\r\n\r\n'));
  });

  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const { port } = server.address();

  return {
    port,
    url: `http://127.0.0.1:${port}`,
    blocked,
    blockedSignal,
    /** The refusal a blocked navigation deserves, or null when nothing was refused. */
    refusal() {
      if (blocked.length === 0) return null;
      const first = blocked[0];
      return new CaptureTargetError(first.code, first.message);
    },
    async close() {
      // Destroy first, then close: server.close() waits for open connections, so the order matters and a socket left
      // behind here is a hanging capture rather than a tidy shutdown.
      for (const socket of live) socket.destroy();
      live.clear();
      const closed = new Promise((resolveClose) => server.close(resolveClose));
      server.closeAllConnections?.();
      await closed;
    },
  };
}

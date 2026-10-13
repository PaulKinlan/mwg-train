import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import test from 'node:test';

import { CaptureTargetError, resolveAllowedAddress } from '../src/capture/target.mjs';
import { startCaptureProxy } from '../src/capture/proxy.mjs';

/** A local server that counts what reaches it, so "was it contacted" can be asserted rather than inferred. */
async function countingServer(body = '<html><body>local</body></html>') {
  const hits = [];
  const server = http.createServer((request, response) => {
    hits.push(request.url);
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end(body);
  });
  await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
  return { server, hits, port: server.address().port };
}

/** One HTTP request through the proxy, in absolute form, as a browser sends it. */
function proxyRequest(proxyPort, target, { method = 'GET' } = {}) {
  return new Promise((resolveResult, rejectResult) => {
    const socket = net.connect(proxyPort, '127.0.0.1', () => {
      socket.write(`${method} ${target} HTTP/1.1\r\nHost: ${new URL(target).host}\r\nConnection: close\r\n\r\n`);
    });
    let raw = '';
    socket.on('data', (chunk) => { raw += chunk.toString(); });
    socket.on('error', rejectResult);
    socket.on('close', () => resolveResult(raw));
  });
}

/** A CONNECT attempt through the proxy, as a browser sends it for https. */
function connectRequest(proxyPort, authority) {
  return new Promise((resolveResult, rejectResult) => {
    const socket = net.connect(proxyPort, '127.0.0.1', () => {
      socket.write(`CONNECT ${authority} HTTP/1.1\r\nHost: ${authority}\r\n\r\n`);
    });
    let raw = '';
    socket.on('data', (chunk) => { raw += chunk.toString(); });
    socket.on('error', rejectResult);
    socket.on('close', () => resolveResult(raw));
  });
}

test('the connect-time decision: an address is resolved once, checked, and returned to be connected to', async () => {
  // This function is the whole point of the design. The address it returns is the one the proxy connects to and the
  // name is never resolved again, so an answer that changes between the check and the connection cannot matter.
  const publicLookup = async () => [{ address: '93.184.216.34' }];
  assert.deepEqual(await resolveAllowedAddress({ hostname: 'example.com', port: 443, lookup: publicLookup }), { address: '93.184.216.34', family: 4 });

  for (const hostname of [
    '127.0.0.1', '169.254.169.254', '10.0.0.5', '::1', '::ffff:127.0.0.1', 'localhost',
    // mwg-train-uin8: not loopback and not private, but not globally reachable either. The first version of this
    // policy listed the ranges that came to mind and admitted all of these.
    '224.0.0.1', '239.255.255.250', // multicast
    '240.0.0.1', '255.255.255.255', // reserved
    '192.0.2.1', '198.51.100.1', '203.0.113.1', // documentation (TEST-NET-1/2/3)
    '192.88.99.1', // 6to4 relay anycast, deprecated
    'fec0::1', // site-local, deprecated
    '2001:db8::1', // documentation
    '2002::1', // 6to4
    '100::1', // discard-only
    '64:ff9b:1::1', // local-use NAT64
    // mwg-train-4dn2: the rest of the registry's IPv6 allocations that are not globally reachable. The first
    // transcription of this list was IPv4's; these are the sub-prefixes within 2001::/23 and elsewhere that a second
    // review found, and they are transcribed per sub-prefix rather than as one block because part of that block
    // (Teredo, the AS112 delegations) IS globally reachable.
    '2001:2::1', // benchmarking (RFC 5180)
    '2001:10::1', // ORCHID, deprecated (RFC 4843)
    '2001:20::1', // ORCHIDv2 (RFC 7343)
    '2001:30::1', // Drone Remote ID (RFC 9374)
    '3fff::1', // documentation (RFC 9637)
    '5f00::1', // SRv6 SIDs (RFC 9602)
  ]) {
    await assert.rejects(
      () => resolveAllowedAddress({ hostname, port: 80, lookup: publicLookup }),
      (error) => error.code === 'PRIVATE_TARGET',
      `${hostname} must be refused`,
    );
  }
  // A name that answers with one public and one private address is refused, not admitted on the public one.
  await assert.rejects(
    () => resolveAllowedAddress({ hostname: 'mixed.test', port: 80, lookup: async () => [{ address: '93.184.216.34' }, { address: '127.0.0.1' }] }),
    (error) => error.code === 'PRIVATE_TARGET',
  );
  // A name this process cannot resolve is refused rather than passed on: under a proxy there is no other resolver,
  // so "could not resolve" and "is safe" are not the same statement.
  await assert.rejects(
    () => resolveAllowedAddress({ hostname: 'nowhere.test', port: 80, lookup: async () => { throw Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' }); } }),
    (error) => error.code === 'UNRESOLVABLE',
  );
  // A globally reachable address is still admitted, which is what keeps this a policy rather than a blanket refusal.
  for (const hostname of [
    '8.8.8.8', '93.184.216.34', '2606:4700::1111', '100:0:0:1::1',
    // Just outside each prefix added above: a policy that refuses everything also passes a refusal test, so the
    // neighbouring address of every new prefix is asserted admitted. These are the masks being tested, not the intent.
    '2001:3::1', '2001:40::1', '3fff:1000::1', '5f01::1',
  ]) {
    await resolveAllowedAddress({ hostname, port: 443, lookup: publicLookup });
  }
  // allowPrivate is the explicit opt-in the project needs for capturing servers it started itself.
  assert.deepEqual(await resolveAllowedAddress({ hostname: '127.0.0.1', port: 80, allowPrivate: true, lookup: publicLookup }), { address: '127.0.0.1', family: 4 });
});

test('an http request to a private destination is refused, and the destination is never contacted', async (t) => {
  const local = await countingServer();
  t.after(() => local.server.close());
  const proxy = await startCaptureProxy();
  t.after(() => proxy.close());

  const answer = await proxyRequest(proxy.port, `http://127.0.0.1:${local.port}/private?token=x`);
  assert.match(answer, /^HTTP\/1\.1 403/);
  assert.equal(local.hits.length, 0, 'a refused destination must not be contacted at all');
  assert.equal(proxy.blocked.length, 1);
  assert.equal(proxy.refusal().code, 'PRIVATE_TARGET');
});

test('a name that resolves privately is refused too, and one that resolves to the local server is connected to', async (t) => {
  const local = await countingServer();
  t.after(() => local.server.close());
  const proxy = await startCaptureProxy({
    // The interesting case: the NAME is not loopback, and only the resolver knows where it points. The proxy must
    // connect to the address it checked, not resolve again and hope for the same answer.
    lookup: async () => [{ address: '127.0.0.1' }],
  });
  t.after(() => proxy.close());

  const refused = await proxyRequest(proxy.port, `http://apparent-public.test:${local.port}/x`);
  assert.match(refused, /^HTTP\/1\.1 403/);
  assert.equal(local.hits.length, 0);

  // With the opt-in, the same name is forwarded - and it arrives, which proves the validated address was used.
  const allowing = await startCaptureProxy({ allowPrivate: true, lookup: async () => [{ address: '127.0.0.1' }] });
  t.after(() => allowing.close());
  const forwarded = await proxyRequest(allowing.port, `http://apparent-public.test:${local.port}/forwarded`);
  assert.match(forwarded, /^HTTP\/1\.1 200/);
  assert.deepEqual(local.hits, ['/forwarded'], 'the request must reach the address the resolver named');
});

test('a CONNECT to a private destination is refused, and an allowed one is tunnelled', async (t) => {
  // https arrives as CONNECT, which names host:port and is never inspected. The tunnel must be refused or opened on
  // the validated address; TLS verification then happens in the browser against the hostname, which is why this proxy
  // does not terminate TLS.
  const echo = net.createServer((socket) => socket.end('tunnelled'));
  await new Promise((resolveListen) => echo.listen(0, '127.0.0.1', resolveListen));
  t.after(() => echo.close());
  const echoPort = echo.address().port;

  const proxy = await startCaptureProxy();
  t.after(() => proxy.close());
  const refused = await connectRequest(proxy.port, `127.0.0.1:${echoPort}`);
  assert.match(refused, /^HTTP\/1\.1 403/);
  assert.equal(proxy.refusal().code, 'PRIVATE_TARGET');

  const allowing = await startCaptureProxy({ allowPrivate: true });
  t.after(() => allowing.close());
  const established = await connectRequest(allowing.port, `127.0.0.1:${echoPort}`);
  assert.match(established, /^HTTP\/1\.1 200 Connection Established/);
  assert.match(established, /tunnelled/, 'the tunnel must carry the upstream bytes');
});

test('a validated address that does not answer is a 502, distinct from a policy refusal', async (t) => {
  // Two different facts, two different answers: a reader has to be able to tell "we refused where this would have
  // gone" from "it was allowed and did not answer". A closed loopback port gives the second case without waiting.
  const closed = net.createServer();
  await new Promise((resolveListen) => closed.listen(0, '127.0.0.1', resolveListen));
  const closedPort = closed.address().port;
  await new Promise((resolveClose) => closed.close(resolveClose));

  const proxy = await startCaptureProxy({ allowPrivate: true });
  t.after(() => proxy.close());
  const answer = await proxyRequest(proxy.port, `http://127.0.0.1:${closedPort}/nothing`);
  assert.match(answer, /^HTTP\/1\.1 502/);
  assert.equal(proxy.blocked.length, 0, 'nothing was refused, so nothing may be recorded as a refusal');
});

test('an unresolvable name is refused with its own code, not flattened into a policy refusal', async (t) => {
  // A reader has to be able to tell "we refused where this would have gone" from "we could not find where it goes",
  // and a caller that reports them identically teaches the operator to distrust both.
  const proxy = await startCaptureProxy({ lookup: async () => { throw Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' }); } });
  t.after(() => proxy.close());
  const answer = await proxyRequest(proxy.port, 'http://nowhere.test/x');
  assert.match(answer, /^HTTP\/1\.1 403/);
  assert.equal(proxy.blocked[0].code, 'UNRESOLVABLE');
});

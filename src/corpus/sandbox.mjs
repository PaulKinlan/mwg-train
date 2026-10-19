import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { resolve } from 'node:path';

import { generatedServerMemoryMb } from '../eval/generated-server.mjs';
import { Sandbox } from '../viewer/sandbox.mjs';

/** Refuse before starting any generated code if the namespace mechanism is unavailable. */
export function requireCorpusSandbox({ platform = process.platform, bwrapAvailable = hasBwrap() } = {}) {
  if (platform !== 'linux' || !bwrapAvailable) {
    throw new Error(`cannot run generated project on ${platform}: bubblewrap (bwrap) Linux namespace sandbox is ${platform === 'linux' ? 'unavailable' : 'unsupported'}; refusing unsandboxed execution`);
  }
  return 'bubblewrap';
}

function hasBwrap() {
  try {
    execFileSync('bwrap', ['--version'], { stdio: 'ignore', timeout: 2000 });
    return true;
  } catch {
    return false;
  }
}

const MAX_BODY = 16 * 1024 * 1024;
const CORPUS_CPU_SECONDS = 20;
const CORPUS_WALL_MS = 120_000;

/** Expose a sandboxed server on host loopback, preserving root-relative URLs verbatim. */
export async function startCorpusSandbox(projectDir, { port, cpuSeconds = CORPUS_CPU_SECONDS, wallMs = CORPUS_WALL_MS }) {
  const mechanism = requireCorpusSandbox();
  const nodeHeapMb = generatedServerMemoryMb();
  const sandbox = new Sandbox({
    id: `corpus:${process.pid}:${port}:${Date.now()}`,
    siteDir: resolve(projectDir),
    nodeModulesDir: resolve(import.meta.dirname, '../../node_modules'),
    cpuSeconds,
    nodeHeapMb,
  });
  let listener;
  let wallTimer;
  let stopped = false;
  const stop = async () => {
    if (stopped) return;
    stopped = true;
    clearTimeout(wallTimer);
    sandbox.stop();
    // Close existing connections as well: a stalled untrusted request must not hold shutdown open.
    if (listener) {
      listener.closeAllConnections();
      await new Promise((done) => listener.close(() => done()));
    }
  };
  try {
    await sandbox.start();
    listener = createServer(async (req, res) => {
      try {
        const chunks = [];
        let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > MAX_BODY) {
            res.writeHead(413).end();
            return;
          }
          chunks.push(chunk);
        }
        const response = await sandbox.request({
          method: req.method,
          path: req.url,
          headers: req.headers,
          body: Buffer.concat(chunks),
        });
        // The bridge fetch decompresses response bodies. Forwarding its original content-encoding
        // or content-length would make Chrome decode twice or truncate the response.
        const headers = { ...response.headers };
        delete headers['content-encoding'];
        delete headers['content-length'];
        delete headers['transfer-encoding'];
        delete headers.connection;
        res.writeHead(response.status, headers);
        res.end(Buffer.from(response.bodyBase64, 'base64'));
      } catch (error) {
        if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain' });
        if (!res.writableEnded) res.end(`sandbox bridge failed: ${error.message}`);
      }
    });
    await new Promise((done, reject) => {
      listener.once('error', reject);
      listener.listen(port, '127.0.0.1', () => {
        listener.off('error', reject);
        done();
      });
    });
    // Independent of any stalled Chrome journey: the server cannot remain alive past this deadline.
    wallTimer = setTimeout(() => void stop(), wallMs);
    wallTimer.unref();
    return { port: listener.address().port, child: sandbox.child, log: () => sandbox.log, stop, sandbox, mechanism,
      memoryContainment: { mode: 'heap-only', nodeHeapMb, rssContained: false } };
  } catch (error) {
    await stop();
    throw error;
  }
}

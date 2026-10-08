/**
 * The sandbox a served site runs in.
 *
 * Generated sites are UNTRUSTED code running on a VM that holds owner-acting integrations (a
 * GitHub act-as-user proxy, search and model proxies on the host loopback). A served site must run
 * with no secrets, no repo or beads access, and no route to those proxies (design brief clause 19,
 * applied to the viewer by bead mwg-train-w6l).
 *
 * Mechanism (verified empirically on this VM, 2026-10-08):
 *   - bubblewrap with every namespace unshared. The new network namespace is the security
 *     boundary: it contains only a loopback, and the host's 127.0.0.1 is NOT that loopback, so a
 *     site cannot reach the host's proxies, and there is no external route at all. (Loopback TCP
 *     works inside the namespace without administrative help; `ip link set lo up` is NOT available
 *     here - the bounding capability set is empty - and is not needed.)
 *   - the filesystem is assembled from scratch: the node runtime and system libraries read-only,
 *     the site tree read-only at /site, an empty writable tmpfs at /data for the ephemeral SQLite
 *     database, /tmp a tmpfs. Nothing else on the host exists for the process - no repo, no beads
 *     DB, no ~/.config, no SSH keys. There is NO shared writable directory at all.
 *   - the environment is rebuilt from an allowlist (PATH, HOME, NODE_ENV, TZ, PILOT_PORT). No
 *     token, proxy URL or credential name survives --clearenv.
 *   - the ONLY channel in or out is the process's own stdio pipes: bridge-wrapper.mjs runs inside
 *     the sandbox, health-checks the site over the namespace loopback, and bridges framed HTTP
 *     requests between the pipes and the site. A unix-socket bridge in a shared directory was
 *     considered and rejected in review: a socket's authority is its path, and a site that can
 *     write the directory can substitute the endpoint. A pipe pair has no path and cannot be
 *     substituted.
 *   - --die-with-parent ties the site's lifetime to the viewer's, and the fleet reaper can
 *     attribute the whole tree through FLEET_LANE.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const WRAPPER_PATH = resolve(here, 'bridge-wrapper.mjs');
const SANDBOX_PORT = 18080;
const READY_TIMEOUT_MS = 25_000;

const T_READY = 1;
const T_REQUEST = 2;
const T_RESPONSE = 3;
const T_LOG = 4;
const T_GONE = 5;

function nodeRuntimeDir() {
  // The viewer runs under node; the site gets the same runtime, bind-mounted read-only at /node.
  // Only the version directory is mounted - never the home directory that contains it.
  return dirname(dirname(process.execPath));
}

function systemBinds() {
  const binds = [];
  for (const dir of ['/usr', '/bin', '/lib', '/lib64']) {
    if (existsSync(dir)) binds.push(['--ro-bind', dir, dir]);
  }
  // /etc/alternatives backs some /usr/bin entries on debian-alike systems.
  if (existsSync('/etc/alternatives')) binds.push(['--ro-bind', '/etc/alternatives', '/etc/alternatives']);
  return binds.flat();
}

export class Sandbox {
  /**
   * @param {object} args
   * @param {string} args.id            instance id (project id + version)
   * @param {string} args.siteDir       the tree to serve; mounted read-only at /site
   * @param {string} [args.entry]       entry point relative to /site, default server.mjs
   */
  constructor({ id, siteDir, entry = 'server.mjs', nodeModulesDir = null }) {
    this.id = id;
    this.siteDir = siteDir;
    this.entry = entry;
    this.nodeModulesDir = nodeModulesDir;
    this.child = null;
    this.log = '';
    this.startedAt = null;
    this.lastUsedAt = null;
    this.nextStreamId = 1;
    this.pending = new Map();
    this.recvBuffer = Buffer.alloc(0);
    this.ready = false;
    this.logBytes = 0;
  }

  async start() {
    if (this.child) return;
    const args = [
      '--unshare-all',
      '--die-with-parent',
      '--clearenv',
      '--setenv', 'PATH', '/node/bin:/usr/bin:/bin',
      '--setenv', 'HOME', '/tmp',
      '--setenv', 'NODE_ENV', 'production',
      '--setenv', 'TZ', 'UTC',
      '--setenv', 'PILOT_PORT', String(SANDBOX_PORT),
      '--setenv', 'FLEET_LANE', process.env.FLEET_LANE ?? 'mwg-train-viewer',
      '--ro-bind', nodeRuntimeDir(), '/node',
      ...systemBinds(),
      '--ro-bind', this.siteDir, '/site',
      // The corpus sites resolve their framework imports (hono, react, vue, ...) from the repo's
      // node_modules; inside the sandbox /site's parent is /, so it is mounted there, read-only.
      ...(this.nodeModulesDir && existsSync(this.nodeModulesDir) ? ['--ro-bind', this.nodeModulesDir, '/node_modules'] : []),
      '--ro-bind', WRAPPER_PATH, '/viewer/bridge-wrapper.mjs',
      '--tmpfs', '/tmp',
      '--tmpfs', '/data',
      '--dev', '/dev',
      '--proc', '/proc',
      '--',
      '/node/bin/node', '/viewer/bridge-wrapper.mjs', '--entry', `/site/${this.entry}`, '--port', String(SANDBOX_PORT),
    ];
    this.child = spawn('bwrap', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    this.child.stderr.on('data', (chunk) => {
      this.#appendLog(chunk.toString());
    });
    this.child.stdout.on('data', (chunk) => this.#onData(chunk));
    this.child.on('exit', (code, signal) => {
      this.#appendLog(`\n[exited code=${code} signal=${signal}]\n`);
      this.child = null;
      for (const { reject } of this.pending.values()) reject(new Error('sandbox exited'));
      this.pending.clear();
    });
    this.child.on('error', () => {
      this.child = null;
    });
    this.startedAt = new Date();
    this.lastUsedAt = this.startedAt;
    await this.#waitReady();
  }

  #appendLog(text) {
    // Untrusted site output accumulates here; cap it (a chatty site must not grow the viewer's
    // memory) and keep the tail, which is where the actionable diagnostics live.
    this.log += text;
    if (this.log.length > 256 * 1024) this.log = `…[earlier output discarded, capped at 256KB]
${this.log.slice(-192 * 1024)}`;
  }

  #onData(chunk) {
    this.recvBuffer = Buffer.concat([this.recvBuffer, chunk]);
    for (;;) {
      if (this.recvBuffer.length < 9) return;
      const length = this.recvBuffer.readUInt32BE(0);
      if (this.recvBuffer.length < 9 + length) return;
      const type = this.recvBuffer.readUInt8(4);
      const id = this.recvBuffer.readUInt32BE(5);
      const payload = this.recvBuffer.subarray(9, 9 + length);
      this.recvBuffer = this.recvBuffer.subarray(9 + length);
      if (type === T_READY) {
        this.ready = true;
        if (this.readyResolve) this.readyResolve();
      } else if (type === T_LOG) {
        this.#appendLog(`${payload.toString('utf8')}\n`);
      } else if (type === T_GONE) {
        this.#appendLog(`[site gone: ${payload.toString('utf8')}]\n`);
        this.child?.kill('SIGKILL');
      } else if (type === T_RESPONSE) {
        const entry = this.pending.get(id);
        if (entry) {
          this.pending.delete(id);
          try {
            entry.resolve(JSON.parse(payload.toString('utf8')));
          } catch (error) {
            entry.reject(error);
          }
        }
      }
    }
  }

  #waitReady() {
    return new Promise((resolvePromise, rejectPromise) => {
      const timeout = setTimeout(() => {
        this.stop();
        rejectPromise(new Error(`sandbox '${this.id}' did not become ready in ${READY_TIMEOUT_MS}ms:\n${this.log}`));
      }, READY_TIMEOUT_MS);
      this.readyResolve = () => {
        clearTimeout(timeout);
        resolvePromise();
      };
      const exitCheck = setInterval(() => {
        if (!this.child) {
          clearInterval(exitCheck);
          clearTimeout(timeout);
          rejectPromise(new Error(`sandbox '${this.id}' exited before becoming ready:\n${this.log}`));
        }
        if (this.ready) {
          clearInterval(exitCheck);
        }
      }, 100);
    });
  }

  /** Send one request to the site through the bridge. Resolves {status, headers, bodyBase64}. */
  request({ method, path, headers, body }) {
    if (!this.child || !this.ready) return Promise.reject(new Error('sandbox not running'));
    const id = this.nextStreamId;
    this.nextStreamId += 1;
    const payload = Buffer.from(
      JSON.stringify({ method, path, headers, bodyBase64: body ? Buffer.from(body).toString('base64') : undefined }),
      'utf8',
    );
    const frame = Buffer.alloc(9);
    frame.writeUInt32BE(payload.length, 0);
    frame.writeUInt8(T_REQUEST, 4);
    frame.writeUInt32BE(id, 5);
    return new Promise((resolvePromise, rejectPromise) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        rejectPromise(new Error('bridge request timed out'));
      }, 30_000);
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timeout);
          resolvePromise(value);
        },
        reject: (error) => {
          clearTimeout(timeout);
          rejectPromise(error);
        },
      });
      this.child.stdin.write(Buffer.concat([frame, payload]));
    });
  }

  touch() {
    this.lastUsedAt = new Date();
  }

  idleMs() {
    return this.lastUsedAt ? Date.now() - this.lastUsedAt.getTime() : 0;
  }

  get alive() {
    return this.child !== null;
  }

  stop() {
    if (this.child) {
      const child = this.child;
      try {
        child.stdin.end();
      } catch {
        /* closed */
      }
      child.kill('SIGTERM');
      setTimeout(() => {
        try {
          child.kill('SIGKILL');
        } catch {
          /* already gone */
        }
      }, 1500).unref();
      this.child = null;
    }
  }
}

/**
 * The registry of live instances. One sandbox per (run, project, version); idle instances are
 * reaped (default after 10 minutes) and the pool is bounded (LRU eviction), because browsers and
 * servers left running are exactly what the fleet reaper exists to kill.
 */
export class SandboxPool {
  constructor({ stateDir, idleMs = 10 * 60 * 1000, maxInstances = 8, nodeModulesDir = null } = {}) {
    this.stateDir = stateDir;
    this.idleLimitMs = idleMs;
    this.maxInstances = maxInstances;
    this.nodeModulesDir = nodeModulesDir;
    this.instances = new Map();
    this.sweeper = setInterval(() => this.sweep(), 30_000);
    this.sweeper.unref();
  }

  key(projectId, version) {
    return `${projectId}:${version}`;
  }

  get(projectId, version) {
    return this.instances.get(this.key(projectId, version)) ?? null;
  }

  async start({ runId, projectId, version, siteDir }) {
    const key = this.key(projectId, version);
    const existing = this.instances.get(key);
    // A running instance keeps serving the run it was started from: the run matters at START time
    // (which tree, which recorded sha), and in-site navigation does not carry the run parameter.
    // A start request naming a different run replaces the instance.
    if (existing?.alive && existing.runId === runId) {
      existing.touch();
      return existing;
    }
    if (existing) this.stop(existing);
    if (this.instances.size >= this.maxInstances) this.evictOldest();
    const sandbox = new Sandbox({ id: key, siteDir, nodeModulesDir: this.nodeModulesDir });
    sandbox.runId = runId;
    await sandbox.start();
    this.instances.set(key, sandbox);
    return sandbox;
  }

  evictOldest() {
    let oldest = null;
    for (const instance of this.instances.values()) {
      if (!oldest || instance.lastUsedAt < oldest.lastUsedAt) oldest = instance;
    }
    if (oldest) this.stop(oldest);
  }

  sweep() {
    for (const instance of [...this.instances.values()]) {
      if (!instance.alive || instance.idleMs() > this.idleLimitMs) this.stop(instance);
    }
  }

  stop(instance) {
    instance.stop();
    this.instances.delete(instance.id);
  }

  stopAll() {
    for (const instance of [...this.instances.values()]) this.stop(instance);
    clearInterval(this.sweeper);
  }
}

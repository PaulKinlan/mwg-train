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
 *     DB, no ~/.config, no SSH keys.
 *   - the environment is rebuilt from an allowlist (PATH, HOME, NODE_ENV, TZ, PILOT_PORT). No
 *     token, proxy URL or credential name survives --clearenv.
 *   - the only channel in or out is a unix socket in a bind-mounted bridge directory: socat inside
 *     the namespace relays it to the site's own 127.0.0.1 port. The viewer connects to the socket.
 *   - --die-with-parent ties the site's lifetime to the viewer's, and the fleet reaper can
 *     attribute the whole tree through FLEET_LANE.
 *
 * The wrapper inside the namespace is /bin/sh: socat in the background, then exec node. If socat
 * fails to start the health check times out and the instance is reported dead, not half-served.
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, rmSync } from 'node:fs';
import http from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SANDBOX_PORT = 18080;
const HEALTH_TIMEOUT_MS = 20_000;

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
   * @param {string} args.bridgeDir     host directory for the relay socket; mounted at /bridge
   * @param {string} [args.entry]       entry point relative to /site, default server.mjs
   * @param {string[]} [args.extraArgs] extra arguments after --port/--db
   */
  constructor({ id, siteDir, bridgeDir, entry = 'server.mjs', extraArgs = [] }) {
    this.id = id;
    this.siteDir = siteDir;
    this.bridgeDir = bridgeDir;
    this.entry = entry;
    this.extraArgs = extraArgs;
    this.socketPath = join(bridgeDir, 'sock');
    this.child = null;
    this.log = '';
    this.startedAt = null;
    this.lastUsedAt = null;
    // The bridge directory is writable by the site (the in-namespace socat creates the socket
    // there), so a hostile site could replace it. The proxy pins and re-checks this identity on
    // every connection; a replaced or symlinked socket is refused.
    this.socketIdentity = null;
  }

  async start() {
    if (this.child) return;
    mkdirSync(this.bridgeDir, { recursive: true });
    const inner = `socat UNIX-LISTEN:/bridge/sock,fork,reuseaddr TCP:127.0.0.1:${SANDBOX_PORT} & sleep 0.3; exec /node/bin/node /site/${this.entry} --port ${SANDBOX_PORT} --db /data/site.sqlite${this.extraArgs.length > 0 ? ` ${this.extraArgs.join(' ')}` : ''}`;
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
      '--bind', this.bridgeDir, '/bridge',
      '--tmpfs', '/tmp',
      '--tmpfs', '/data',
      '--dev', '/dev',
      '--proc', '/proc',
      '--',
      '/bin/sh', '-c', inner,
    ];
    this.child = spawn('bwrap', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    this.child.stdout.on('data', (chunk) => {
      this.log += chunk.toString();
    });
    this.child.stderr.on('data', (chunk) => {
      this.log += chunk.toString();
    });
    this.child.on('exit', (code, signal) => {
      this.log += `\n[exited code=${code} signal=${signal}]\n`;
      this.child = null;
    });
    this.startedAt = new Date();
    this.lastUsedAt = this.startedAt;
    await this.waitHealthy();
    const stat = lstatSync(this.socketPath);
    if (!stat.isSocket()) throw new Error(`sandbox '${this.id}' bridge is not a socket`);
    this.socketIdentity = { dev: stat.dev, ino: stat.ino };
  }

  /** Poll the relay socket until the site's /__health answers or the timeout bites. */
  async waitHealthy() {
    const started = Date.now();
    while (Date.now() - started < HEALTH_TIMEOUT_MS) {
      if (!this.child) throw new Error(`sandbox '${this.id}' exited before becoming healthy:\n${this.log}`);
      if (existsSync(this.socketPath)) {
        try {
          const status = await socketRequest(this.socketPath, 'GET', '/__health');
          if (status >= 200 && status < 500) return;
        } catch {
          /* not up yet */
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    this.stop();
    throw new Error(`sandbox '${this.id}' did not become healthy in ${HEALTH_TIMEOUT_MS}ms:\n${this.log}`);
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
      this.child.kill('SIGTERM');
      const child = this.child;
      setTimeout(() => {
        try {
          child.kill('SIGKILL');
        } catch {
          /* already gone */
        }
      }, 1500).unref();
      this.child = null;
    }
    rmSync(this.bridgeDir, { recursive: true, force: true });
  }
}

/** A single HTTP request over a unix socket; used for the health check. */
function socketRequest(socketPath, method, path) {
  return new Promise((resolve, reject) => {
    const request = http.request({ socketPath, method, path, timeout: 1500 }, (response) => {
      response.resume();
      response.on('end', () => resolve(response.statusCode));
    });
    request.on('timeout', () => request.destroy(new Error('timeout')));
    request.on('error', reject);
    request.end();
  });
}

/**
 * The registry of live instances. One sandbox per (project, version); idle instances are reaped
 * (default after 10 minutes) and the pool is bounded (LRU eviction), because browsers and servers
 * left running are exactly what the fleet reaper exists to kill.
 */
export class SandboxPool {
  constructor({ stateDir, idleMs = 10 * 60 * 1000, maxInstances = 8 } = {}) {
    this.stateDir = stateDir;
    this.idleLimitMs = idleMs;
    this.maxInstances = maxInstances;
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

  async start({ projectId, version, siteDir }) {
    const key = this.key(projectId, version);
    const existing = this.instances.get(key);
    if (existing?.alive) {
      existing.touch();
      return existing;
    }
    if (this.instances.size >= this.maxInstances) this.evictOldest();
    const bridgeDir = join(this.stateDir, 'bridges', createHash('sha256').update(key).digest('hex').slice(0, 16));
    const sandbox = new Sandbox({ id: key, siteDir, bridgeDir });
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

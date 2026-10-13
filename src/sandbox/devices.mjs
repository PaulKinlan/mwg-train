// Bubblewrap's --dev mounts an UNBOUNDED writable tmpfs. A sized tmpfs plus selected device nodes
// provides Node's ordinary I/O without allowing untrusted code to fill VM memory via /dev files.
// Never bind the host's /dev/pts: that would expose other users' host pseudo-terminals.
export const DEVICE_TMPFS_BYTES = 4 * 1024 * 1024;

export function boundedDeviceArgs() {
  return [
    '--size', String(DEVICE_TMPFS_BYTES), '--tmpfs', '/dev',
    ...['null', 'zero', 'full', 'random', 'urandom', 'tty'].flatMap((name) => [
      '--dev-bind', `/dev/${name}`, `/dev/${name}`,
    ]),
    '--dir', '/dev/pts', '--dir', '/dev/shm',
    '--symlink', '/proc/self/fd', '/dev/fd',
    ...['stdin', 'stdout', 'stderr'].map((name, fd) => ['--symlink', `/proc/self/fd/${fd}`, `/dev/${name}`]).flat(),
  ];
}

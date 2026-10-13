# Generated-server memory mitigations (mwg-train-ymms)

**Status: partial; process RSS is NOT contained on this VM.** `src/eval/generated-server.mjs` launches generated Node servers through bubblewrap on Linux. It now applies two bounded project-space mitigations:

1. `--size 67108864 --tmpfs /tmp`: private 64 MiB RAM-backed temporary storage. This only bounds that mount; writable project and database binds can still fill host storage. It does not cap process memory.
2. `NODE_OPTIONS=--max-old-space-size=<MB>` inside the sandbox: 512 MiB default; `MWG_GENERATED_SERVER_MEMORY_MB` accepts integer 64–4096. It caps V8 old-space for the main Node process, **not** native allocations/Buffer, RSS, worker threads or subprocesses. The macOS/CI `sandbox:'prefer'` path applies the heap option but has no private tmpfs or PID isolation. Do not use `RLIMIT_AS` / `ulimit -v`: Node reserves a large virtual address space and may fail to start.

A generated process returns `child.memoryContainment = {mode:'heap-only',rssContained:false,nodeHeapMb,tmpfsBytes,reason}` and emits an explicit RSS-uncontained warning. A read-only scout's unbounded `Buffer.alloc` process reached 13.8 GB despite `--max-old-space-size=64` and required reaper intervention: this is direct evidence that old-space is **not** a memory sandbox. Neither that probe nor any host cgroup mutation is part of this test suite.

A fully isolated process-memory limit requires delegated cgroup v2 containment provided by an authorized host operator (ideally atomic attachment before execution). The current lane lacks such delegation, and **host `/sys/fs/cgroup` writes are prohibited** after a scout safety incident. This branch performs no cgroup probe, attach, or write. The host-owner must supply and verify a separate mechanism before criterion 1 of `mwg-train-i5i2.5` or a live model-generated server can be called RSS-contained. The separate `src/corpus/harness.mjs` launcher is not changed here.

`test/generated-server-memory.test.mjs` verifies the exact bubblewrap tmpfs/heap arguments, normal Node startup, and a JS-old-space runaway that exits before a 20-second independently enforced deadline. The test never allocates unbounded native Buffers and always kills the process group in `finally`.

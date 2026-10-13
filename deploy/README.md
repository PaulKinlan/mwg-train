# Deploying the corpus viewer

The project's live surface - the corpus viewer with `/concepts` and `/tuning` - runs as a systemd service. This
directory holds the unit so it survives the machine it was first set up on, rather than existing only in
`/etc/systemd/system/` (mwg-train-arw).

## Why it is a service and not something a lane starts

The fleet reaper kills any process tree a lane started once it has been running for 120 minutes. A lane that started
the viewer to look at something would therefore have the surface disappear out from under it. That is precisely what
happened, repeatedly, and it is the bug this unit fixes: the viewer has to be supervised by the init system, not by
whatever agent happened to want it.

## Which is also why the state lives outside the checkout

The unit's `--state` points at `~/.local/state/mwg-train-viewer`, not into the repository. The canonical checkout at
`/home/exedev/mwg-train` is reset to `origin/main` on a timer, so anything written inside it is one reset away from
being gone. Nothing the viewer needs to remember belongs in the checkout.

## The deployed viewer needs a token

The unit passes `--host 0.0.0.0`, so the deployed viewer is reachable from the VM's network and not only from
loopback. Since mwg-train-hwbs it will not serve anything without a token. Set one in the unit's environment:

```sh
sudo systemctl edit mwg-train-viewer   # add: Environment=MWG_VIEWER_TOKEN=<a long random value>
```

and give that value to whoever opens the workbench. They can also open `http://<host>:7700/?token=<value>` once:
the viewer sets a `mwg_viewer` cookie and redirects the query away, so the token does not stay in the address bar,
in a bookmark, or in the `Referer` of every asset the page loads. Keep the value out of the repository - the unit's
environment is where a deployment secret belongs, and if none is configured the viewer generates one per process and
prints it to the journal (`journalctl -u mwg-train-viewer | grep 'viewer token'`), which is fine for a local run and
noisy for a deployment. `MWG_ALLOW_ANONYMOUS_VIEWER=1` restores the previous open behaviour, and the viewer says so
on stdout when it is taken.

## Install

```sh
sudo cp deploy/systemd/mwg-train-viewer.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now mwg-train-viewer
```

## Verify

```sh
systemctl is-enabled mwg-train-viewer   # enabled - it comes back after a reboot
systemctl is-active  mwg-train-viewer   # active
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:7700/           # 200
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:7700/concepts   # 200
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:7701/           # 200 - the live port
```

All of the above were measured on the machine this unit was written for: enabled, active, zero restarts since it
started, and those three paths each answering 200.

## Porting it

`User`, `WorkingDirectory`, the `PATH` environment, the absolute `node` path in `ExecStart` and the state directory
are all this machine's values. systemd requires an absolute path in `ExecStart`, so the node version is named
explicitly - change it when the node install moves. `src/viewer/server.mjs` takes `--corpus`, `--port`, `--live-port`,
`--host` and `--state`, so the ports are a choice rather than a requirement.

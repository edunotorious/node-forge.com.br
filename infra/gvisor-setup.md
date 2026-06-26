# gVisor (runsc) setup for the executor sandbox

When `RUNNER_RUNTIME=runsc` is set, the executor spawns ephemeral
runner containers under gVisor's user-space kernel instead of the
host kernel. This is the production-grade alternative to mounting
`/var/run/docker.sock` against the raw host.

Two steps on the host:

## 1. Install gVisor

```bash
# Ubuntu 20.04+, x86_64 or arm64
curl -fsSL https://gvisor.dev/archive.key | \
  sudo gpg --dearmor -o /etc/apt/keyrings/gvisor.gpg
echo "deb [arch=amd64,arm64 signed-by=/etc/apt/keyrings/gvisor.gpg] \
  https://storage.googleapis.com/gvisor/releases release main" | \
  sudo tee /etc/apt/sources.list.d/gvisor.list > /dev/null
sudo apt-get update -qq
sudo apt-get install -y runsc
runsc --version    # expect: release-20260622.0 or newer
```

## 2. Register `runsc` as a docker runtime — **with `--overlay2=none`**

This flag is critical. The gVisor default (`--overlay2=root:self`)
hides the sandbox's rootfs from the host. The executor calls
`container.get_archive("/work")` to pull `histogram.png` and any
other artefacts after the runner exits — with the default overlay
mode that call returns an empty tarball, so the UI never shows the
chart.

`--overlay2=none` makes the gofer write through to the rootfs that
the host can read.

Write `/etc/docker/daemon.json`:

```json
{
  "runtimes": {
    "runsc": {
      "path": "/usr/bin/runsc",
      "runtimeArgs": ["--overlay2=none"]
    }
  }
}
```

Then:

```bash
sudo systemctl restart docker
docker info --format '{{range $k,$v := .Runtimes}}{{$k}} {{end}}'
# expect: io.containerd.runc.v2 runc runsc
```

## 3. Tell the executor to use it

Set in `.env`:

```bash
RUNNER_RUNTIME=runsc
```

Recreate the executor container (env reads happen at start):

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build executor
```

## Verifying

```bash
# Anything inside the sandbox should report gVisor's kernel
docker run --rm --runtime=runsc node-forge-executor:latest uname -a
# Linux <id> 4.19.0-gvisor #1 SMP ... x86_64 GNU/Linux
```

Run a Bell-state circuit end-to-end through the UI; the **Plot Histogram**
output panel should show a PNG. If it doesn't, double-check that
`--overlay2=none` is in `runtimeArgs` (a stale config from earlier
gVisor docs may have it as `--overlay`, which is the deprecated flag).

## Rollback

If a Qiskit operation hits a syscall gVisor doesn't implement, flip
`RUNNER_RUNTIME=runc` in `.env` and `docker compose up -d --build executor`.
No code change; the runtime is a per-container kwarg.

# service-core

Pryv.io core server — handles user data (events, streams, accesses, webhooks) with pluggable storage engines.

**Current version**: 2.0.0-pre.2
**Working branch**: `refactor/pre-v2`
**Node.js**: 22.x
**Linting**: neostandard with `{ semi: true }`

## What's new in v2

### 2.0.0-pre.2 (current)

- **System streams refactor** — clean Mall-based account store replaces scattered serializer (639→158 lines)
- **openSource flag removed** — all features always enabled (webhooks, HFS, cache sync, email check)
- **Webhooks in-process** — webhooks service runs inside the API server process (no separate container)
- **Metadata updater inlined** — direct function call in HFS replaces TChannel RPC; `metadata`/`tprpc` components and `tchannel`/`protobufjs` dependencies removed
- **Cluster mode** — `bin/master.js` manages N API workers via Node.js cluster module (replaces runit)

### 2.0.0-pre.1

- **Storage plugin architecture** — engines (MongoDB, PostgreSQL, SQLite, filesystem, InfluxDB) are plugins under `storages/engines/` with manifest-driven config
- **Engine-agnostic production code** — zero `@pryv/boiler` imports in engines, config/logging injected via `_internals.js`
- **Formal storage interfaces** — `storages/interfaces/` with contracts for all storage types

## Architecture

```
node bin/master.js
  │
  ├── Master process
  │   ├── TCP pub/sub broker (:4222)
  │   └── Process manager (fork/monitor workers)
  │
  ├── N × API Worker (cluster, shared :3000)
  │   ├── API routes (events, streams, accesses, auth, …)
  │   ├── Socket.IO (real-time notifications)
  │   └── Webhooks subscriber (in-process)
  │
  ├── M × HFS Worker (cluster, shared :4000, 0 = disabled)
  │   ├── Series routes (high-frequency data)
  │   └── Metadata updater (in-process)
  │
  └── 0-1 × Previews Worker (:3001, lazy/optional)
```

Standalone mode (dev/test): `just start api-server`
Cluster mode: `just start-master` or `node bin/master.js`

### Configuration

```yaml
cluster:
  apiWorkers: 2    # number of API workers (default: 2)
  hfsWorkers: 1    # number of HFS workers (default: 1, 0 = disabled)

webhooks:
  inProcess: true  # start webhooks in API server (default: true)
  minIntervalMs: 5000
  maxRetries: 5
```

### Components

| Component | Purpose |
|-----------|---------|
| `api-server` | HTTP API + Socket.IO + webhooks service |
| `hfs-server` | High-frequency series data (InfluxDB) |
| `previews-server` | Image preview generation (GraphicsMagick) |
| `business` | Business logic, webhooks, series, system streams |
| `storage` | Engine-agnostic storage layer |
| `storages` | Plugin barrel — engines, interfaces, init |
| `mall` | Data access layer (events, streams, accesses) |
| `cache` | In-memory caching with pub/sub invalidation |
| `messages` | TCP pub/sub broker + client |
| `audit` | Audit logging (SQLite) |
| `middleware` | Express middleware (auth, versioning, errors) |
| `test-helpers` | Shared test infrastructure |

### Storage engines

| Engine | Storage types | Status |
|--------|--------------|--------|
| MongoDB | base, platform, user index | Production |
| PostgreSQL | base, platform, user index | Production |
| SQLite | platform, user account, user index, audit | Production |
| Filesystem | file (attachments) | Production |
| InfluxDB | series (HFS) | Production |


## Installation

Prerequisites:
- `make` and C/C++ compilation support
- [Node.js](https://nodejs.org/) 22.x (use [nvm](https://github.com/nvm-sh/nvm) or [n](https://github.com/tj/n))
- MongoDB 4.2+ (included via `scripts/setup-dev-env`)
- InfluxDB 1.x (`storages/engines/influxdb/scripts/setup` on Linux, `brew install influxdb@1` on macOS)
- GraphicsMagick (optional, for previews): `apt-get install graphicsmagick` / `brew install graphicsmagick`
- [just](https://github.com/casey/just#installation)

```bash
just setup-dev-env    # setup local file structure + MongoDB
just install          # install node modules
```


## Running

```bash
just start-deps                   # start MongoDB + InfluxDB
just start-master                 # cluster mode (N API workers)
just start api-server             # single API server (dev)
just start hfs-server             # HFS server (dev)
just start-mon api-server         # auto-restart on file changes
```


## Running with nginx

Use nginx as a reverse proxy in front of `bin/master.js` for SSL termination, domain routing, and serving multiple Pryv services on a single host.

Each backend uses cluster mode internally — `bin/master.js` forks N API workers sharing a single port, and HFS workers share their own port. nginx routes traffic to those ports.

### Start the processes

```bash
# Single command — master manages all workers:
#   N API workers sharing :3000 (includes webhooks)
#   M HFS workers sharing :4000 (0 = disabled)
#   Previews worker on :3001 (optional, lazy)
NODE_ENV=production node bin/master.js --config /path/to/config.yml
```

```yaml
# Config keys for worker counts
cluster:
  apiWorkers: 2    # N API workers (default: 2)
  hfsWorkers: 1    # M HFS workers (default: 1, 0 = disabled)
  previewsWorker: true  # lazy spawn on first request
```

The master process hosts the TCP pub/sub broker (:4222). All workers connect as clients automatically.

### nginx configuration

```nginx
upstream api_backend {
    # Cluster workers share :3000 — single upstream entry
    # ip_hash recommended for connection affinity (optional: Socket.IO uses WebSocket-only in cluster mode)
    ip_hash;
    server 127.0.0.1:3000;
}

upstream hfs_backend {
    server 127.0.0.1:4000;
}

server {
    listen 443 ssl;
    server_name core.example.com;

    ssl_certificate     /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    # API server (default)
    location / {
        proxy_pass http://api_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Socket.IO — requires WebSocket upgrade
    location /socket.io/ {
        proxy_pass http://api_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }

    # HFS (high-frequency series)
    location ~ ^/[^/]+/series/ {
        proxy_pass http://hfs_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### master.js alone vs. behind nginx

| | `bin/master.js` alone | Behind nginx |
|---|---|---|
| SSL termination | Via backloop.dev or config | nginx handles SSL |
| Domain routing | Single service | Multiple services per host |
| Static files | Not handled | nginx serves directly |
| Process management | Built-in auto-restart | Combine with systemd or PM2 |
| Clustering | Built-in (cluster module) | Same — cluster runs behind nginx |


## Testing

```bash
just test all                     # all components (MongoDB)
just test api-server              # single component
just test-pg all                  # PostgreSQL mode
just test-detailed api-server     # verbose output
just test-debug api-server        # with debugger
just test-parallel all            # parallel file execution
just clean-test-data              # reset SQLite DBs + user dirs
```

Extra Mocha params: `--bail` (stop on first failure), `--grep <text>` (filter tests)

Environment variables: `LOGS=<level>` (show server output), `DEBUG="*"` (debug info)


## Project structure

```
service-core/
├── bin/                    # Entry points
│   └── master.js           # Cluster master (N API workers)
├── components/             # Application components (npm workspaces)
│   ├── api-server/         # Main API server
│   ├── hfs-server/         # High-frequency series server
│   ├── previews-server/    # Image previews
│   ├── business/           # Business logic
│   ├── storage/            # Storage abstraction layer
│   ├── mall/               # Data access layer
│   ├── cache/              # Caching
│   ├── messages/           # TCP pub/sub
│   ├── audit/              # Audit logging
│   ├── middleware/         # Express middleware
│   ├── webhooks/           # Webhook business logic (runs in api-server)
│   └── test-helpers/       # Test infrastructure
├── storages/               # Plugin system (npm workspace)
│   ├── engines/            # mongodb, postgresql, sqlite, filesystem, influxdb
│   └── interfaces/         # Formal contracts per storage type
├── build/                  # Docker + deployment
└── justfile                # Development commands
```


## App configuration

Configuration loads from (last takes precedence):

1. Component default config (`components/<name>/config/default-config.yml`)
2. Environment-specific config (`{env}-config.yml`)
3. Config file via `--config <path>`
4. Command-line options (`--key:path=value`)


## Next steps (toward v2.0.0)

### In progress — Plan 14: Unified master process

Consolidating service-core's separate processes behind a single master.

- [x] Phase 1.1: Inline metadata updater into HFS (remove TChannel RPC)
- [x] Phase 1.2: Webhooks as in-process subscriber (remove separate container)
- [x] Phase 2: Create `bin/master.js` with cluster module
- [x] Phase 3: Add HFS as configurable child processes (M workers, 0=disabled)
- [x] Phase 4: Add previews worker (config-toggleable, GM check)
- [x] Phase 5: Single Dockerfile (replace per-component Dockerfiles + runit)
- [x] Phase 6: Socket.IO WebSocket-only in cluster mode (no sticky sessions needed)

### Backlog

| Plan | Description | Priority |
|------|-------------|----------|
| **Merge service-register** | Integrate user discovery service into service-core; evaluate PG/SQLite for shared register data | High |
| **Merge service-mfa** | Absorb MFA service as in-process module within API server | High |
| **Previews: replace GM** | Replace GraphicsMagick with pure-Node image processing | Medium |
| **Finalize storage plugins** | Complete test infrastructure for storage plugin architecture | Medium |
| **SQLite streams storage** | Re-implement SQLite nested-set tree for streams + prevent system stream leaks into storage | Low |
| **TypeScript + ESM** | Migrate from CommonJS to TypeScript with ESM output; enable top-level await | Low |



# License

[BSD-3-Clause](LICENSE)


# License

[BSD-3-Clause](LICENSE)

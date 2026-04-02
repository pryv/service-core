# Upgrading from single-core to multi-core

This guide covers upgrading a running single-core service-core deployment to a multi-core setup with shared platform database (rqlite).

## Overview

| | Single-core | Multi-core |
|---|---|---|
| Platform DB | SQLite (local file) | rqlite (distributed, shared) |
| User routing | All users on one instance | Each core hosts a subset of users |
| DNS | dnsLess (path-based) or single domain | `{username}.{domain}` subdomains |
| Config | `dnsLess: isActive: true` | `dns.domain` + `core.id` per instance |

## Prerequisites

- Running single-core deployment with users and data
- rqlite binary (`rqlited`) — [download from releases](https://github.com/rqlite/rqlite/releases)
- DNS control for the target domain (wildcard A record needed)
- A second machine or Dokku app for the second core (with its own PostgreSQL/MongoDB)

## Step-by-step

### 1. Install rqlite

Download and install on the host (or each host in a multi-host setup):

```bash
RQLITE_VERSION=8.36.14
wget "https://github.com/rqlite/rqlite/releases/download/v${RQLITE_VERSION}/rqlite-v${RQLITE_VERSION}-linux-amd64.tar.gz"
tar xzf "rqlite-v${RQLITE_VERSION}-linux-amd64.tar.gz"
sudo cp "rqlite-v${RQLITE_VERSION}-linux-amd64/rqlited" /usr/local/bin/
```

Start rqlite as a service:

```bash
# Replace PRIVATE_IP with the host's internal IP
sudo tee /etc/systemd/system/rqlite.service <<EOF
[Unit]
Description=rqlite distributed SQLite
After=network.target

[Service]
ExecStart=/usr/local/bin/rqlited \
  -node-id rqlite-1 \
  -http-addr 0.0.0.0:4001 \
  -http-adv-addr PRIVATE_IP:4001 \
  -raft-addr 0.0.0.0:4002 \
  -raft-adv-addr PRIVATE_IP:4002 \
  /var/lib/rqlite/data
Restart=on-failure
User=root

[Install]
WantedBy=multi-user.target
EOF

sudo mkdir -p /var/lib/rqlite/data
sudo systemctl daemon-reload
sudo systemctl enable rqlite
sudo systemctl start rqlite

# Verify
curl -s http://localhost:4001/status | python3 -c "import sys,json; print(json.load(sys.stdin)['store']['raft']['state'])"
# Should print: Leader
```

### 2. Migrate platform data to rqlite

Before changing the config, migrate the existing user data into rqlite:

```bash
node bin/migrate-platform-to-rqlite.js --core-id core-a --rqlite-url http://localhost:4001
```

This reads all users and their indexed account fields from the base storage (PostgreSQL/MongoDB) and populates rqlite with:
- `core-info/core-a` — core metadata
- `user-core/{username}` → `core-a` — maps every existing user to this core
- `user-indexed/{field}/{username}` — indexed fields (email, language, etc.)
- `user-unique/email/{email}` → `{username}` — reverse email index

Use `--dry-run` to preview without writing.

**Verify:**
```bash
curl -s 'http://localhost:4001/db/query?q=SELECT+COUNT(*)+FROM+keyValue'
```

### 3. Set up DNS

Create a wildcard DNS record for the multi-core domain:

```
*.mc.example.com  A  → <host-ip>
mc.example.com    A  → <host-ip>
```

Each core gets a subdomain: `core-a.mc.example.com`, `core-b.mc.example.com`.
Users get subdomains: `{username}.mc.example.com`.

### 4. Update the config

Change the single-core config to multi-core:

```yaml
# REMOVE these (single-core / dnsLess)
# dnsLess:
#   isActive: true
#   publicUrl: https://old-single-core.example.com

# ADD these (multi-core)
dnsLess:
  isActive: false

core:
  id: core-a              # unique per core
  ip: <host-public-ip>    # for DNS A record (optional if external DNS)
  available: true

dns:
  domain: mc.example.com  # shared domain for all cores
  active: false           # true only if using embedded DNS server

storages:
  platform:
    engine: rqlite         # was: sqlite
  engines:
    rqlite:
      url: http://<rqlite-host>:4001
      external: true       # don't spawn embedded rqlited
```

**Key changes:**
- `dnsLess.isActive` → `false`
- `core.id` → unique identifier for this core
- `dns.domain` → the shared domain
- `storages.platform.engine` → `rqlite` (was `sqlite`)
- `storages.engines.rqlite.url` → rqlite HTTP API URL
- `storages.engines.rqlite.external` → `true` (use the host-level rqlite, don't spawn one)

### 5. Restart the first core

Restart service-core. It will now:
- Use rqlite for all platform operations (registration, user lookup, core discovery)
- Generate API URLs as `https://{username}.{dns.domain}/`
- Identify itself as `core-a` in the platform

**Verify:**
```bash
# Service info should show multi-core URLs
curl -s https://core-a.mc.example.com/reg/service/info
# api: https://{username}.mc.example.com/

# Existing users should still be accessible
curl -s https://core-a.mc.example.com/{username}/auth/login -X POST ...

# Core discovery should work
curl -s 'https://core-a.mc.example.com/reg/cores?username={existing-user}'
# → { core: { url: "https://core-a.mc.example.com" } }
```

### 6. Deploy the second core

Set up a second instance with its own base storage (PostgreSQL/MongoDB) but sharing the same rqlite:

```yaml
core:
  id: core-b
  ip: <core-b-ip>
  available: true

dns:
  domain: mc.example.com

storages:
  platform:
    engine: rqlite
  engines:
    rqlite:
      url: http://<rqlite-host>:4001
      external: true
    postgresql:
      host: <core-b-pg-host>
      database: pryv_db_b
      # ... core-b's own PG credentials
```

### 7. Verify cross-core operation

```bash
# Register user on Core B
curl -s https://core-b.mc.example.com/users -X POST \
  -H 'Content-Type: application/json' \
  -d '{"appId":"test","username":"newuser","password":"pass","email":"new@test.com","invitationtoken":"enjoy","languageCode":"en"}'

# Discover from Core A → should point to Core B
curl -s 'https://core-a.mc.example.com/reg/cores?username=newuser'
# → { core: { url: "https://core-b.mc.example.com" } }

# List all cores
curl -s https://core-a.mc.example.com/system/admin/cores -H 'Authorization: <admin-key>'
# → { cores: [{ id: "core-a", userCount: N }, { id: "core-b", userCount: M }] }

# Hostings
curl -s https://core-a.mc.example.com/reg/hostings
# → both cores listed as available
```

## Nginx notes

When running behind nginx (including Dokku), each core needs:

1. **HFS proxy** — route `/{user}/events/{id}/series` to port 4000 with plain IP Host header (see `INSTALL.md`)
2. **Socket.IO** — WebSocket upgrade location for `/socket.io/`
3. **Upload size** — `client_max_body_size` matching `uploads.maxSizeMb`

## Rollback

To revert to single-core:
1. Stop the second core
2. Change config back: `storages.platform.engine: sqlite`, `dnsLess.isActive: true`, restore `dnsLess.publicUrl`
3. Remove `core.id` and `dns.domain`
4. Restart — the SQLite platform DB still has the original data

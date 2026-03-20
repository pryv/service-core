/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */

const assert = require('assert');
const dns = require('dns');
const dgram = require('dgram');
const dns2 = require('dns2');
const { Packet } = dns2;
const { createDnsServer } = require('../src');

const TEST_DOMAIN = 'test.pryv.me';
const TEST_TTL = 60;

// Mock platform
function createMockPlatform (opts = {}) {
  const userCores = opts.userCores || {};
  const coreInfos = opts.coreInfos || [];
  return {
    async getUserCore (username) {
      return userCores[username] || null;
    },
    async getCoreInfo (coreId) {
      return coreInfos.find(c => c.id === coreId) || null;
    },
    async getAllCoreInfos () {
      return coreInfos;
    }
  };
}

// Mock config
function createMockConfig (overrides = {}) {
  const store = {
    'dns:domain': TEST_DOMAIN,
    'dns:active': true,
    'dns:port': 0, // ephemeral
    'dns:ip': '127.0.0.1',
    'dns:ip6': null,
    'dns:defaultTTL': TEST_TTL,
    'dns:staticEntries': {
      www: { cname: 'web.example.com' },
      reg: { cname: 'register.example.com' },
      api: { a: ['5.6.7.8'] }
    },
    'dns:records:root': {
      a: ['1.2.3.4'],
      aaaa: ['::1'],
      ns: ['ns1.test.pryv.me', 'ns2.test.pryv.me'],
      mx: [{ exchange: 'mail.test.pryv.me', priority: 10 }],
      txt: ['v=spf1 ~all'],
      caa: [{ flags: 0, tag: 'issue', value: 'letsencrypt.org' }],
      soa: {
        primary: 'ns1.test.pryv.me',
        admin: 'admin.test.pryv.me',
        serial: 2026032001,
        refresh: 3600,
        retry: 600,
        expiration: 604800,
        minimum: 86400
      }
    },
    ...overrides
  };
  return {
    get (key) { return store[key]; }
  };
}

// Mock logger
function createMockLogger () {
  return {
    info () {},
    warn () {},
    error () {}
  };
}

// Raw UDP query for record types not exposed by dns.Resolver (SOA, CAA)
// and for NXDOMAIN checks (Resolver throws on NXDOMAIN instead of returning rcode)
let queryId = 1;
async function rawQuery (port, name, type) {
  const typeValue = typeof type === 'number' ? type : Packet.TYPE[type];
  const q = new Packet();
  q.header.id = queryId++;
  q.header.rd = 1;
  q.questions.push({ name, type: typeValue, class: Packet.CLASS.IN });
  const buf = q.toBuffer();

  return new Promise((resolve, reject) => {
    const sock = dgram.createSocket('udp4');
    const timer = setTimeout(() => {
      sock.close();
      reject(new Error('DNS query timeout'));
    }, 5000);
    sock.on('message', (msg) => {
      clearTimeout(timer);
      sock.close();
      resolve(Packet.parse(msg));
    });
    sock.on('error', (err) => {
      clearTimeout(timer);
      sock.close();
      reject(err);
    });
    sock.send(buf, port, '127.0.0.1');
  });
}

describe('[DNS] DNS Server', function () {
  this.timeout(30000);

  let server;
  let port;
  let resolver;

  const coreInfos = [
    { id: 'core1', ip: '10.0.0.1', ipv6: '::ffff:10.0.0.1', cname: null },
    { id: 'core2', ip: '10.0.0.2', ipv6: null, cname: null },
    { id: 'core-cname', ip: null, ipv6: null, cname: 'core3.external.com' }
  ];

  const userCores = {
    alice: 'core1',
    bob: 'core2',
    charlie: 'core-cname'
  };

  before(async () => {
    const platform = createMockPlatform({ userCores, coreInfos });
    const config = createMockConfig();
    const logger = createMockLogger();

    server = createDnsServer({ config, platform, logger });

    // Use port 0 to get an ephemeral port
    await server.start({ port: 0, ip: '127.0.0.1', ip6: null });
    const addrs = server._getAddresses();
    port = addrs.udp.port;

    // Node.js dns.Resolver pointed at our test server
    resolver = new dns.promises.Resolver();
    resolver.setServers([`127.0.0.1:${port}`]);
  });

  after(async () => {
    if (server) await server.stop();
  });

  // --- Root domain queries (dns.Resolver) ---

  describe('Root domain (dns.Resolver)', () => {
    it('[DN01] must resolve A record for root domain', async () => {
      const addresses = await resolver.resolve4(TEST_DOMAIN);
      assert.deepStrictEqual(addresses, ['1.2.3.4']);
    });

    it('[DN02] must resolve AAAA record for root domain', async () => {
      const addresses = await resolver.resolve6(TEST_DOMAIN);
      assert.strictEqual(addresses.length, 1);
      // Node normalizes IPv6; accept any form of ::1
      assert.ok(
        addresses[0] === '::1' || addresses[0] === '0000:0000:0000:0000:0000:0000:0000:0001',
        `Expected ::1 but got ${addresses[0]}`
      );
    });

    it('[DN03] must resolve MX records for root domain', async () => {
      const records = await resolver.resolveMx(TEST_DOMAIN);
      assert.strictEqual(records.length, 1);
      assert.strictEqual(records[0].exchange, 'mail.test.pryv.me');
      assert.strictEqual(records[0].priority, 10);
    });

    it('[DN04] must resolve NS records for root domain', async () => {
      const records = await resolver.resolveNs(TEST_DOMAIN);
      assert.strictEqual(records.length, 2);
      assert.deepStrictEqual(records.sort(), ['ns1.test.pryv.me', 'ns2.test.pryv.me']);
    });

    it('[DN05] must resolve TXT records for root domain', async () => {
      const records = await resolver.resolveTxt(TEST_DOMAIN);
      assert.strictEqual(records.length, 1);
      assert.deepStrictEqual(records[0], ['v=spf1 ~all']);
    });
  });

  // --- Root domain (raw UDP for SOA/CAA) ---

  describe('Root domain (raw UDP)', () => {
    it('[DN06] must return SOA record for root domain', async () => {
      const res = await rawQuery(port, TEST_DOMAIN, 'SOA');
      const records = res.answers.filter(a => a.type === Packet.TYPE.SOA);
      assert.strictEqual(records.length, 1);
      assert.strictEqual(records[0].primary, 'ns1.test.pryv.me');
      assert.strictEqual(records[0].admin, 'admin.test.pryv.me');
      assert.strictEqual(records[0].serial, 2026032001);
    });

    it('[DN07] must resolve CAA record for root domain', async () => {
      // dns2 can encode CAA but not decode — use Node's resolver which handles CAA
      const records = await resolver.resolveCaa(TEST_DOMAIN);
      assert.strictEqual(records.length, 1);
      assert.strictEqual(records[0].critical, 0);
      assert.strictEqual(records[0].issue, 'letsencrypt.org');
    });
  });

  // --- Static subdomains ---

  describe('Static subdomains', () => {
    it('[DN10] must resolve CNAME for www subdomain', async () => {
      const records = await resolver.resolveCname(`www.${TEST_DOMAIN}`);
      assert.strictEqual(records.length, 1);
      assert.strictEqual(records[0], 'web.example.com');
    });

    it('[DN11] must resolve CNAME for reg subdomain', async () => {
      const records = await resolver.resolveCname(`reg.${TEST_DOMAIN}`);
      assert.strictEqual(records.length, 1);
      assert.strictEqual(records[0], 'register.example.com');
    });

    it('[DN12] must resolve A record for static A subdomain', async () => {
      const addresses = await resolver.resolve4(`api.${TEST_DOMAIN}`);
      assert.deepStrictEqual(addresses, ['5.6.7.8']);
    });
  });

  // --- Username resolution ---

  describe('Username resolution', () => {
    it('[DN20] must resolve username to core IP (A record)', async () => {
      const addresses = await resolver.resolve4(`alice.${TEST_DOMAIN}`);
      assert.deepStrictEqual(addresses, ['10.0.0.1']);
    });

    it('[DN21] must resolve username to different core IP', async () => {
      const addresses = await resolver.resolve4(`bob.${TEST_DOMAIN}`);
      assert.deepStrictEqual(addresses, ['10.0.0.2']);
    });

    it('[DN22] must resolve username via CNAME when core has no IP', async () => {
      const records = await resolver.resolveCname(`charlie.${TEST_DOMAIN}`);
      assert.strictEqual(records.length, 1);
      assert.strictEqual(records[0], 'core3.external.com');
    });

    it('[DN23] must return NXDOMAIN for unknown username', async () => {
      const res = await rawQuery(port, `unknown-user-xyz.${TEST_DOMAIN}`, 'A');
      assert.strictEqual(res.answers.length, 0);
      assert.strictEqual(res.header.rcode, 3); // NXDOMAIN
    });

    it('[DN24] must resolve username AAAA when core has IPv6', async () => {
      // dns2 may mangle IPv6-mapped IPv4 (::ffff:10.0.0.1 → ::255.255.0.16)
      // so use raw query to verify the server returns an AAAA answer
      const res = await rawQuery(port, `alice.${TEST_DOMAIN}`, 'AAAA');
      const records = res.answers.filter(a => a.type === Packet.TYPE.AAAA);
      assert.strictEqual(records.length, 1);
      // Verify we got an address back (exact format depends on dns2 serialization)
      assert.ok(records[0].address, 'Expected an AAAA address');
    });
  });

  // --- Cluster discovery ---

  describe('Cluster discovery (lsc)', () => {
    it('[DN30] must return all core IPs for lsc.{domain}', async () => {
      const addresses = await resolver.resolve4(`lsc.${TEST_DOMAIN}`);
      assert.strictEqual(addresses.length, 2);
      assert.deepStrictEqual(addresses.sort(), ['10.0.0.1', '10.0.0.2']);
    });
  });

  // --- Dynamic static entry updates ---

  describe('updateStaticEntry', () => {
    it('[DN40] must update static entry for ACME challenge', async () => {
      server.updateStaticEntry('_acme-challenge', { txt: ['acme-validation-token-123'] });

      const records = await resolver.resolveTxt(`_acme-challenge.${TEST_DOMAIN}`);
      assert.strictEqual(records.length, 1);
      assert.deepStrictEqual(records[0], ['acme-validation-token-123']);
    });

    it('[DN41] must overwrite existing static entry', async () => {
      server.updateStaticEntry('www', { a: ['99.99.99.99'] });

      const addresses = await resolver.resolve4(`www.${TEST_DOMAIN}`);
      assert.deepStrictEqual(addresses, ['99.99.99.99']);
    });
  });

  // --- Not our domain ---

  describe('Non-matching domain', () => {
    it('[DN50] must return NXDOMAIN for queries outside our domain', async () => {
      const res = await rawQuery(port, 'example.com', 'A');
      assert.strictEqual(res.answers.length, 0);
      assert.strictEqual(res.header.rcode, 3); // NXDOMAIN
    });
  });
});

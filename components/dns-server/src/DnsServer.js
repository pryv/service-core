/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */

/**
 * Optional DNS server for resolving {username}.{domain} to core IPs.
 * Uses dns2 for wire protocol handling. Runs in-process in master.js.
 */

const dns2 = require('dns2');
const { Packet } = dns2;
const { buildA, buildAAAA, buildCNAME, buildMX, buildNS, buildSOA, buildTXT, buildCAA } = require('./records');

class DnsServer {
  #config;
  #platform;
  #logger;
  #server;
  #domain;
  #ttl;
  #rootRecords;
  #staticEntries;

  /**
   * @param {Object} opts
   * @param {Object} opts.config - @pryv/boiler config
   * @param {Object} opts.platform - Platform instance
   * @param {Object} opts.logger - logger with .info/.warn/.error
   */
  constructor ({ config, platform, logger }) {
    this.#config = config;
    this.#platform = platform;
    this.#logger = logger;
    this.#domain = config.get('dns:domain');
    this.#ttl = config.get('dns:defaultTTL') || 300;
    this.#rootRecords = config.get('dns:records:root') || {};
    // Deep-copy static entries from config so runtime updates don't mutate config
    this.#staticEntries = Object.assign({}, config.get('dns:staticEntries') || {});
  }

  /**
   * Start the DNS server.
   * @param {Object} opts
   * @param {number} opts.port - UDP port
   * @param {string} opts.ip - bind address (e.g. '0.0.0.0')
   * @param {string|null} opts.ip6 - IPv6 bind address (null = disabled)
   */
  async start ({ port, ip, ip6 }) {
    this.#server = dns2.createServer({
      udp: true,
      handle: (request, send, rinfo) => {
        this.#handleRequest(request, send, rinfo);
      }
    });

    this.#server.on('requestError', (err) => {
      this.#logger.warn('DNS request parse error: ' + err.message);
    });

    this.#server.on('error', (err) => {
      this.#logger.error('DNS server error: ' + err.message);
    });

    const listenOpts = {
      udp: { port, address: ip, type: 'udp4' }
    };

    await this.#server.listen(listenOpts);
    this.#logger.info(`DNS server listening on ${ip}:${port} (domain: ${this.#domain})`);

    // If IPv6 is configured, start a second UDP6 server
    if (ip6) {
      this.#server._udp6 = dns2.createUDPServer({ type: 'udp6' });
      this.#server._udp6.on('request', (request, send, rinfo) => {
        this.#handleRequest(request, send, rinfo);
      });
      await this.#server._udp6.listen(port, ip6);
      this.#logger.info(`DNS server listening on [${ip6}]:${port} (IPv6)`);
    }
  }

  /**
   * Get server addresses (for tests using ephemeral ports).
   */
  _getAddresses () {
    return this.#server.addresses();
  }

  /**
   * Stop the DNS server.
   */
  async stop () {
    if (this.#server) {
      if (this.#server._udp6) {
        this.#server._udp6.close();
      }
      await this.#server.close();
      this.#logger.info('DNS server stopped');
    }
  }

  /**
   * Update a static DNS entry at runtime (e.g. from admin API / ACME).
   * @param {string} subdomain - e.g. '_acme-challenge'
   * @param {Object} records - e.g. { txt: ['validation-token'] } or { cname: 'target.example.com' }
   */
  updateStaticEntry (subdomain, records) {
    this.#staticEntries[subdomain] = records;
    this.#logger.info(`DNS static entry updated: ${subdomain}`);
  }

  /**
   * Handle an incoming DNS request.
   */
  async #handleRequest (request, send, rinfo) {
    const response = Packet.createResponseFromRequest(request);
    const question = request.questions[0];
    if (!question) {
      send(response);
      return;
    }

    const qname = question.name.toLowerCase();
    const qtype = question.type;

    try {
      if (!this.#domain || !qname.endsWith(this.#domain.toLowerCase())) {
        // Not our domain — NXDOMAIN
        this.#setNxdomain(response);
        send(response);
        return;
      }

      const prefix = qname.slice(0, -(this.#domain.length + 1)); // strip '.domain'

      if (prefix === '' || qname === this.#domain.toLowerCase()) {
        // Root domain query
        this.#answerRoot(response, qname, qtype);
      } else if (prefix === 'lsc') {
        // Cluster discovery: return all core IPs
        await this.#answerClusterDiscovery(response, qname, qtype);
      } else if (this.#staticEntries[prefix]) {
        // Static subdomain (www, sw, reg, _acme-challenge, etc.)
        this.#answerStatic(response, qname, qtype, this.#staticEntries[prefix]);
      } else {
        // Assume it's a username — look up the user's core
        await this.#answerUsername(response, qname, qtype, prefix);
      }
    } catch (err) {
      this.#logger.warn(`DNS error for ${qname}: ${err.message}`);
      this.#setNxdomain(response);
    }

    send(response);
  }

  /**
   * Answer root domain queries with configured records.
   */
  #answerRoot (response, qname, qtype) {
    const root = this.#rootRecords;
    const ttl = this.#ttl;

    if (qtype === Packet.TYPE.A || qtype === Packet.TYPE.ANY) {
      for (const addr of (root.a || [])) {
        response.answers.push(buildA(qname, addr, ttl));
      }
    }
    if (qtype === Packet.TYPE.AAAA || qtype === Packet.TYPE.ANY) {
      for (const addr of (root.aaaa || [])) {
        response.answers.push(buildAAAA(qname, addr, ttl));
      }
    }
    if (qtype === Packet.TYPE.NS || qtype === Packet.TYPE.ANY) {
      for (const ns of (root.ns || [])) {
        response.answers.push(buildNS(qname, ns, ttl));
      }
    }
    if (qtype === Packet.TYPE.MX || qtype === Packet.TYPE.ANY) {
      for (const mx of (root.mx || [])) {
        response.answers.push(buildMX(qname, mx.exchange, mx.priority || 10, ttl));
      }
    }
    if (qtype === Packet.TYPE.TXT || qtype === Packet.TYPE.ANY) {
      for (const txt of (root.txt || [])) {
        response.answers.push(buildTXT(qname, txt, ttl));
      }
    }
    if (qtype === Packet.TYPE.CAA || qtype === Packet.TYPE.ANY) {
      for (const caa of (root.caa || [])) {
        response.answers.push(buildCAA(qname, caa.flags || 0, caa.tag, caa.value, ttl));
      }
    }
    if (qtype === Packet.TYPE.SOA || qtype === Packet.TYPE.ANY) {
      if (root.soa) {
        response.answers.push(buildSOA(qname, root.soa, ttl));
      }
    }
  }

  /**
   * Answer lsc.{domain} — return all core IPs for rqlite cluster discovery.
   */
  async #answerClusterDiscovery (response, qname, qtype) {
    const cores = await this.#platform.getAllCoreInfos();
    const ttl = this.#ttl;

    for (const core of cores) {
      if ((qtype === Packet.TYPE.A || qtype === Packet.TYPE.ANY) && core.ip) {
        response.answers.push(buildA(qname, core.ip, ttl));
      }
      if ((qtype === Packet.TYPE.AAAA || qtype === Packet.TYPE.ANY) && core.ipv6) {
        response.answers.push(buildAAAA(qname, core.ipv6, ttl));
      }
    }
  }

  /**
   * Answer a static subdomain entry.
   */
  #answerStatic (response, qname, qtype, entry) {
    const ttl = this.#ttl;

    if (entry.cname && (qtype === Packet.TYPE.CNAME || qtype === Packet.TYPE.A || qtype === Packet.TYPE.ANY)) {
      response.answers.push(buildCNAME(qname, entry.cname, ttl));
    }
    if (entry.a) {
      for (const addr of (Array.isArray(entry.a) ? entry.a : [entry.a])) {
        if (qtype === Packet.TYPE.A || qtype === Packet.TYPE.ANY) {
          response.answers.push(buildA(qname, addr, ttl));
        }
      }
    }
    if (entry.aaaa) {
      for (const addr of (Array.isArray(entry.aaaa) ? entry.aaaa : [entry.aaaa])) {
        if (qtype === Packet.TYPE.AAAA || qtype === Packet.TYPE.ANY) {
          response.answers.push(buildAAAA(qname, addr, ttl));
        }
      }
    }
    if (entry.txt) {
      for (const txt of (Array.isArray(entry.txt) ? entry.txt : [entry.txt])) {
        if (qtype === Packet.TYPE.TXT || qtype === Packet.TYPE.ANY) {
          response.answers.push(buildTXT(qname, txt, ttl));
        }
      }
    }
  }

  /**
   * Answer {username}.{domain} — look up user's core, return its IP or CNAME.
   */
  async #answerUsername (response, qname, qtype, username) {
    const coreId = await this.#platform.getUserCore(username);
    if (coreId == null) {
      this.#setNxdomain(response);
      return;
    }

    const coreInfo = await this.#platform.getCoreInfo(coreId);
    if (coreInfo == null) {
      this.#setNxdomain(response);
      return;
    }

    const ttl = this.#ttl;

    if (coreInfo.ip && (qtype === Packet.TYPE.A || qtype === Packet.TYPE.ANY)) {
      response.answers.push(buildA(qname, coreInfo.ip, ttl));
    }
    if (coreInfo.ipv6 && (qtype === Packet.TYPE.AAAA || qtype === Packet.TYPE.ANY)) {
      response.answers.push(buildAAAA(qname, coreInfo.ipv6, ttl));
    }
    if (coreInfo.cname && !coreInfo.ip && !coreInfo.ipv6 &&
        (qtype === Packet.TYPE.CNAME || qtype === Packet.TYPE.A || qtype === Packet.TYPE.ANY)) {
      response.answers.push(buildCNAME(qname, coreInfo.cname, ttl));
    }
  }

  /**
   * Set NXDOMAIN (rcode 3) on response.
   */
  #setNxdomain (response) {
    response.header.rcode = 3; // NXDOMAIN
  }
}

/**
 * Factory function.
 */
function createDnsServer ({ config, platform, logger }) {
  return new DnsServer({ config, platform, logger });
}

module.exports = { DnsServer, createDnsServer };

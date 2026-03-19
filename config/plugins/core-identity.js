/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */

/**
 * Core identity config plugin.
 *
 * Derives:
 * - core:url — this core's public URL
 * - core:isSingleCore — true when dns:domain is null (dnsLess mode)
 *
 * Single-core (dnsLess): URL from dnsLess:publicUrl
 * Multi-core: URL from https://{core.id}.{dns.domain}/
 */
async function load (config) {
  const coreId = config.get('core:id') || 'single';
  const dnsDomain = config.get('dns:domain');
  const isDnsLess = config.get('dnsLess:isActive');

  let coreUrl;

  if (dnsDomain != null && !isDnsLess) {
    // Multi-core: derive URL from core id + domain
    coreUrl = 'https://' + coreId + '.' + dnsDomain;
    config.set('core:isSingleCore', false);
  } else {
    // Single-core (dnsLess): use publicUrl
    const publicUrl = config.get('dnsLess:publicUrl');
    coreUrl = publicUrl || null;
    config.set('core:isSingleCore', true);
  }

  config.set('core:url', coreUrl);
}

module.exports = { load };

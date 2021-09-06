/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const config = require('@pryv/boiler').getConfigUnsafe(true);
const logger = require('@pryv/boiler').getLogger('integrity');
const stableRepresentation = require('@pryv/stable-object-representation');

// mapping algo codes to https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Digest supported codes
const subRessourceCodeToDigestMap = {
  sha256: 'SHA-256',
  sha512: 'SHA-512',
  sha1: 'SHA',
  md5: 'MD5'
}

function getDigestForSubRessourceIntegrity(subRessourceIntegrity) {
  const splitAt = subRessourceIntegrity.indexOf('-');
  const algo = subRessourceIntegrity.substr(0, splitAt);
  const sum = subRessourceIntegrity.substr(splitAt + 1);
  const digestAlgo = subRessourceCodeToDigestMap[algo];
  if (digestAlgo == null) return null;
  return digestAlgo + '=' + sum;
}

const configIntegrity = config.get('integrity');
const isActive = configIntegrity.isActive || false;
const integrity = {
  isActive: isActive,
  isActiveFor: {
    events: isActive ? configIntegrity?.events?.isActive : false,
    attachments: isActive ? configIntegrity?.attachments?.isActive : false,
  },
  algorithm: config.get('integrity:algorithm'),
  getDigestForSubRessourceIntegrity
}

// event integrity schema
integrity.forEvent = function forEvent(event) {
  return stableRepresentation.event.compute(event, integrity.algorithm);
}

integrity.setOnEvent = function setOnEvent(event) {
  event.integrity = integrity.forEvent(event).integrity;
  return event;
}


if (integrity.isActive && (subRessourceCodeToDigestMap[integrity.algorithm] == null)) {
  const message = 'Integrity is active and algorithm [' + integrity.algorithm + '] is unsupported. Choose one of: ' + Object.keys(subRessourceCodeToDigestMap).join(', ');
  logger.error(message);
  console.log('Error: ' + message);
  process.exit(1);
}


//


module.exports = integrity;
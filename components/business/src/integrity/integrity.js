/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const config = require('@pryv/boiler').getConfigUnsafe(true);

// mapping algo codes to https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Digest supported codes
const subRessourceCodeToDigestMap = {
  sha256: 'SHA-256',
  sha512: 'SHA-512',
  sha1: 'SHA',
  sha: 'SHA',
  md5: 'MD5'
}

function getDigestForSubRessourceIntegrity(subRessourceIntegrity) {
  const splitAt = subRessourceIntegrity.indexOf('-');
  const algo = subRessourceIntegrity.substr(0, splitAt);
  const sum = subRessourceIntegrity.substr(splitAt + 1);
  const digestAlgo = subRessourceCodeToDigestMap[algo];
  if (digestAlgo = null) return null;
  return digestAlgo + '=' + sum;
}

const integrity = {
  isActive: config.get('integrity:isActive') || false,
  algorithm: config.get('integrity:algorithm'),
  getDigestForSubRessourceIntegrity
}



module.exports = integrity;
/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const config = require('@pryv/boiler').getConfigUnsafe(true);
const logger = require('@pryv/boiler').getLogger('integrity');
const stableRepresentation = require('@pryv/stable-object-representation');

// --------------- CONFIGURATION -------------- //
const configIntegrity = config.get('integrity');
const eventsIsActive = configIntegrity?.isActive?.events || false;
const attachmentsIsActive = configIntegrity?.isActive?.attachments || false;
const algorithm = config.get('integrity:algorithm');

// --------------- ATTACHMENTS ---------------- //

/**
 * @private
 * mapping algo codes to https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Digest supported codes
 */
const subRessourceCodeToDigestMap = {
  sha256: 'SHA-256',
  sha512: 'SHA-512',
  sha1: 'SHA',
  md5: 'MD5'
}

/**
 * @param {string} subRessourceIntegrity in the form of `<algo>-<hash>` example `sha256-uZKmWZ+CQ7UY3GUqFWD4sNPPEUKm8OPcAWr4780Acnk=`
 * @returns {string} An HTTP Digest header value in the form of `<algo>=<hash>` example `SHA-256=uZKmWZ+CQ7UY3GUqFWD4sNPPEUKm8OPcAWr4780Acnk=`
 */
function getHTTPDigestHeaderForAttachment(subRessourceIntegrity) {
  const splitAt = subRessourceIntegrity.indexOf('-');
  const algo = subRessourceIntegrity.substr(0, splitAt);
  const sum = subRessourceIntegrity.substr(splitAt + 1);
  const digestAlgo = subRessourceCodeToDigestMap[algo];
  if (digestAlgo == null) return null;
  return digestAlgo + '=' + sum;
}

/**
 * Integrity access and computation for attachments
 * @typedef {Object} IntegrityAttachments
 * @property {boolean} isActive - Setting: Add integrity hash to attachment if true
 * @property {IntegrityMulterDiskStorage} MulterIntegrityDiskStorage 
 */
const attachments = {
  isActive: attachmentsIsActive,
  getHTTPDigestHeaderForAttachment,
  MulterIntegrityDiskStorage: require('./MulterIntegrityDiskStorage')
}


// ----------------- standard db Items -------------- //

/**
 * @callback IntegrityComputeResult
 * @property {string} integrity - and integrity code for an item. Exemple 'EVENT:0:sha256-uZKmWZ+CQ7UY3GUqFWD4sNPPEUKm8OPcAWr4780Acnk='
 * @property {string} key - and unique key for this object. Exemple 'EVENT:0:<id>:<modified>'
 */

/**
 * Returns integrity and key of an object
 * @callback IntegrityCompute
 * @param {*} item - Object to compute on
 * @param {boolean} save - This computation should be saved for audit 
 * @returns {IntegrityComputeResult}
 */

/**
 * Compute and set integrity property to an item
 * @callback IntegritySet
 * @param {*} item - Object to compute on
 * @param {boolean} save - This computation should be saved for audit 
 * @returns {*} - the item
 */

/**
 * Get the hash (only .integrity) of an item item
 * @callback IntegrityHash
 * @param {*} item - Object to compute on
 * @param {boolean} save - This computation should be saved for audit 
 * @returns {*} - the item
 */

/**
 * Setting and computation tools for a Pryv.io db item
 * @typedef {Object} IntegrityItem 
 * @property {boolean} isActive - Setting: Add integrity hash to item if true
 * @property {IntegrityCompute} compute 
 * @property {IntegritySet} set
 * @property {IntegrityHash} hash
 */

// ------------- events ------------------ //

function compute(event) {
  return stableRepresentation.event.compute(event, algorithm);
}

function key(event) {
  return stableRepresentation.event.key(event);
}

function hash(event) {
  return stableRepresentation.event.hash(event, algorithm);
}

function setOnEvent(event) {
  event.integrity = hash(event);
  return event;
}

/** 
 * @type {IntegrityItem} 
 */
const events = {
  isActive: eventsIsActive,
  compute,
  key,
  hash,
  set: setOnEvent
}

// ------- Exports ---------- //

/**
 * Integrity tools
 * @property {IntegrityItem} events - computation and settings for events integrity
 * @property {IntegrityAttachments} attachments - computation and settings for events integrity
 * @property {string} algorythm - Setting : algorithm keyCode to use for hash computation
 */
const integrity = {
  events,
  attachments,
  algorithm,
}


// config check
// output message and crash is algorythm is not supported

if ((events.isActive || attachments.isActive) && (subRessourceCodeToDigestMap[algorithm] == null)) {
  const message = 'Integrity is active and algorithm [' + algorithm + '] is unsupported. Choose one of: ' + Object.keys(subRessourceCodeToDigestMap).join(', ');
  logger.error(message);
  console.log('Error: ' + message);
  process.exit(1);
}

module.exports = integrity;
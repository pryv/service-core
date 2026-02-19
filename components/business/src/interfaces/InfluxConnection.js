/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */

/**
 * InfluxConnection interface — contract for the InfluxDB connection layer.
 * This is the swappable boundary for time-series storage backends.
 *
 * Use {@link validateInfluxConnection} to verify class-based instances.
 */

const REQUIRED_METHODS = [
  'createDatabase',
  'dropDatabase',
  'dropMeasurement',
  'writeMeasurement',
  'writePoints',
  'query',
  'getDatabases',
  // Migration methods
  'exportDatabase',
  'importDatabase'
];

/**
 * Validate that a class instance implements all required InfluxConnection methods.
 * @param {Object} instance
 * @returns {Object} The instance itself
 */
module.exports.validateInfluxConnection = function validateInfluxConnection (instance) {
  for (const method of REQUIRED_METHODS) {
    if (typeof instance[method] !== 'function') {
      throw new Error(`InfluxConnection implementation missing method: ${method}`);
    }
  }
  return instance;
};

module.exports.REQUIRED_METHODS = REQUIRED_METHODS;

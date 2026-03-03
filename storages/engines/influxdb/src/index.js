/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */

/**
 * InfluxDB storage engine plugin.
 *
 * Provides the series connection backed by InfluxDB.
 */

// -- SeriesStorage ----------------------------------------------------------

/**
 * @param {Object} config - { host, port } from influxdb config section
 * @returns {Object} InfluxConnection instance
 */
function createSeriesConnection (config) {
  const InfluxConnection = require('./influx_connection');
  return new InfluxConnection({ host: config.host, port: config.port });
}

module.exports = {
  createSeriesConnection
};

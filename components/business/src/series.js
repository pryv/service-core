/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */
const batchRequest = require('./series/batch_request');
module.exports = {
  InfluxConnection: require('storages/engines/influxdb/src/influx_connection'),
  PGSeriesConnection: require('storages/engines/postgresql/src/pg_connection'),
  Repository: require('./series/repository'),
  BatchRequest: batchRequest.BatchRequest,
  DataMatrix: require('./series/data_matrix'),
  ParseFailure: require('./series/errors').ParseFailure
};

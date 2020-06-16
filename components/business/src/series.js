// @flow

const batchRequest = require('./series/batch_request');

module.exports = {
  InfluxConnection: require('./series/influx_connection'),

  Repository: require('./series/repository'),

  BatchRequest: batchRequest.BatchRequest,
  DataMatrix: require('./series/data_matrix'),
  ParseFailure: require('./series/errors').ParseFailure,
};

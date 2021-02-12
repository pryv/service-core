/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

const batchRequest = require('./series/batch_request');

module.exports = {
  InfluxConnection: require('./series/influx_connection'),
  
  Repository: require('./series/repository'), 

  BatchRequest: batchRequest.BatchRequest,
  DataMatrix: require('./series/data_matrix'),
  ParseFailure: require('./series/errors').ParseFailure,
};

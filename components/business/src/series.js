// @flow

module.exports = {
  Repository: require('./series/repository'), 
  DataMatrix: require('./series/data_matrix'),
  InfluxConnection: require('./series/influx_connection'),
  ParseFailure: require('./series/errors').ParseFailure,
};

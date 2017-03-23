// @flow

const DataMatrix = require('./data_matrix');

/** Represents a single data series in influxDB. 
 * 
 * This is the high level internal interface to series. Series can be
 * manipulated through this interface. 
 */
class Series {

  append(data: DataMatrix): Promise<*> {
    // TODO
    throw new Error('Implement me!');
  }
}

module.exports = Series;
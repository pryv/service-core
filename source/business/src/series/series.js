// @flow

const DataMatrix = require('./data_matrix');

/** Represents a single data series in influxDB. 
 * 
 * This is the high level internal interface to series. Series can be
 * manipulated through this interface. 
 */
class Series {
  
  /** Append data to this series. 
   * 
   * This will append the data given in `data` to this series. You should 
   * make sure that the data matches the event this series is linked to before
   * calling this method. 
   * 
   * @param data {DataMatrix} - data to store to the series
   * @return {Promise<*>} - promise that resolves once the data is stored
   */
  append(data: DataMatrix): Promise<*> {
    // TODO
    throw new Error('Implement me!');
  }
}

module.exports = Series;
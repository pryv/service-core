
const Series = require('./series');

/** Repository of all series in this Pryv instance. 
 */
class Repository {
  
  /** Return a series from a given namespace. 
   * 
   * In practice, we'll map namespaces to pryv users and series to events. 
   * 
   * @param namespace {string} - namespace to look for series
   * @param name {string} - name of the series
   * @return {Series} - series instance that can be used to manipulate the data
   */
  get(namespace: string, name: string): Series {
    // TODO
    return new Series(); 
  }
}

module.exports = Repository; 

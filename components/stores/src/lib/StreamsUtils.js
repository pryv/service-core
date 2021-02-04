const { DataSource } = require('../../interfaces/DataSource');

/**
 * Create a Stream object from a DataSource 
 * @param {DataSource} source 
 * @param {Object} extraProperties 
 */
function sourceToStream(source, extraProperties) {
  return Object.assign({
    id: source.id,
    name: source.name,
    created: DataSource.UNKOWN_DATE,
    modified: DataSource.UNKOWN_DATE,
    createdBy: DataSource.BY_SYSTEM,
    modifiedBy: DataSource.BY_SYSTEM,
  }, extraProperties);
}


module.exports = {
  sourceToStream: sourceToStream
}
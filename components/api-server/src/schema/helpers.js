/**
 * Helpers for defining schemas.
 */

var _ = require('lodash');

/**
 * Gets the full core type URI for the given type name and action (read, create, etc.)
 *
 * @param {String} name
 * @param {String} action
 */
exports.getTypeURI = function (name, action) {
  return 'pryv.core.' + name + (action ? '-' + action : '');
};

/**
 * Returns an 'object' schema definition with the given properties definition.
 *
 * @param {Object} propertiesDef
 * @param {Object} options Extra properties to merge into the returned object definition
 */
exports.object = function (propertiesDef, options) {
  return _.extend(getBaseSchema('object', options), {properties: propertiesDef});
};

/**
 * Returns an 'array' schema definition with the given items definition.
 *
 * @param {Object} itemsDef
 * @param {Object} options Extra properties to merge into the returned array definition
 */
exports.array = function (itemsDef, options) {
  return _.extend(getBaseSchema('array', options), {items: itemsDef});
};

/**
 * Returns a 'string' schema definition.
 *
 * @param {Object} options Extra properties to merge into the returned object definition
 */
exports.string = getBaseSchema.bind(null, 'string');

exports.null = getBaseSchema.bind(null, 'null');

exports.email = getBaseSchema('string', {pattern: '^[^@]+@[a-zA-Z0-9._-]+\\.[a-zA-Z]+$'});

exports.language = getBaseSchema('string', { maxLength: 5, minLength: 1 });

/**
 * Returns a 'number' schema definition.
 *
 * @param {Object} options Extra properties to merge into the returned object definition
 */
exports.number = getBaseSchema.bind(null, 'number');

/**
 * Returns a 'boolean' schema definition.
 *
 * @param {Object} options Extra properties to merge into the returned object definition
 */
exports.boolean = getBaseSchema.bind(null, 'boolean');

exports.getBaseSchema = getBaseSchema;

function getBaseSchema(type, options) {
  const result = {
    type: [type]
  };

  if (options != null) {
    if(options.nullable === true) {
      result.type.push('null');
    }
    // We omit 'nullable' since we handled this particular option just above
    const opt = _.omit(options, 'nullable');
    _.extend(result, opt);
  }
  return result;
}

/**
 * Adds `created`, `createdBy`, `modified`, `modifiedBy` property definitions to the given schema.
 *
 * @param {Object} schema
 */
exports.addTrackingProperties = function (schema) {
  schema.properties.created = {type: 'number'};
  schema.properties.createdBy = {type: 'string'};
  schema.properties.modified = {type: 'number'};
  schema.properties.modifiedBy = {type: 'string'};
};

var Validator = require('z-schema'),
    validator = new Validator();

/**
 * Validates the object against the JSON-schema definition.
 *
 * @param object
 * @param schema
 * @param callback
 */
exports.validate = validator.validate.bind(validator);

/**
 * Validates the given JSON-schema definition.
 *
 * @param schema
 * @param callback
 */
exports.validateSchema = validator.validateSchema.bind(validator);

/**
 * Tries to type-coerce properties of the given object according to the given settings.
 *
 * @param object
 * @param settings Map of property keys to coerce and their target types
 */
exports.tryCoerceStringValues = function (object, settings) {
  Object.keys(settings).forEach(function (key) {
    if (! object[key] || typeof object[key] !== 'string') { return; }

    switch (settings[key]) {
    case 'boolean':
      if (object[key].toLowerCase() === 'true') {
        object[key] = true;
      } else if (object[key].toLowerCase() === 'false') {
        object[key] = false;
      }
      break;
    case 'number':
      try {
        const temp = +object[key];
        object[key] = isNaN(temp) ? object[key] : temp;
      } catch (e) { /* cannot coerce */ }
      break;
    case 'integer':
      try {
        object[key] = parseInt(object[key], 10);
      } catch (e) { /* cannot coerce */ }
      break;
    case 'array':
      object[key] = [object[key]];
      break;
    }
  });
};

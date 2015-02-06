/**
 * JSON Schema specification for event streams.
 */

var Action = require('./Action'),
    helpers = require('./helpers');

/**
 * @param {Action} action
 * @param {Boolean} ignoreChildren Whether to ignore `children` property
 * @param {String} refToStreamSchema
 */
module.exports = function (action, ignoreChildren, refToStreamSchema) {
  var schema = {
    id: helpers.getTypeURI('stream', action),
    type: 'object',
    additionalProperties: false,
    properties: {
      'id': {
        type: 'string',
        minLength: 1
      },
      'name': {
        type: 'string',
        minLength: 1
      },
      'parentId': {
        type: ['string', 'null']
      },
      'singleActivity': {
        type: 'boolean'
      },
      'clientData': {
        type: 'object'
      },
      'trashed': {
        type: 'boolean'
      },
      // ignored except on READ, accepted to simplify interaction with client frameworks
      'children': {
        type: 'array',
        items: {
          '$ref': refToStreamSchema || '#'
        }
      }
    }
  };

  helpers.addTrackingProperties(schema, action);

  switch (action) {
  case Action.READ:
    schema.required = [ 'id', 'name', 'parentId',
      'created', 'createdBy', 'modified', 'modifiedBy' ];
    if (! ignoreChildren) { schema.required.push('children'); }
    break;
  case Action.STORE:
    schema.required = [ 'id', 'name', 'parentId',
      'created', 'createdBy', 'modified', 'modifiedBy' ];
    break;
  case Action.CREATE:
    schema.required = [ 'name' ];
    break;
  }

  return schema;
};

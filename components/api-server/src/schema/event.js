/**
 * JSON Schema specification for events.
 */

var Action = require('./Action'),
    helpers = require('./helpers'),
    object = helpers.object,
    array = helpers.array,
    string = helpers.string,
    number = helpers.number,
    boolean = helpers.boolean;

/**
 * @param {Action} action
 */
exports = module.exports = function (action) {
  if (action === Action.STORE) { action = Action.READ; } // read items === stored items

  var schema = object({
    'id': string(),
    'time': number(),
    'duration': {
      type: ['number', 'null']
    },
    'streamId': string(),
    'tags': array(string()),
    'type': string({
      pattern: '^[a-z0-9-]+/[a-z0-9-]+$'
    }),
    'content': {},
    'description': string(),
    'clientData': object({}),
    'trashed': boolean()
  }, {
    id: helpers.getTypeURI('event', action),
    additionalProperties: false
  });

  helpers.addTrackingProperties(schema, action);

  if (action !== Action.CREATE) {
    schema.properties.id = string();
    schema.properties.headId = string();
  }

  if (action === Action.CREATE) {
    // only allow cuid-like strings for custom ids
    schema.properties.id.pattern = '^c[a-z0-9-]{24}$';
    // only allow "files" (raw file data, internal stuff) on create;
    // no further checks as it's created internally
    schema.properties.files = object({});
  }

  // forbid attachments except on read and update (ignored for the latter)
  if (action === Action.READ) {
    schema.properties.attachments = exports.attachments;
  } else if (action === Action.UPDATE) {
    schema.properties.attachments = { type: 'array' };
  }

  switch (action) {
  case Action.READ:
    schema.required = [ 'id', 'streamId', 'time', 'type',
      'created', 'createdBy', 'modified', 'modifiedBy' ];
    break;
  case Action.CREATE:
    schema.required = [ 'streamId', 'type' ];
    break;
  }

  return schema;
};

exports.attachments = array(object({
  id: string(),
  fileName: string(),
  type: string(),
  size: number(),
  readToken: string()
}, {
  required: [ 'id', 'fileName', 'type', 'size', 'readToken' ],
  additionalProperties: false
}));

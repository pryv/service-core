/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */
/**
 * JSON Schema specification for events.
 */

const Action = require('./Action');
const helpers = require('./helpers');
const object = helpers.object;
const array = helpers.array;
const string = helpers.string;
const number = helpers.number;
const boolean = helpers.boolean;

/**
 * @param {Action} action
 */
exports = module.exports = function (action) {
  // read items === stored items
  if (action === Action.STORE) {
    action = Action.READ;
  }

  const schema = object({
    id: string(),
    time: number(),
    duration: number({ nullable: true }),
    streamId: string(),
    streamIds: array(string(), { nullable: false, minItems: 1 }),
    tags: array(string(), { nullable: true }),
    type: string({ pattern: '^(series:)?[a-z0-9-]+/[a-z0-9-]+$' }),
    content: {},
    description: string({ nullable: true }),
    clientData: object({}, { nullable: true }),
    trashed: boolean({ nullable: true }),
    integrity: string({ nullable: true })
  }, {
    id: helpers.getTypeURI('event', action),
    additionalProperties: false
  });

  helpers.addTrackingProperties(schema, action);

  if (action !== Action.CREATE) {
    schema.properties.id = string();
  }

  if (action === Action.CREATE) {
    // only allow cuid-like strings for custom ids
    schema.properties.id.pattern = '(?=^\\:[a-z0-9-]+\\:)(^\\:[a-z0-9-]+\\:[a-z0-9A-Z-]{1,256})|(^c[a-z0-9-]{24}$)';
    // only allow "files" (raw file data) on create; no further checks as it's
    // created internally
    schema.properties.files = array(object({}));
  }

  // forbid attachments except on read and update (ignored for the latter)
  if (action === Action.READ) {
    schema.properties.attachments = exports.attachments;
  } else if (action === Action.UPDATE) {
    schema.properties.attachments = { type: 'array' };
    // whitelist for properties that can be updated
    schema.alterableProperties = ['streamId', 'streamIds', 'time', 'duration', 'type',
      'content', 'tags', 'references', 'description', 'clientData', 'trashed'];
  }

  switch (action) {
    case Action.READ:
      schema.required = ['id', 'streamId', 'streamIds', 'time', 'type',
        'created', 'createdBy', 'modified', 'modifiedBy'];
      break;
    case Action.CREATE:
      schema.required = ['type'];
      schema.anyOf = [{ required: ['streamId'] }, { required: ['streamIds'] }];
      break;
  }

  return schema;
};

exports.attachments = array(object({
  id: string(),
  fileName: string(),
  type: string(),
  size: number(),
  readToken: string(),
  integrity: string()
}, {
  required: ['id', 'fileName', 'type', 'size', 'readToken'],
  additionalProperties: false
}));

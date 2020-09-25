/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
/**
 * JSON Schema specification for users.
 */

var Action = require('./Action'),
    helpers = require('./helpers');

/**
 * @param {Action} action
 */
module.exports = function (action) {
  var schema = {
    id: helpers.getTypeURI('user', action),
    type: 'object',
    additionalProperties: false,
    properties: {
      username: helpers.username,
      email: helpers.email,
      language: helpers.language,
      appId: helpers.string(),
      referer: helpers.string({ nullable: true }), 
      invitationToken: helpers.string({ nullable: true }), 
      storageUsed: helpers.object({
        dbDocuments: helpers.number(),
        attachedFiles: helpers.number()
      }, {required: [ 'dbDocuments', 'attachedFiles' ]})
    }
  };

  // explicitly forbid 'id' on create
  if (action !== Action.CREATE) {
    schema.properties.id = helpers.string();
  }

  // only accept password hash on create (request from registration-server) (and store of course)
  if (action === Action.CREATE || action === Action.STORE) {
    schema.properties.passwordHash = helpers.string();
  }

  switch (action) {
  case Action.READ:
    schema.required = [ 'id', 'username', 'email', 'language' ];
    break;
    case Action.STORE:
    schema.required = ['id', 'username', 'email', 'language', 'storageUsed' ];
    break;
  case Action.CREATE:
    schema.required = [ 'username', 'passwordHash', 'email', 'language' ];
    break;
  }

  return schema;
};

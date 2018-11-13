/**
 * JSON Schema specification of methods data for accesses.
 */

var Action = require('./Action'),
    access = require('./access'),
    error = require('./methodError'),
    helpers = require('./helpers'),
    itemDeletion = require('./itemDeletion'),
    object = helpers.object,
    string = helpers.string;

module.exports = {
  get: {
    params: object({}, {
      id: 'accesses.get'
    }),
    result: object({
      'accesses': {
        type: 'array',
        items: access(Action.READ)
      }
    }, {
      required: [ 'accesses' ]
    })
  },

  create: {
    params: access(Action.CREATE),
    result: object({
      'access': access(Action.READ)
    }, {
      required: [ 'access' ]
    })
  },

  update: {
    params: object({
      // in path for HTTP requests
      'id': string(),
      // = body of HTTP requests
      'update': access(Action.UPDATE)
    }, {
      id: 'accesses.update',
      required: [ 'id', 'update' ]
    }),
    result: object({
      'access': access(Action.READ)
    }, {
      required: [ 'access' ]
    })
  },

  del: {
    params: object({
      // in path for HTTP requests
      'id': string()
    }, {
      id: 'accesses.delete',
      required: [ 'id' ]
    }),
    result: object({accessDeletion: itemDeletion}, {
      required: ['accessDeletion'],
      additionalProperties: false
    })
  },

  getInfo: {
    params: object({}, {
      id: 'accesses.getInfo'
    }),
    result: object({
      'type': string({enum: ['personal', 'app', 'shared']}),
      'name': string(),
      'permissions': access.permissions(Action.READ)
    }, {
      required: [ 'type', 'name', 'permissions' ],
      additionalProperties: false
    })
  },

  checkApp: {
    params: object({
      'requestingAppId': string(),
      'deviceName': string(),
      'requestedPermissions': access.permissions(Action.CREATE),
      'clientData': object({}),
    }, {
      id: 'accesses.checkApp',
      required: [ 'requestingAppId', 'requestedPermissions' ],
      additionalProperties: false
    }),
    result: object({
      'matchingAccess': access(Action.READ),
      'mismatchingAccess': access(Action.READ),
      'checkedPermissions': access.permissions(Action.CREATE),
      'error': error
    }, {
      additionalProperties: false
    })
  }
};

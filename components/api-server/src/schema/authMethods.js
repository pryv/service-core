/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
/**
 * JSON Schema specification of methods data for auth.
 */
const ErrorIds = require('components/errors/src/ErrorIds');
const ErrorMessages = require('components/errors/src/ErrorMessages');

var helpers = require('./helpers'),
  object = helpers.object,
  string = helpers.string;

module.exports = {
  login: {
    params: object({
      'username': string(),
      'password': string(),
      'appId': string(),
      'origin': string()
    }, {
      required: ['username', 'password', 'appId'],
      additionalProperties: false
    }),
    result: object({
      'token': string()
    }, {
      required: ['token'],
      additionalProperties: false
    })
  },

  logout: {
    params: object({})
  },

  register: {
    params: object({
      'username': helpers.username,
      'password': helpers.string({
        minLength: 6,
        maxLength: 100
      }),
      'email': helpers.email,
      'appId': helpers.string({
        minLength: 6,
        maxLength: 99,
      }),
      'invitationtoken': string(),
      'referer': helpers.string({
        minLength: 1,
        maxLength: 99,
      }),
      'languageCode': helpers.language,
    }, {
      required: ['appId', 'username', 'email', 'password'],
      messages: {
        'appId': {
          'MIN_LENGTH': {
            'message': ErrorMessages[ErrorIds.InvalidAppId],
            'code': ErrorIds.InvalidAppId
          },
          'MAX_LENGTH': {
            'message': ErrorMessages[ErrorIds.InvalidAppId],
            'code': ErrorIds.InvalidAppId
          },
          'INVALID_TYPE': {
            'message': ErrorMessages[ErrorIds.InvalidAppId],
            'code': ErrorIds.InvalidAppId
          },
          'OBJECT_MISSING_REQUIRED_PROPERTY': {
            'message': ErrorMessages[ErrorIds.MissingRequiredField] + ': appId',
            'code': ErrorIds.InvalidAppId
          }
        },
        'username': {
          'PATTERN': {
            'message': ErrorMessages[ErrorIds.InvalidUsername],
            'code': ErrorIds.InvalidUsername
          }
        },
        'password': {
          'MIN_LENGTH': {
            'message': ErrorMessages[ErrorIds.InvalidPassword],
            'code': ErrorIds.InvalidPassword
          },
          'MAX_LENGTH': {
            'message': ErrorMessages[ErrorIds.InvalidPassword],
            'code': ErrorIds.InvalidPassword
          },
          'INVALID_TYPE': {
            'message': ErrorMessages[ErrorIds.InvalidPassword],
            'code': ErrorIds.InvalidPassword
          }
        },
        'email': {
          'INVALID_TYPE': {
            'message': ErrorMessages[ErrorIds.InvalidEmail],
            'code': ErrorIds.InvalidEmail
          }
        },
        'invitationtoken': {
          'INVALID_TYPE': {
            'message': ErrorMessages[ErrorIds.InvalidInvitationToken],
            'code': ErrorIds.InvalidInvitationToken
          }
        },
        'referer': {
          'MIN_LENGTH': {
            'message': ErrorMessages[ErrorIds.Invalidreferer],
            'code': ErrorIds.Invalidreferer
          },
          'MAX_LENGTH': {
            'message': ErrorMessages[ErrorIds.Invalidreferer],
            'code': ErrorIds.Invalidreferer
          },
          'INVALID_TYPE': {
            'message': ErrorMessages[ErrorIds.Invalidreferer],
            'code': ErrorIds.Invalidreferer
          }
        },
        'languageCode': {
          'MAX_LENGTH': {
            'message': ErrorMessages[ErrorIds.InvalidLanguage],
            'code': ErrorIds.InvalidLanguage
          }
        }
      },
      additionalProperties: true
    }),
    result: object({
      'username': string(),
      'server': string()
    }, {
      required: ['username'],
      additionalProperties: true
    })
  },

  usernameCheck: {
    params: object({
      'username': helpers.username,
    }, {
      required: ['username'],
      messages: {
        'username': {
          'PATTERN': {
            'message': ErrorMessages[ErrorIds.InvalidUsername],
            'code': ErrorIds.InvalidUsername
          },
          'OBJECT_MISSING_REQUIRED_PROPERTY': {
            'message': ErrorMessages[ErrorIds.UsernameRequired],
            'code': ErrorIds.UsernameRequired
          }
        }
      },
      additionalProperties: false
    })
  }
};

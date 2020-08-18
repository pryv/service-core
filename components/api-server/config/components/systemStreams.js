/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
'use strict';
const _ = require('lodash');

const defaultValuesForFields = {
  isIndexed: false, // if true will be sent to service-register to be able to query across the platform
  isUnique: false, // if true will be sent to service-register and enforced uniqness on mongodb
  isShown: false, // if true, will be shown for the users
  isEditable: false, // if true, user will be allowed to edit it
  type: 'string/pryv', // event type
  isRequiredInValidation: false // if true, the field will be required in the validation
};

function load(config: Config): Config {
  // default system streams that sould be not changed
  config.overrides({
    systemStreams: {
      account: {
        username: _.extend({}, defaultValuesForFields, {
          isIndexed: true,
          isUnique: true,
          isShown: true,
          type: 'identifier/string',
          name: 'Username',
          isRequiredInValidation: true
        }),
        email: _.extend({}, defaultValuesForFields, {
          isIndexed: true,
          isUnique: true,
          isShown: true,
          isEditable: true,
          type: 'email/string',
          name: 'Email',
          isRequiredInValidation: true
        }),
        language: _.extend({}, defaultValuesForFields, {
          isIndexed: true,
          isShown: true,
          isEditable: true,
          default: 'en',
          type: 'language/iso-639-1',
          name: 'Language'
        }),
        appId: _.extend({}, defaultValuesForFields, {
          isIndexed: true,
          isRequiredInValidation: true,
          isIndexed: true,
          type: 'identifier/string',
          name: 'appId'
        }),
        invitationToken: _.extend({}, defaultValuesForFields, {
          isIndexed: true,
          default: 'no-token',
          type: 'token/string',
          name: 'Invitation Token'
        }),
        passwordHash: _.extend({}, defaultValuesForFields, {
          type: 'password-hash/string',
          name: 'Password Hash'
        }),
        referer: _.extend({}, defaultValuesForFields, {
          isIndexed: true,
          default: null,
          type: 'identifier/string',
          name: 'Referer'
        }),
        storageUsed: {
          dbDocuments: _.extend({}, defaultValuesForFields, {
            isShown: true,
            default: 0,
            displayName: 'dbDocuments',
            type: 'data-quantity/b',
            name: 'Storage used'
          }),
          attachedFiles: _.extend({}, defaultValuesForFields, {
            isShown: true,
            default: 0,
            type: 'data-quantity/b',
            name: 'Attached files'
          })
        }
      }
    }
  });

  const CUSTOM_SYSTEM_STREAMS_FIELDS = 'CUSTOM_SYSTEM_STREAMS_FIELDS';

  /**
   * Or if it is a simple config, just pass json by env variable
   */
  config.env({
    [CUSTOM_SYSTEM_STREAMS_FIELDS]: {
      alias: 'ADDITIONAL_SYSTEM_STREAMS_FIELDS',
      describe:
        'json that contains additional system streams fields information.',
      demand: false,
      parseValues: true,
      lowerCase: true
    }
  });

  readAdditionalFieldsConfig(config);
  return config;

  /**
   * If any, load custom system streams from:
   * 1. env variable
   * 2. systemStreams:custom
   */
  function readAdditionalFieldsConfig(config) {
    const customStreams = config.get('systemStreams:custom');

    if (customStreams != null) {
      appendSystemStreamsConfigWithAdditionalFields(config, customStreams);
    }

    const customStreamsEnv = config.get(CUSTOM_SYSTEM_STREAMS_FIELDS);
    if (customStreamsEnv != null) {
      appendSystemStreamsConfigWithAdditionalFields(config, customStreamsEnv);
    }
  }

  /**
   * Iterate through additional fields, add default values and
   * set to the main system streams config
   * @param {*} additionalFields
   */
  function appendSystemStreamsConfigWithAdditionalFields(
    config: Config,
    additionalFields
  ): Config {
    const keys: Array<string> = Object.keys(additionalFields);
    let i;
    keys.forEach(k => {
      config.set(
        'systemStreams:account:' + k,
        _.extend({}, defaultValuesForFields, additionalFields[k])
      );
    });
    return config;
  }
}
module.exports.load = load;

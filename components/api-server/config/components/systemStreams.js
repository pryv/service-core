/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
'use strict'
const config = require('components/api-server/config/nconf');
const _ = require('lodash');

const defaultValuesForFields = {
  isIndexed: false, // if true will be sent to service-register to be able to query across the platform
  isUnique: false,// if true will be sent to service-register and enforced uniqness on mongodb
  isShown: false, // if true, will be shown for the users
  type: 'string/pryv', // event type
  isRequiredInValidation: false // if true, the field will be required in the validation
}

// default core streams that sould be not changed 
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
        type: 'email/string',
        name: 'Email',
        isRequiredInValidation: true
      }),
      language: _.extend({}, defaultValuesForFields, {
        isIndexed: true,
        isShown: true,
        default: 'en',
        type: 'language/iso-639-1',
        name: 'Language',
      }),
      appId: _.extend({}, defaultValuesForFields, {
        isIndexed: true,
        isRequiredInValidation: true,
        isIndexed: true,
        type: 'identifier/string',
        name: 'appId',
      }),
      invitationToken: _.extend({}, defaultValuesForFields, {
        isIndexed: true,
        default: 'no-token',
        type: 'token/string',
        name: 'Invitation Token',
      }),
      passwordHash: _.extend({}, defaultValuesForFields, {
        type: 'password-hash/string',
        name: 'Password Hash',
      }),
      referer: _.extend({}, defaultValuesForFields, {
        isIndexed: true,
        default: null,
        type: 'identifier/string',
        name: 'Referer',
      }),
      storageUsed: {
        dbDocuments: _.extend({}, defaultValuesForFields, {
          isShown: true,
          default: 0,
          displayName: 'dbDocuments',
          type: 'data-quantity/b',
          name: 'Storage used',
        }),
        attachedFiles: _.extend({}, defaultValuesForFields, {
          isShown: true,
          default: 0,
          type: 'data-quantity/b',
          name: 'Attached files',
        })
      }
    }
  }
});
  
/**
 * You can set pat hto the config yaml or json file in env or args
 */
config.argv({
  "ADDITIONAL_CORE_SREAMS_CONFIG_PATH": {
    alias: 'additionalCoreStramsFields.json',
    describe: 'path to the json file that contains additional core streams fields information.',
    demand: false,
    parseValues: true
  }
});

/**
 * Or if it is a simple config, just pass json by env variable
 */
config.env({
  "ADDITIONAL_CORE_SREAMS_FIELDS": {
    alias: 'ADDITIONAL_CORE_SREAMS_FIELDS',
    describe: 'json that contains additional core streams fields information.',
    demand: false,
    parseValues: true,
    lowerCase: true
  }
});

/**
 * Iterate through additional fields, add default values and 
 * set to the main core streams config
 * @param {*} additionalFields 
 */
function appendCoreStreamsConfigWithAdditionalFields (additionalFields) {
  const keys = Object.keys(additionalFields);
  let i;
  for (i = 0; i < keys.length; i++) {
    config.set('systemStreams:profile:' + keys[i], _.extend({},
      defaultValuesForFields, additionalFields[keys]));
  }
}

/**
 * Read additional fields config
 * Priority list
 * 1) read it from yaml file
 * 2) if there is no yaml, read it from json file
 * 3) if there is no json check env variables
 * 4) if no env variables with json, skip it
 */
function readAdditionalFieldsConfig () {
  // if there is file path, read it
  const content = config.readConfigFile('ADDITIONAL_CORE_SREAMS_CONFIG_PATH');
  if (content) {
    appendCoreStreamsConfigWithAdditionalFields(content);
  }
}
readAdditionalFieldsConfig();
module.exports = config.get('systemStreams');
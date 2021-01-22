/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

'use strict';
const _ = require('lodash');
const fs = require('fs');
const path = require('path');
const treeUtils = require('utils/src/treeUtils');
const validation = require('api-server/src/schema/validation');
const string = require('api-server/src/methods/helpers/string');
const slugify = require('slug');
const systemStreamSchema = require('./systemStreamSchema');

let additionalDefaultAccountStreams;
if (fs.existsSync(path.join(path.dirname(__filename), 'additionalDefaultAccountStreams.json'))) {
  additionalDefaultAccountStreams = require('./additionalDefaultAccountStreams.json');
}

const DEFAULT_VALUES_FOR_FIELDS = {
  isIndexed: false, // if true will be sent to service-register to be able to query across the platform
  isUnique: false, // if true will be sent to service-register and enforced uniqness on mongodb
  isShown: false, // if true, will be shown for the users
  isEditable: false, // if true, user will be allowed to edit it
  isRequiredInValidation: false // if true, the field will be required in the validation
};

function load(config) {
  // default system streams that should be not changed
  let defaultAccountStreams = [
    {
      "isIndexed": true,
      "isUnique": true,
      "isShown": true,
      "type": "identifier/string",
      "name": "Username",
      "id": ".username",
      "isRequiredInValidation": true
    },
    {
      "isIndexed": true,
      "isShown": true,
      "isEditable": true,
      "default": "en",
      "type": "language/iso-639-1",
      "name": "Language",
      "id": ".language"
    },
    {
      "isIndexed": true,
      "default": "",
      "isRequiredInValidation": true,
      "type": "identifier/string",
      "name": "appId",
      "id": ".appId"
    },
    {
      "isIndexed": true,
      "default": "no-token",
      "type": "token/string",
      "name": "Invitation Token",
      "id": ".invitationToken"
    },
    {
      "type": "password-hash/string",
      "name": "Password Hash",
      "id": ".passwordHash"
    },
    {
      "isIndexed": true,
      "default": null,
      "type": "identifier/string",
      "name": "Referer",
      "id": ".referer"
    },
    {
      id: '.storageUsed',
      isShown: true,
      name: 'Storage used',
      type: 'data-quantity/b',      
      children: [
        {
          isShown: true,
          default: 0,
          type: 'data-quantity/b',
          name: 'Db Documents',
          id: '.dbDocuments'
        },
        {
          isShown: true,
          default: 0,
          type: 'data-quantity/b',
          name: 'Attached files',
          id: '.attachedFiles'
        }
      ]
    }
  ];
  
  if (additionalDefaultAccountStreams) {
    defaultAccountStreams = defaultAccountStreams.concat(additionalDefaultAccountStreams);
  }

  defaultAccountStreams = extendSystemStreamsWithDefaultValues(defaultAccountStreams);
  config.set('systemStreams:account', defaultAccountStreams);
  config.set('systemStreams:helpers', [
    _.extend({}, DEFAULT_VALUES_FOR_FIELDS, {
      isIndexed: false,
      isUnique: false,
      isShown: true,
      type: 'identifier/string',
      name: 'Active',
      id: '.active',
    })
  ]);

  const CUSTOM_SYSTEM_STREAMS_FIELDS: string = 'CUSTOM_SYSTEM_STREAMS_FIELDS';

  readAdditionalFieldsConfig(config); 
  return 'System Streams';

  /**
   * If any, load custom system streams from:
   * 1. env variable
   * 2. custom:systemStreams
   */
  function readAdditionalFieldsConfig(config) {
    const customStreams = config.get('custom:systemStreams');
    if (customStreams != null) {
      appendSystemStreamsConfigWithAdditionalFields(config, customStreams);
    }
    const customStreamsEnv = config.get(CUSTOM_SYSTEM_STREAMS_FIELDS);
    if (customStreamsEnv != null) {
      appendSystemStreamsConfigWithAdditionalFields(config, customStreamsEnv);
    }
  }

  /**
   * Extend each stream with default values
   * @param {*} additionalFields 
   */
  function extendSystemStreamsWithDefaultValues (
    additionalFields: object
  ): object{
    for (let i = 0; i < additionalFields.length; i++) {
      additionalFields[i] = _.extend({}, DEFAULT_VALUES_FOR_FIELDS, additionalFields[i]);
      if (!additionalFields[i].name) {
        additionalFields[i].name = additionalFields[i].id;
      }
      // if stream has children recursivelly call the same function
      if (additionalFields[i].children != null) {
        additionalFields[i].children = extendSystemStreamsWithDefaultValues(additionalFields[i].children)
      }
    }
    return additionalFields;
  }

  function denyDefaultStreamsOverride (objValue, srcValue) {
    if (objValue && objValue.id && srcValue && srcValue.id && objValue.id == srcValue.id){
      return objValue;
    }
    return _.merge(srcValue, objValue);
  }

  function validateSystemStreamWithSchema(systemStream) {
    validation.validate(systemStream, systemStreamSchema, function (err) {
      if (err) {
        throw err;
      }
    });
  }

  /**
   * Return config list where each id is with prepended dot
   * @param {*} streamIdWithoutDot 
   */
  function ensureDotForStreamIds (defaultConfig: array): array {
    for (let systemStream of defaultConfig) {
      if (!systemStream.id.startsWith('.')) {
        systemStream.id = '.' + systemStream.id;
      }
      if (typeof systemStream.children == 'object') {
        systemStream.children = ensureDotForStreamIds(systemStream.children);
      }
    }
    return defaultConfig;
  }

  /**
   * Iterate through additional fields, add default values and
   * set to the main system streams config
   * @param {*} additionalFields
   */
  function appendSystemStreamsConfigWithAdditionalFields(
    config,
    additionalFields
  ) {
    let defaultConfig = config.get('systemStreams');

    // extend systemStreams with default values
    const newConfigKeys = Object.keys(additionalFields);
    for (let i = 0; i < newConfigKeys.length; i++) {
      additionalFields[newConfigKeys[i]] = extendSystemStreamsWithDefaultValues(additionalFields[newConfigKeys[i]]);
    }

    // make sure each config id starts with '.' - dot sign
    for (const [configKey, config] of Object.entries(additionalFields)) {
      additionalFields[configKey] = ensureDotForStreamIds(config);
    }
    
    // first merge config with already existing keys (like account, helpers)
    const configKeys = Object.keys(defaultConfig);
    for (let i = 0; i < configKeys.length; i++){
      defaultConfig[configKeys[i]] = _.values(_.mergeWith(
        _.keyBy(defaultConfig[configKeys[i]], 'id'),
        _.keyBy(additionalFields[configKeys[i]], 'id'), denyDefaultStreamsOverride
      ));
    }
    // second append new config
    for (let i = 0; i < newConfigKeys.length; i++) {
      if (configKeys.includes(newConfigKeys[i])) continue;
      defaultConfig[newConfigKeys[i]] = additionalFields[newConfigKeys[i]];
    }

    // validate that each config stream is valid according to schmema, its id is not reserved and that it has a type
    const allConfigKeys = Object.keys(defaultConfig);
    for(let configKey of allConfigKeys) {
      const flatStreamsList = treeUtils.flattenTree(defaultConfig[configKey]);
      // check if each stream has a type
      for (let stream of flatStreamsList) {
        validateSystemStreamWithSchema(stream);
        if (string.isReservedId(stream.id) ||
          string.isReservedId(stream.id = slugify(stream.id))) {
          throw new Error('The specified id "' + stream.id + '" is not allowed.');
        }
        if (!stream.type) {
          throw new Error(`SystemStreams streams must have a type. Please fix the config systemStreams.custom ${stream.id} so that all custom streams would include type. It will be used while creating the events.`);
        }
      }
    }

    config.set('systemStreams', defaultConfig);
    // clear the settings seems to not work as expected
    return config;
  }
}
module.exports.load = load;

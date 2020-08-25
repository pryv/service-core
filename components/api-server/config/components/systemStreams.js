/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

'use strict';
const _ = require('lodash');
const treeUtils = require('components/utils/src/treeUtils');

const defaultValuesForFields = {
  isIndexed: false, // if true will be sent to service-register to be able to query across the platform
  isUnique: false, // if true will be sent to service-register and enforced uniqness on mongodb
  isShown: false, // if true, will be shown for the users
  isEditable: false, // if true, user will be allowed to edit it
  isRequiredInValidation: false // if true, the field will be required in the validation
};

function load(config: Config): Config {
  // default system streams that sould be not changed
  config.set('systemStreams:account', [
    _.extend({}, defaultValuesForFields, {
      isIndexed: true,
      isUnique: true,
      isShown: true,
      type: 'identifier/string',
      name: 'Username',
      id: 'username',
      isRequiredInValidation: true
    }),
    _.extend({}, defaultValuesForFields, {
      isIndexed: true,
      isShown: true,
      isEditable: true,
      default: 'en',
      type: 'language/iso-639-1',
      name: 'Language',
      id: 'language'
    }),
    _.extend({}, defaultValuesForFields, {
      isIndexed: true,
      isRequiredInValidation: true,
      isIndexed: true,
      type: 'identifier/string',
      name: 'appId',
      id: 'appId'
    }),
    _.extend({}, defaultValuesForFields, {
      isIndexed: true,
      default: 'no-token',
      type: 'token/string',
      name: 'Invitation Token',
      id: 'invitationToken'
    }),
    _.extend({}, defaultValuesForFields, {
      type: 'password-hash/string',
      name: 'Password Hash',
      id: 'passwordHash'
    }),
    _.extend({}, defaultValuesForFields, {
      isIndexed: true,
      default: null,
      type: 'identifier/string',
      name: 'Referer',
      id: 'referer'
    }),
    {
      id: 'storageUsed',
      isShown: true,
      name: 'Storage used',
      type: 'data-quantity/b',
      children: [
        _.extend({}, defaultValuesForFields, {
          isShown: true,
          default: 0,
          type: 'data-quantity/b',
          name: 'Db Documents',
          id: 'dbDocuments'
        }),
        _.extend({}, defaultValuesForFields, {
          isShown: true,
          default: 0,
          type: 'data-quantity/b',
          name: 'Attached files',
          id: 'attachedFiles'
        })
      ]
    }
  ]);
  config.set('systemStreams:helpers', [
    _.extend({}, defaultValuesForFields, {
      isIndexed: false,
      isUnique: false,
      isShown: true,
      type: 'identifier/string',
      name: 'Active',
      id: 'active',
    })
  ]);

  const CUSTOM_SYSTEM_STREAMS_FIELDS: string = 'CUSTOM_SYSTEM_STREAMS_FIELDS';

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
   * Extend each stream with default values
   * @param {*} additionalFields 
   */
  function extendSystemStreamsWithDefaultValues (
    additionalFields: object
  ): object{
    let i;
    for (i = 0; i < additionalFields.length; i++) {
      additionalFields[i] = _.extend({}, defaultValuesForFields, additionalFields[i]);
      // if stream has children recursivelly call the same function
      if (typeof additionalFields[i].children !== 'undefined') {
        additionalFields[i].children = extendSystemStreamsWithDefaultValues(additionalFields[i].children)
      }
    };
    return additionalFields;
  }

  function denyDefaultStreamsOverride (objValue, srcValue) {
    if (objValue && objValue.id && srcValue && srcValue.id && objValue.id == srcValue.id){
      return objValue;
    }
    return _.merge(srcValue, objValue);
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
    let defaultConfig = config.get('systemStreams');
    let i;

    // extend systemStreams with default values
    let newConfigKeys = Object.keys(additionalFields);
    for (i = 0; i < newConfigKeys.length; i++) {
      additionalFields[newConfigKeys[i]] = extendSystemStreamsWithDefaultValues(additionalFields[newConfigKeys[i]]);
    }

    // first merge config with already existing keys (like account, helpers)
    let configKeys = Object.keys(defaultConfig);
    for (i = 0; i < configKeys.length; i++){
      defaultConfig[configKeys[i]] = _.values(_.mergeWith(
        _.keyBy(defaultConfig[configKeys[i]], 'id'),
        _.keyBy(additionalFields[configKeys[i]], 'id'), denyDefaultStreamsOverride
      ));
    }
    // second append new config
    for (i = 0; i < newConfigKeys.length; i++) {
      if (configKeys.includes(newConfigKeys[i])) continue;
      defaultConfig[newConfigKeys[i]] = additionalFields[newConfigKeys[i]];
    }

    // delete custom config
    delete defaultConfig.custom;

    // validate that each config stream has a type
    let allConfigKeys = Object.keys(defaultConfig);
    allConfigKeys.forEach(configKey => {
      const flatStreamsList = treeUtils.flattenTree(defaultConfig[configKey]);
      // check if each stream has a type
      flatStreamsList.forEach(stream => {
        if (!stream.type) {
          throw new Error(`SystemStreams streams must have a type. Please fix the config systemStreams.custom ${stream.id} so that all custom streams would include type. It will be used while creating the events.`);
        }
      });
    });
    

    config.set('systemStreams', defaultConfig);
    // This seems to not work as expected
    config.clear('systemStreams:custom');
    return config;
  }
}
module.exports.load = load;

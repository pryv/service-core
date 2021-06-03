/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
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
const SystemStreamsSerializer = require('business/src/system-streams/serializer');

let additionalDefaultAccountStreams;
if (fs.existsSync(path.join(path.dirname(__filename), 'additionalDefaultAccountStreams.json'))) {
  additionalDefaultAccountStreams = require('./additionalDefaultAccountStreams.json');
}

const IS_SHOWN = 'isShown';
const IS_INDEXED = 'isIndexed';
const IS_EDITABLE = 'isEditable';
const IS_UNIQUE = 'isUnique';
const IS_REQUIRED_IN_VALIDATION = 'isRequiredInValidation';

const DEFAULT = 'default';

const PRYV_PREFIX = ':_system:';
const CUSTOMER_PREFIX = ':system:';

const DEFAULT_VALUES_FOR_FIELDS = {
  [IS_INDEXED]: false, // if true will be sent to service-register to be able to query across the platform
  [IS_UNIQUE]: false, // if true will be sent to service-register and enforced uniqness on mongodb
  [IS_SHOWN]: false, // if true, will be shown for the users
  [IS_EDITABLE]: false, // if true, user will be allowed to edit it
  [IS_REQUIRED_IN_VALIDATION]: false // if true, the field will be required in the validation
};

function load(config: {}): {} {
  // default system streams that should be not changed
  let defaultAccountStreams = ensurePrefixForStreamIds([
    {
      [IS_INDEXED]: true,
      [IS_UNIQUE]: true,
      [IS_SHOWN]: true,
      type: 'identifier/string',
      name: 'Username',
      id: 'username',
      [IS_REQUIRED_IN_VALIDATION]: true
    },
    {
      [IS_INDEXED]: true,
      [IS_SHOWN]: true,
      [IS_EDITABLE]: true,
      [DEFAULT]: 'en',
      type: 'language/iso-639-1',
      name: 'Language',
      id: 'language'
    },
    {
      [IS_INDEXED]: true,
      [DEFAULT]: '',
      [IS_REQUIRED_IN_VALIDATION]: true,
      type: 'identifier/string',
      name: 'appId',
      id: 'appId'
    },
    {
      [IS_INDEXED]: true,
      [DEFAULT]: 'no-token',
      type: 'token/string',
      name: 'Invitation Token',
      id: 'invitationToken'
    },
    {
      type: 'password-hash/string',
      name: 'Password Hash',
      id: 'passwordHash'
    },
    {
      [IS_INDEXED]: true,
      [DEFAULT]: null,
      type: 'identifier/string',
      name: 'Referer',
      id: 'referer'
    },
    {
      id: 'storageUsed',
      [IS_SHOWN]: true,
      name: 'Storage used',
      type: 'data-quantity/b',      
      children: [
        {
          [IS_SHOWN]: true,
          default: 0,
          type: 'data-quantity/b',
          name: 'Db Documents',
          id: 'dbDocuments'
        },
        {
          [IS_SHOWN]: true,
          default: 0,
          type: 'data-quantity/b',
          name: 'Attached files',
          id: 'attachedFiles'
        }
      ]
    }
  ]);
  
  if (additionalDefaultAccountStreams) {
    defaultAccountStreams = defaultAccountStreams.concat(additionalDefaultAccountStreams);
  }

  defaultAccountStreams = extendSystemStreamsWithDefaultValues(defaultAccountStreams);
  config.set('systemStreams:account', defaultAccountStreams);
  config.set('systemStreams:helpers', ensurePrefixForStreamIds([
    _.extend({}, DEFAULT_VALUES_FOR_FIELDS, {
      isIndexed: false,
      isUnique: false,
      [IS_SHOWN]: true,
      type: 'identifier/string',
      name: 'Active',
      id: 'active',
    }),
    _.extend({}, DEFAULT_VALUES_FOR_FIELDS, {
      isIndexed: false,
      isUnique: false,
      [IS_SHOWN]: false,
      type: 'identifier/string',
      name: 'Unique',
      id: 'unique',
    }),
  ]));

  const CUSTOM_SYSTEM_STREAMS_FIELDS: string = 'CUSTOM_SYSTEM_STREAMS_FIELDS';

  readAdditionalFieldsConfig(config);
  addPrefixToRootStreamsAndSetParentIdAndChildren(config);
  return config;

  function addPrefixToRootStreamsAndSetParentIdAndChildren(config): void {
    const rootStreams = config.get('systemStreams');
    for (const [rootStreamId, streams] of Object.entries(rootStreams)) {
      
      rootStreams[_addPrefixToStreamId(rootStreamId, PRYV_PREFIX)] = streams;

      streams.forEach(stream => {
        stream.parentId = _addPrefixToStreamId(rootStreamId, PRYV_PREFIX);
        stream = addParentIdToChildren(stream);
      });
      delete rootStreams[rootStreamId];
    }

    const systemStreams = makeRootKeysIntoStreamsWithDefaultValues(rootStreams);
  
    config.set('systemStreams', systemStreams);

    function addParentIdToChildren(stream) {
      if (stream.children == null) {
        stream.children = [];
        return stream;
      }
      stream.children.forEach(childStream => {
        childStream.parentId = stream.id;
        childStream = addParentIdToChildren(childStream);
      });
      return stream;
    }

    function makeRootKeysIntoStreamsWithDefaultValues(rootStreams) {
      const systemStreams = [];
      for (const [rootStreamId, streamArray] of Object.entries(rootStreams)) {
        systemStreams.push({
          name: rootStreamId,
          id: rootStreamId,
          parentId: null,
          children: streamArray,
          [IS_SHOWN]: true,
          [IS_EDITABLE]: false,
          [IS_INDEXED]: false,
          [IS_UNIQUE]: false,
        });
      }
      return systemStreams;
    }
  }

  /**
   * If any, load custom system streams from:
   * 1. env variable
   * 2. custom:systemStreams
   */
  function readAdditionalFieldsConfig(config): void {
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
  function ensurePrefixForStreamIds (systemStreams: Array<{}>, prefix: string = PRYV_PREFIX): array {
    for (const systemStream of systemStreams) {
      systemStream.id = _addPrefixToStreamId(systemStream.id, prefix);
      //systemStream.id = SystemStreamsSerializer.addPrivatePrefixToStreamId(systemStream.id);
      if (typeof systemStream.children == 'object') {
        systemStream.children = ensurePrefixForStreamIds(systemStream.children);
      }
    }
    return systemStreams;
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
    const systemStreams = config.get('systemStreams');

    // extend systemStreams with default values
    const newConfigKeys = Object.keys(additionalFields);
    for (let i = 0; i < newConfigKeys.length; i++) {
      additionalFields[newConfigKeys[i]] = extendSystemStreamsWithDefaultValues(additionalFields[newConfigKeys[i]]);
    }

    // make sure each config id starts with '.' - dot sign
    for (const [configKey, config] of Object.entries(additionalFields)) {
      additionalFields[configKey] = ensurePrefixForStreamIds(config);
    }
    
    // first merge config with already existing keys (like account, helpers)
    const configKeys = Object.keys(systemStreams);
    for (let i = 0; i < configKeys.length; i++){
      systemStreams[configKeys[i]] = _.values(_.mergeWith(
        _.keyBy(systemStreams[configKeys[i]], 'id'),
        _.keyBy(additionalFields[configKeys[i]], 'id'), denyDefaultStreamsOverride
      ));
    }
    // second append new config
    for (let i = 0; i < newConfigKeys.length; i++) {
      if (configKeys.includes(newConfigKeys[i])) continue;
      systemStreams[newConfigKeys[i]] = additionalFields[newConfigKeys[i]];
    }

    // validate that each config stream is valid according to schmema, its id is not reserved and that it has a type
    const allConfigKeys = Object.keys(systemStreams);
    for(let configKey of allConfigKeys) {
      const flatStreamsList = treeUtils.flattenTree(systemStreams[configKey]);
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

    config.set('systemStreams', systemStreams);
    // clear the settings seems to not work as expected
    return config;
  }
}
module.exports.load = load;

function _addPrefixToStreamId(streamId: string, prefix: string): string {
  return prefix + streamId;
}
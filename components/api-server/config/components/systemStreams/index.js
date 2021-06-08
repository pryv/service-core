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
const SystemStream = require('business/src/system-streams/SystemStream');

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
  [IS_SHOWN]: true, // if true, will be shown for the users
  [IS_EDITABLE]: false, // if true, user will be allowed to edit it
  [IS_REQUIRED_IN_VALIDATION]: false // if true, the field will be required in the validation
};

function load(config: {}): {} {
  // default system streams that should be not changed
  let defaultAccountStreams = ensurePrefixForStreamIds([
    {
      [IS_INDEXED]: true,
      [IS_UNIQUE]: true,
      type: 'identifier/string',
      name: 'Username',
      id: 'username',
      [IS_REQUIRED_IN_VALIDATION]: true
    },
    {
      [IS_INDEXED]: true,
      [IS_EDITABLE]: true,
      [DEFAULT]: 'en',
      type: 'language/iso-639-1',
      name: 'Language',
      id: 'language'
    },
    {
      [IS_SHOWN]: false,
      [IS_INDEXED]: true,
      [DEFAULT]: '',
      [IS_REQUIRED_IN_VALIDATION]: true,
      type: 'identifier/string',
      name: 'appId',
      id: 'appId'
    },
    {
      [IS_SHOWN]: false,
      [IS_INDEXED]: true,
      [DEFAULT]: 'no-token',
      type: 'token/string',
      name: 'Invitation Token',
      id: 'invitationToken'
    },
    {
      [IS_SHOWN]: false,
      type: 'password-hash/string',
      name: 'Password Hash',
      id: 'passwordHash'
    },
    {
      [IS_SHOWN]: false,
      [IS_INDEXED]: true,
      [DEFAULT]: null,
      type: 'identifier/string',
      name: 'Referer',
      id: 'referer'
    },
    {
      id: 'storageUsed',
      name: 'Storage used',
      type: 'data-quantity/b',      
      children: [
        {
          default: 0,
          type: 'data-quantity/b',
          name: 'Db Documents',
          id: 'dbDocuments'
        },
        {
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

  addCustomStreams(config);
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
        systemStreams.push(_.extend({}, DEFAULT_VALUES_FOR_FIELDS, {
          name: rootStreamId,
          id: rootStreamId,
          parentId: null,
          children: streamArray,
        }));
      }
      return systemStreams;
    }
  }

  /**
   * If any, load custom system streams from: custom:systemStreams
   */
  function addCustomStreams(config): void {
    const customStreams = config.get('custom:systemStreams');
    if (customStreams != null) {
      extendWithCustomStreams(config, customStreams);
    }
  }

  /**
   * Extend each stream with default values
   * @param {*} streams 
   */
  function extendSystemStreamsWithDefaultValues (
    streams: Array<{}>
  ): Array<{}>{
    for (let i = 0; i < streams.length; i++) {
      streams[i] = _.extend({}, DEFAULT_VALUES_FOR_FIELDS, streams[i]);
      if (!streams[i].name) {
        streams[i].name = streams[i].id;
      }
      // if stream has children recursivelly call the same function
      if (Array.isArray(streams[i].children)) {
        streams[i].children = extendSystemStreamsWithDefaultValues(streams[i].children)
      }
    }
    return streams;
  }

  /**
   * Adds the prefix to each "id" property of the provided system streams array.
   * 
   * @param {Array<systemStream>} systemStreams array of system streams
   * @param {string} prefix the prefix to add
   */
  function ensurePrefixForStreamIds (systemStreams: Array<{}>, prefix: string = PRYV_PREFIX): array {
    for (const systemStream of systemStreams) {
      systemStream.id = _addPrefixToStreamId(systemStream.id, prefix);
      //systemStream.id = SystemStreamsSerializer.addPrivatePrefixToStreamId(systemStream.id);
      if (Array.isArray(systemStream.children)) {
        systemStream.children = ensurePrefixForStreamIds(systemStream.children);
      }
    }
    return systemStreams;
  }

  /**
   * Iterate through additional fields, add default values and
   * set to the main system streams config
   * @param {*} customStreams
   */
  function extendWithCustomStreams(
    config,
    customStreams: Map<string, Array<SystemStream>>
  ) {
    const systemStreams = config.get('systemStreams');

    for (const [key, streamsArray] of Object.entries(customStreams)) {
      customStreams[key] = extendSystemStreamsWithDefaultValues(customStreams[key]);
      customStreams[key] = ensurePrefixForStreamIds(streamsArray);
    }
    
    // first merge config with already existing keys (like account, helpers)
    for (const key of Object.keys(systemStreams)){
      // merging will be easier as we will differentiate prefixes - although they will be the same in case of retro-compatibility
      systemStreams[key] = Object.values(_.mergeWith(
        _.keyBy(systemStreams[key], 'id'),
        _.keyBy(customStreams[key], 'id'), denyDefaultStreamsOverride
      ));
    }
    // second append new config
    const existingKeys = Object.keys(systemStreams);
    const newKeys = Object.keys(customStreams);
    for (const newKey of newKeys) {
      if (existingKeys.includes(newKey)) continue;
      systemStreams[newKey] = customStreams[newKey];
    }

    // validate that each config stream is valid according to schema, its id is not reserved and that it has a type
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
  if (streamId.startsWith(prefix)) return streamId;
  return prefix + streamId;
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
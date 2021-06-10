/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow
const _ = require('lodash');

const Stream = require('business/src/streams/Stream');
const SystemStream = require('business/src/system-streams/SystemStream');
const treeUtils = require('utils').treeUtils;
const { getConfigUnsafe } = require('@pryv/boiler');

const PRYV_PREFIX = ':_system:';
const CUSTOMER_PREFIX = ':system:';

const IS_SHOWN = 'isShown';
const IS_INDEXED = 'isIndexed';
const IS_EDITABLE = 'isEditable';
const IS_UNIQUE = 'isUnique';

const ALL = 'all';

const CONFIG_ACCOUNT_STREAMS = 'systemStreams:account';

let singleton = null;

/**
 * Class that converts system->account events to the
 * Account information that matches the previous 
 * structure of the account info
 */
class SystemStreamsSerializer {

  // Nomenclature
  // no suffix: tree
  // array/flat: flattened tree
  // map (id as key)

  /**
   * "systemStreams" object in config
   */
  systemStreamsSettings: {};

  // static
  static allAsTree: ?Array<SystemStream>;
  static allStreamIds: ?Array<string>;

  static readable: ?Array<Stream>;

  static readableAccountMap: ?Map<string, SystemStream>;
  static readableAccountMapForTests: ?Map<string, SystemStream>;
  static readableAccountStreamIds: ?Array<string>;

  static editableAccountMap: ?Map<string, SystemStream>;
  static editableAccountStreamIds: ?Array<string>;

  static accountMap: ?Map<string, Array<string>>;
  static accountMapWithOptions: ?Array<string>;
  static accountLeavesMap: ?Map<string, SystemStream>;
  static accountStreamIds: ?Array<string>;

  static indexedAccountStreamsIdsWithoutPrefix: ?Array<string>;
  static uniqueAccountStreamsIdsWithoutPrefix: ?Array<string>;

  static accountStreamsIdsForbiddenForReading: ?Array<string>;
  
  static accountChildren: ?Array<SystemStream>;

  // Maps used for quick translation from without prefix to with
  static streamIdWithPrefixToWithout: ?Map<string, string>;
  static streamIdWithoutPrefixToWith: ?Map<string, string>;
  static options: ?Map<string, string>;

  static getSerializer() {
    if (singleton) return singleton;
    singleton = new SystemStreamsSerializer();
    initializeSerializer(singleton);
    return singleton;
  }

  /**
   * Reloads the serializer based on the config provided as parameter.
   * See "config.default-streams.test.js" (V9QB, 5T5S, ARD9) for usage example
   */
  static reloadSerializer(config: {}): void {
    if (getConfigUnsafe(true).get('NODE_ENV') !== 'test') {
      console.error('this is meant to be used in test only');
      process.exit(1);
    }
    singleton = new SystemStreamsSerializer();
    singleton.systemStreamsSettings = config.get('systemStreams');
    
    this.allAsTree = null;
    this.allStreamIds = null;
    this.readable = null;
    this.readableAccountStreamIds = null;
    this.readableAccountMap = null;
    this.readableAccountMapForTests = null;
    this.editableAccountMap = null;
    this.editableAccountStreamIds = null;
    this.accountMap = null;
    this.accountMapWithOptions = null;
    this.accountLeavesMap = null;
    this.accountStreamIds = null;
    this.indexedAccountStreamsIdsWithoutPrefix = null;
    this.uniqueAccountStreamsIdsWithoutPrefix = null;
    this.accountStreamsIdsForbiddenForReading = null;
    this.accountChildren = null;
    this.streamIdWithPrefixToWithout = null;
    this.streamIdWithoutPrefixToWith = null;
    this.options = null;
    initializeSerializer(singleton);
  }

  constructor () {
    this.systemStreamsSettings = getConfigUnsafe(true).get('systemStreams');
    if (this.systemStreamsSettings == null) {
      throw Error('Invalid system streams settings');
    }
  }

  /**
   * Get AccountStremsConfigContent
   * cached,
   */
  static getAccountChildren (): Array<SystemStream> {
    if ( SystemStreamsSerializer.accountChildren != null ) return SystemStreamsSerializer.accountChildren;
    SystemStreamsSerializer.accountChildren = treeUtils.findById(this.allAsTree, PRYV_PREFIX + 'account').children;
    return SystemStreamsSerializer.accountChildren;
  }

  /**
   * Returns readable account stream in a map: string -> stream
   */
  static getReadableAccountMap(): Map<string, SystemStream> {
    if ( SystemStreamsSerializer.readableAccountMap != null ) return SystemStreamsSerializer.readableAccountMap;
    SystemStreamsSerializer.readableAccountMap = filterMapStreams(
      SystemStreamsSerializer.getAccountChildren(),
      IS_SHOWN,
    );
    return SystemStreamsSerializer.readableAccountMap;
  }

  /**
   * Returns keys of getReadableAccountMap
   */
  static getReadableAccountStreamIds(): Array<string> {
    if (SystemStreamsSerializer.readableAccountStreamIds != null) return SystemStreamsSerializer.readableAccountStreamIds;
    SystemStreamsSerializer.readableAccountStreamIds = Object.keys(SystemStreamsSerializer.getReadableAccountMap());
    return SystemStreamsSerializer.readableAccountStreamIds;
  }

  /**
   * Same as getReadableAccountMap, but without storageUsed
   */
  static getReadableAccountMapForTests(): Map<string, SystemStream> {
    if ( SystemStreamsSerializer.readableAccountMapForTests != null ) return SystemStreamsSerializer.readableAccountMapForTests;
    
    const streams = filterMapStreams(SystemStreamsSerializer.getAccountChildren(), IS_SHOWN);
    delete streams[SystemStreamsSerializer.addPrivatePrefixToStreamId('storageUsed')];
    SystemStreamsSerializer.readableAccountMapForTests = streams;
    
    return SystemStreamsSerializer.readableAccountMapForTests;
  }

  /**
   * Returns editable account streams in a map streamId -> stream
   */
  static getEditableAccountMap(): Map<string, SystemStream> {
    if ( SystemStreamsSerializer.editableAccountMap != null ) return SystemStreamsSerializer.editableAccountMap;
    
    SystemStreamsSerializer.editableAccountMap = filterMapStreams(SystemStreamsSerializer.getAccountChildren(), IS_EDITABLE);

    return SystemStreamsSerializer.editableAccountMap;
  }


  /**
   * Get only those streams that user is allowed to edit 
   */
  static getEditableAccountStreamIds(): Array<string> {
    if ( SystemStreamsSerializer.editableAccountStreamIds != null ) return SystemStreamsSerializer.editableAccountStreamIds;
    
    SystemStreamsSerializer.editableAccountStreamIds = Object.keys(SystemStreamsSerializer.getEditableAccountMap());

    return SystemStreamsSerializer.editableAccountStreamIds;
  }

  /**
   * Returns account system streams
   * streamId -> stream
   * 
   * should be used only for internal usage because contains fields that 
   * should not be returned to the user
   */
  static getAccountMap(): Map<string, SystemStream> {
    if ( SystemStreamsSerializer.accountMap != null ) return SystemStreamsSerializer.accountMap;
    
    SystemStreamsSerializer.accountMap = filterMapStreams(SystemStreamsSerializer.getAccountChildren(), ALL);
    return SystemStreamsSerializer.accountMap;
  }

  /**
   * Returns keys of getAccountMap
   * streamId -> stream
   * 
   * should be used only for internal usage because contains fields that 
   * should not be returned to the user
   */
  static getAccountStreamIds(): Array<string> {
    if ( SystemStreamsSerializer.accountStreamIds != null ) return SystemStreamsSerializer.accountStreamIds;
    
    SystemStreamsSerializer.accountStreamIds = Object.keys(SystemStreamsSerializer.getAccountMap());
    return SystemStreamsSerializer.accountStreamIds;
  }

  /**
   * Similar to getAccountMap, but the result gets organized into categories:
   * 
   */
  static getAccountStreamIdsForUser(): Map<string, Array<string>> {
    if ( SystemStreamsSerializer.allAccountStreamIdsForUser != null ) return SystemStreamsSerializer.allAccountStreamIdsForUser;
    
    const returnObject = new Map();
    returnObject.uniqueAccountFields = [];
    returnObject.readableAccountFields = [];
    returnObject.accountFields = [];
    returnObject.accountFieldsWithPrefix = [];

    const accountStreams = SystemStreamsSerializer.getAccountMap();
    
    Object.keys(accountStreams).forEach(streamId => {
      returnObject.accountFieldsWithPrefix.push(streamId);
      const streamIdWithoutPrefix = SystemStreamsSerializer.removePrefixFromStreamId(streamId);
      if (accountStreams[streamId].isUnique == true) {
        returnObject.uniqueAccountFields.push(streamIdWithoutPrefix);
      }
      if (accountStreams[streamId].isShown == true) {
        returnObject.readableAccountFields.push(streamIdWithoutPrefix);
      }    
      returnObject.accountFields.push(streamIdWithoutPrefix);
    });
    SystemStreamsSerializer.allAccountStreamIdsForUser = returnObject;
    
    return SystemStreamsSerializer.allAccountStreamIdsForUser;
  }

  /**
   * Return not only account stream but also helper streams
   * @returns {array} of StreamIds
   */
  static getAccountMapWithOptions (): Map<string, boolean> {
    if ( SystemStreamsSerializer.accountMapWithOptions != null ) return SystemStreamsSerializer.accountMapWithOptions;
    const accountMapWithOptions = _.cloneDeep(SystemStreamsSerializer.getAccountMap());
    accountMapWithOptions[SystemStreamsSerializer.options.STREAM_ID_ACCOUNT] = true;
    accountMapWithOptions[SystemStreamsSerializer.options.STREAM_ID_ACTIVE] = true;
    accountMapWithOptions[SystemStreamsSerializer.options.STREAM_ID_UNIQUE] = true;
    accountMapWithOptions[SystemStreamsSerializer.options.STREAM_ID_HELPERS] = true;

    SystemStreamsSerializer.accountMapWithOptions = accountMapWithOptions;

    return SystemStreamsSerializer.accountMapWithOptions;
  }

  /**
   * Return true is this streamid is a system stream
   * @param {string} streamId 
   * @returns {boolean} 
   */
  static isAccountStreamId(streamId: string): ?boolean {
    return SystemStreamsSerializer.getAccountMapWithOptions()[streamId];
  }

  /**
   * The same as getAccountMap () but returnes only streams leaves (not parents)
   */
  static getAccountLeavesMap(): Map<string, SystemStream> {
    if (SystemStreamsSerializer.accountLeavesMap != null) return SystemStreamsSerializer.accountLeavesMap
      
    const flatStreamsList = treeUtils.flattenTreeWithoutParents(SystemStreamsSerializer.getAccountChildren());
    let streamsMap = {};

    for (let i = 0; i < flatStreamsList.length; i++) {
      streamsMap[flatStreamsList[i].id] = flatStreamsList[i];
    }
    SystemStreamsSerializer.accountLeavesMap = streamsMap;
    return SystemStreamsSerializer.accountLeavesMap;
  }

/**
 * Get streamIds of fields that should be indexed
 */
  static getIndexedAccountStreamsIdsWithoutPrefix(): Array<string> {
    if (SystemStreamsSerializer.indexedAccountStreamsIdsWithoutPrefix != null) return SystemStreamsSerializer.indexedAccountStreamsIdsWithoutPrefix;
    let indexedStreamIds = Object.keys(filterMapStreams(SystemStreamsSerializer.getAccountChildren(), IS_INDEXED));
    SystemStreamsSerializer.indexedAccountStreamsIdsWithoutPrefix = indexedStreamIds.map(
      streamId => {
        return SystemStreamsSerializer.removePrefixFromStreamId(streamId)
      }
    );
    return SystemStreamsSerializer.indexedAccountStreamsIdsWithoutPrefix;
  }

/**
 * Returns streamIds of fields that are unique. Without prefix
 */
  static getUniqueAccountStreamsIdsWithoutPrefix(): Array<string> {
    if (SystemStreamsSerializer.uniqueAccountStreamsIdsWithoutPrefix != null) return SystemStreamsSerializer.uniqueAccountStreamsIdsWithoutPrefix;
    const uniqueStreamIds = Object.keys(filterMapStreams(SystemStreamsSerializer.getAccountChildren(), IS_UNIQUE));
    SystemStreamsSerializer.uniqueAccountStreamsIdsWithoutPrefix =
      uniqueStreamIds.map(streamId => {
        return SystemStreamsSerializer.removePrefixFromStreamId(streamId)
    });
    return SystemStreamsSerializer.uniqueAccountStreamsIdsWithoutPrefix;
  }

  /**
   * Get steams that are NOT allowed to view for the user
   * this function will be used to exclude streamIds from queries
   */
  static getAccountStreamsIdsForbiddenForReading(): Array<string> {
    if (SystemStreamsSerializer.accountStreamsIdsForbiddenForReading != null) return SystemStreamsSerializer.accountStreamsIdsForbiddenForReading;
    const accountMap = SystemStreamsSerializer.getAccountMap();
    const readableStreams = SystemStreamsSerializer.getReadableAccountMap();
    SystemStreamsSerializer.accountStreamsIdsForbiddenForReading = _.difference(
      Object.keys(accountMap),
      Object.keys(readableStreams)
    );
    
    return SystemStreamsSerializer.accountStreamsIdsForbiddenForReading;
  }

  /**
   * Modification that is done for each systemStreamId
   * @param string streamIdWithDot
   */
  static removeDotFromStreamId(streamIdWithDot: string): string {
    if (streamIdWithDot.startsWith('.')) {
      streamIdWithDot = streamIdWithDot.substr(1, streamIdWithDot.length);
    }
    return streamIdWithDot;
  }

  /**
   * Removes the system stream prefix, if any
   * @param string streamIdWithPrefix
   */
  static removePrefixFromStreamId(streamIdWithPrefix: string): string {
    const streamIdWithoutPrefix = SystemStreamsSerializer.streamIdWithPrefixToWithout[streamIdWithPrefix];
    return streamIdWithoutPrefix ? streamIdWithoutPrefix : streamIdWithPrefix;
  }

  /**
  * Adds private systeam stream prefix to stream id, if available
  * @param string streamId
  */
  static addPrivatePrefixToStreamId(streamId: string): string {
    const streamIdWithPrefix = SystemStreamsSerializer.streamIdWithoutPrefixToWith[streamId];
    return streamIdWithPrefix ? streamIdWithPrefix : streamId;
  }

  /**
  * Adds customer systeam stream prefix to stream id, if available
  * @param string streamId
  */
  static addCustomerPrefixToStreamId(streamId: string): string {
    const streamIdWithPrefix = SystemStreamsSerializer.streamIdWithoutPrefixToWith[streamId];
    return streamIdWithPrefix ? streamIdWithPrefix : streamId;
  }

  /**
   * Get all ids of all system streams
   */
  static getAllSystemStreamsIds() {
    return this.allStreamIds;
  }

  /**
   * Builds allAsTree
   * Returns a streams tree of all system streams
   */
  static getAll(): Array<SystemStream> {
    if ( SystemStreamsSerializer.allAsTree != null ) return SystemStreamsSerializer.allAsTree;
    SystemStreamsSerializer.allAsTree = this.systemStreamsSettings;
    return SystemStreamsSerializer.allAsTree;
  }

  /**
   * Return all readable system streams
   */
  static getReadable(): Array<Stream> {
    if (SystemStreamsSerializer.readable) return SystemStreamsSerializer.readable;
    SystemStreamsSerializer.readable = treeUtils.filterTree(this.allAsTree, false, s => s[IS_SHOWN]);
    SystemStreamsSerializer.readable = treeUtils.apply(this.readable, s => _.pick(s, Stream.properties));
    return SystemStreamsSerializer.readable;
  }
}

/**
 * Filters streams and returns them as a Map:
 * streamId -> stream
 * 
 * @param Array<SysteamStream> streams - tree of system streams
 * @param string filter - boolean value used for filtering
 */
function filterMapStreams (streams: Array<SystemStream>, filter: string = IS_SHOWN): Map<string, SystemStream> {
  let streamsMap: Map<string, SystemStream> = new Map();
  
  if (! Array.isArray(streams)) {
    return streamsMap;
  }
  const flatStreamsList = treeUtils.flattenTree(streams);

  // convert list to objects
  for (let i = 0; i < flatStreamsList.length; i++){
    
    if (filter === ALL || flatStreamsList[i][filter]) {
      streamsMap[flatStreamsList[i].id] = flatStreamsList[i]
    } else {
      // escape it
    }
  }
  return streamsMap;
}

module.exports = SystemStreamsSerializer;

function initializeSerializer(serializer) {
  SystemStreamsSerializer.getAll.call(serializer);

  const allAsArray: Array<SystemStream> = treeUtils.flattenTree(SystemStreamsSerializer.allAsTree);
  const allStreamIds: Array<string> = allAsArray.map(s => s.id);
  initializeTranslationMaps(allStreamIds);

  SystemStreamsSerializer.allAsArray = allAsArray;
  SystemStreamsSerializer.allStreamIds = allStreamIds;

  const options = {
    STREAM_ID_ACTIVE: 'active',
    STREAM_ID_UNIQUE: 'unique',
    STREAM_ID_USERNAME: 'username',
    STREAM_ID_PASSWORDHASH: 'passwordHash',
    STREAM_ID_HELPERS: 'helpers',
    STREAM_ID_ACCOUNT: 'account',
  };
  Object.keys(options).forEach(k => {
    options[k] = SystemStreamsSerializer.addPrivatePrefixToStreamId(options[k]);
  });
  SystemStreamsSerializer.options = options;

  function initializeTranslationMaps(streamIdsWithPrefix: Array<string>) {
    SystemStreamsSerializer.streamIdWithoutPrefixToWith = new Map();
    SystemStreamsSerializer.streamIdWithPrefixToWithout = new Map();
    streamIdsWithPrefix.forEach(streamIdWithPrefix => {
      const streamIdWithoutPrefix = _removePrefixFromStreamId(streamIdWithPrefix);
      SystemStreamsSerializer.streamIdWithPrefixToWithout[streamIdWithPrefix] = streamIdWithoutPrefix;
      SystemStreamsSerializer.streamIdWithoutPrefixToWith[streamIdWithoutPrefix] = streamIdWithPrefix;
    });
  }
}

/**
 * Removes the prefix from the streamId
 * Only to be used at initialization!
 * 
 * @param streamId 
 */
function _removePrefixFromStreamId(streamId: string): string {
  if (streamId.startsWith(PRYV_PREFIX)) return streamId.substr(PRYV_PREFIX.length);
  if (streamId.startsWith(CUSTOMER_PREFIX)) return streamId.substr(CUSTOMER_PREFIX.length);
  throw new Error('serializer initialization: removePrefixFromStreamId(streamId) should be called with a prefixed streamId');
}
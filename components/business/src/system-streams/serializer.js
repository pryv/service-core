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

  static readable: ?Array<SystemStream>;

  static readableAccountStreams: ?Array<{}>;
  static readableAccountStreamsForTests: ?Array<{}>;
  static editableAccountStreams: ?Array<{}>;
  static accountMap: ?Map<string, Array<string>>;
  static allAccountStreamsIdsForAccess: ?Array<string>;
  static allAccountStreamsLeaves: ?Array<{}>;
  static indexedAccountStreamsIdsWithoutPrefix: ?Array<string>;
  static uniqueAccountStreamsIdsWithoutPrefix: ?Array<string>;
  static accountStreamsIdsForbiddenForEditing: ?Array<string>;
  static accountStreamsIdsForbiddenForReading: ?Array<string>;
  static flatAccountStreamSettings: ?Array<{}>;
  static accountStreamsConfig: ?{};

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
    this.readableAccountStreams = null;
    this.readableAccountStreamsForTests = null;
    this.editableAccountStreams = null;
    this.accountMap = null;
    this.allAccountStreamsIdsForAccess = null;
    this.allAccountStreamsLeaves = null;
    this.indexedAccountStreamsIdsWithoutPrefix = null;
    this.uniqueAccountStreamsIdsWithoutPrefix = null;
    this.accountStreamsIdsForbiddenForEditing = null;
    this.accountStreamsIdsForbiddenForReading = null;
    this.flatAccountStreamSettings = null;
    this.accountStreamsConfig = null;
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
  static getAccountStreamsConfig () {
    if ( SystemStreamsSerializer.accountStreamsConfig != null ) return SystemStreamsSerializer.accountStreamsConfig;
    
    SystemStreamsSerializer.accountStreamsConfig = treeUtils.findById(this.allAsTree, PRYV_PREFIX + 'account').children;
    return SystemStreamsSerializer.accountStreamsConfig;
  }

  /**
   * Get the names of all readable streams that belongs to the system->account stream
   * and could be returned to the user
   */
  static getReadableAccountStreams () {
    if ( SystemStreamsSerializer.readableAccountStreams != null ) return SystemStreamsSerializer.readableAccountStreams;
    
    SystemStreamsSerializer.readableAccountStreams = filterMapStreams(
      SystemStreamsSerializer.getAccountStreamsConfig(),
      IS_SHOWN
    );
    
    return SystemStreamsSerializer.readableAccountStreams;
  }

  /**
   * The same as getReadableAccountStreams (), just skips storageUsed because it is 
   * a parent and no events are created by default for it directly.
   */
  static getReadableAccountStreamsForTests () {
    if ( SystemStreamsSerializer.readableAccountStreamsForTests != null ) return SystemStreamsSerializer.readableAccountStreamsForTests;
    
    const streams = filterMapStreams(SystemStreamsSerializer.getAccountStreamsConfig(), IS_SHOWN);
    delete streams[SystemStreamsSerializer.addPrivatePrefixToStreamId('storageUsed')];
    SystemStreamsSerializer.readableAccountStreamsForTests = streams;
    
    return SystemStreamsSerializer.readableAccountStreamsForTests;
  }

  /**
   * Get only those streams that user is allowed to edit 
   */
  static getEditableAccountStreams () {
    if ( SystemStreamsSerializer.editableAccountStreams != null ) return SystemStreamsSerializer.editableAccountStreams;
    
    SystemStreamsSerializer.editableAccountStreams = filterMapStreams(SystemStreamsSerializer.getAccountStreamsConfig(), IS_EDITABLE);
    SystemStreamsSerializer.editableAccountStreams = filterMapStreams(SystemStreamsSerializer.getAccountStreamsConfig(), IS_EDITABLE);

    return SystemStreamsSerializer.editableAccountStreams;
  }

  /**
   * Returns account system streams
   * streamId -> stream
   * 
   * should be used only for internal usage because contains fields that 
   * should not be returned to the user
   */
  static getAccountMap (): Map<string, {}> {
    if ( SystemStreamsSerializer.accountMap != null ) return SystemStreamsSerializer.accountMap;
    
    SystemStreamsSerializer.accountMap = filterMapStreams(SystemStreamsSerializer.getAccountStreamsConfig(), ALL);

    return SystemStreamsSerializer.accountMap;
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
  static getAccountMapIdsForAccess () {
    if ( SystemStreamsSerializer.allAccountStreamsIdsForAccess != null ) return SystemStreamsSerializer.allAccountStreamsIdsForAccess;
    
    const allAccountStreamsIds = Object.keys(SystemStreamsSerializer.getAccountMap());
    allAccountStreamsIds.push(SystemStreamsSerializer.options.STREAM_ID_ACCOUNT);
    allAccountStreamsIds.push(SystemStreamsSerializer.options.STREAM_ID_ACTIVE);
    allAccountStreamsIds.push(SystemStreamsSerializer.options.STREAM_ID_UNIQUE);
    allAccountStreamsIds.push(SystemStreamsSerializer.options.STREAM_ID_HELPERS);
    SystemStreamsSerializer.allAccountStreamsIdsForAccess = allAccountStreamsIds;

    return SystemStreamsSerializer.allAccountStreamsIdsForAccess;
  }

  /**
   * Return true is this streamid is a system stream
   * @param {string} streamId 
   * @returns {boolean} 
   */
  static isAccountStreamId(streamId) {
    return SystemStreamsSerializer.getAccountMapIdsForAccess().includes(streamId);
  }

  /**
   * The same as getAccountMap () but returnes only streams leaves (not parents)
   */
  static getAccountLeavesMap() {
    if (! SystemStreamsSerializer.allAccountStreamsLeaves) {
      
      const flatStreamsList = treeUtils.flattenTreeWithoutParents(SystemStreamsSerializer.getAccountStreamsConfig());
      let streamsMap = {};

      for (let i = 0; i < flatStreamsList.length; i++) {
        streamsMap[flatStreamsList[i].id] = flatStreamsList[i];
      }
      SystemStreamsSerializer.allAccountStreamsLeaves = streamsMap;
    }
    return SystemStreamsSerializer.allAccountStreamsLeaves;
  }

/**
 * Get streamIds of fields that should be indexed
 */
  static getIndexedAccountStreamsIdsWithoutPrefix(): Array<string> {
    if (!SystemStreamsSerializer.indexedAccountStreamsIdsWithoutPrefix) {
      let indexedStreamIds = Object.keys(filterMapStreams(SystemStreamsSerializer.getAccountStreamsConfig(), IS_INDEXED));
      SystemStreamsSerializer.indexedAccountStreamsIdsWithoutPrefix = indexedStreamIds.map(
        streamId => {
          return SystemStreamsSerializer.removePrefixFromStreamId(streamId)
        }
      );
    }
    return SystemStreamsSerializer.indexedAccountStreamsIdsWithoutPrefix;
  }

/**
 * Returns streamIds of fields that are unique. Without prefix
 */
  static getUniqueAccountStreamsIdsWithoutPrefix(): Array<string> {
    if (!SystemStreamsSerializer.uniqueAccountStreamsIdsWithoutPrefix) {
      const uniqueStreamIds = Object.keys(filterMapStreams(SystemStreamsSerializer.getAccountStreamsConfig(), IS_UNIQUE));
      SystemStreamsSerializer.uniqueAccountStreamsIdsWithoutPrefix =
        uniqueStreamIds.map(streamId => {
          return SystemStreamsSerializer.removePrefixFromStreamId(streamId)
      });
    }
    return SystemStreamsSerializer.uniqueAccountStreamsIdsWithoutPrefix;
  }

  /**
   * Get steams that are NOT allowed to edit - this function will be used to 
   * exclude from queries
   */
  static getAccountStreamsIdsForbiddenForEditing () {
    if (!SystemStreamsSerializer.accountStreamsIdsForbiddenForEditing) {
      let allStreams = SystemStreamsSerializer.getAccountMap();
      let editableStreams = SystemStreamsSerializer.getEditableAccountStreams();

      SystemStreamsSerializer.accountStreamsIdsForbiddenForEditing = _.difference(
          _.keys(allStreams),
          _.keys(editableStreams)
        );
    }
    return SystemStreamsSerializer.accountStreamsIdsForbiddenForEditing;
  }

  /**
   * Get steams that are NOT allowed to view for the user
   * this function will be used to exclude streamIds from queries
   */
  static getAccountStreamsIdsForbiddenForReading() {
    if (!SystemStreamsSerializer.accountStreamsIdsForbiddenForReading) {
      let allStreams = SystemStreamsSerializer.getAccountMap();
      let readableStreams = SystemStreamsSerializer.getReadableAccountStreams();
      SystemStreamsSerializer.accountStreamsIdsForbiddenForReading = _.difference(
        _.keys(allStreams),
        _.keys(readableStreams)
      );
    }
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
  * Adds private systeam stream prefix to stream id, if needed
  * @param string streamId
  */
  static addPrivatePrefixToStreamId(streamId: string): string {
    const streamIdWithPrefix = SystemStreamsSerializer.streamIdWithoutPrefixToWith[streamId];
    return streamIdWithPrefix ? streamIdWithPrefix : streamId;
  }

  /**
  * Adds customer systeam stream prefix to stream id, if needed
  * @param string streamId
  */
  static addCustomerPrefixToStreamId (streamId: string): string {
    const streamIdWithPrefix = SystemStreamsSerializer.streamIdWithoutPrefixToWith[streamId];
    return streamIdWithPrefix ? streamIdWithPrefix : streamId;
  }
  
  /**
   * Build flattened account stream settings and converted from an array to object
   */
  static getFlatAccountStreamSettings () {
    if (!SystemStreamsSerializer.flatAccountStreamSettings) {
      let accountSettings = {};
      const flatStreamsList = treeUtils.flattenTree(SystemStreamsSerializer.getAccountStreamsConfig());

      // convert list to object
      let i;
      for (i = 0; i < flatStreamsList.length; i++) {
        accountSettings[flatStreamsList[i].id] = flatStreamsList[i];
      }
      SystemStreamsSerializer.flatAccountStreamSettings = accountSettings;
    } 
    return SystemStreamsSerializer.flatAccountStreamSettings;
  }

  /**
   * Return true is this streamId is referenced as a system stream
   * @returns {boolean}
   */
  static isSystemStream(streamId) {
    return SystemStreamsSerializer.getFlatAccountStreamSettings().hasOwnProperty(streamId);
  }

  /**
   * Get all ids of all system streams
   */
  static getAllSystemStreamsIds() {
    return this.allIds;
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
  static getReadable(): Array<SystemStreams> {
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
  const allIds: Array<string> = allAsArray.map(s => s.id);
  initializeTranslationMaps(allIds);

  SystemStreamsSerializer.allAsArray = allAsArray;
  SystemStreamsSerializer.allIds = allIds;

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
/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow
const _ = require('lodash');
const treeUtils = require('components/utils').treeUtils;

const getConfig: () => Config = require('components/api-server/config/Config').getConfig;
import type { Config } from 'components/api-server/config/Config';
const config: Config = getConfig();

const readable = 'readable-default-streams';
const allAccountStreams = 'all-default-streams';
const editableAccountStreams = 'editable-default-streams';
const indexedStreams = 'indexed-default-streams';
const uniqueStreams = 'unique-default-streams';

const accountStreamsConfigPath = 'systemStreams:account';

/**
 * Class that converts system->account events to the
 * Account information that matches the previous 
 * structure of the account info
 */
class SystemStreamsSerializer {
  systemStreamsSettings: Config;
  accountStreamsSettings: Config;

  constructor () {
    this.systemStreamsSettings = config.get('systemStreams');
    if (this.systemStreamsSettings == null) {
      throw Error("Not valid system streams settings.");
    }
    // for some reason I cannot ddelete custom streams in the config level, so lets remove it here
    delete this.systemStreamsSettings.custom;
  }

  /**
   * Get the names of all readable streams that belongs to the system->account stream
   * and could be returned to the user
   */
  static getReadableAccountStreams () {
    return getStreamsNames(config.get(accountStreamsConfigPath), readable);
  }

  /**
   * The same as getReadableAccountStreams (), just skips storageUsed stream because it is 
   * a perrent and no events are created by default for it dirrectly
   */
  static getReadableAccountStreamsForTests () {
    let streams = getStreamsNames(config.get(accountStreamsConfigPath), readable);
    delete streams[SystemStreamsSerializer.addDotFromStreamId('storageUsed')];
    return streams;
  }

  /**
   * Get only those streams that user is allowed to edit 
   */
  static getEditableAccountStreams () {
    return getStreamsNames(config.get(accountStreamsConfigPath), editableAccountStreams);
  }

  /**
   * Get the names of all streams that belongs to the system->account stream
   * should be used only for internal usage because contains fields that 
   * should not be returned to the user
   */
  static getAllAccountStreams () {
    return getStreamsNames(config.get(accountStreamsConfigPath), allAccountStreams);
  }

  static getAllAccountStreamsIdsForAccess () {
    let allAccountStreamsIds = Object.keys(SystemStreamsSerializer.getAllAccountStreams());
    allAccountStreamsIds.push(SystemStreamsSerializer.addDotFromStreamId('account'));
    allAccountStreamsIds.push(SystemStreamsSerializer.options.STREAM_ID_ACTIVE);
    allAccountStreamsIds.push(SystemStreamsSerializer.options.STREAM_ID_UNIQUE);
    allAccountStreamsIds.push(SystemStreamsSerializer.options.STREAM_ID_HELPERS);
    return allAccountStreamsIds;
  }

  /**
   * The same as getAllAccountStreams () but returnes only streams leafs (not parents)
   */
  static getAllAccountStreamsLeafs () {
    const flatStreamsList = treeUtils.flattenTreeWithoutParents(config.get(accountStreamsConfigPath));
    let flatStreamsListObj = {};
    let i;
    for (i = 0; i < flatStreamsList.length; i++) {
      flatStreamsListObj[flatStreamsList[i].id] = flatStreamsList[i];
    }
    return flatStreamsListObj;
  }

/**
 * Get streamIds of fields that should be indexed
 */
  static getIndexedAccountStreamsIdsWithoutDot () {
    let indexedStreamIds = Object.keys(getStreamsNames(config.get(accountStreamsConfigPath), indexedStreams));
    return indexedStreamIds.map(streamId => { return SystemStreamsSerializer.removeDotFromStreamId(streamId) });
  }

/**
 * Get streamIds of fields that should be unique
 */
  static getUniqueAccountStreamsIdsWithoutDot () {
    let uniqueStreamIds = Object.keys(getStreamsNames(config.get(accountStreamsConfigPath), uniqueStreams));
    return uniqueStreamIds.map(streamId => { return SystemStreamsSerializer.removeDotFromStreamId(streamId) });
  }

  /**
   * Get steams that are NOT allowed to edit - this function will be used to 
   * exclude from queries
   */
  static getAccountStreamsIdsForbiddenForEditing () {
    let allStreams = SystemStreamsSerializer.getAllAccountStreams();
    let editableStreams = SystemStreamsSerializer.getEditableAccountStreams();

    const notEditableStreamsIds = _.difference(_.keys(allStreams), _.keys(editableStreams));
    return notEditableStreamsIds;
  }

  /**
   * Get steams that are NOT allowed to view for the user
   * this function will be used to exclude streamIds from queries
   */
  static getAccountStreamsIdsForbiddenForReading () {
    let allStreams = SystemStreamsSerializer.getAllAccountStreams();
    let readableStreams = SystemStreamsSerializer.getReadableAccountStreams();
    const notReadableStreamsIds = _.difference(_.keys(allStreams), _.keys(readableStreams));
    return notReadableStreamsIds;
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
  * Reverse modification that is done for each systemStreamId
  * @param string streamIdWithDot
  */
  static addDotFromStreamId (streamIdWithoutDot: string): string {
    if (! streamIdWithoutDot.startsWith('.')) {
      streamIdWithoutDot = '.' + streamIdWithoutDot;
    }
    return streamIdWithoutDot;
  }
  
  /**
   * Build streams from systemStreams settings
   * parent is formed just providing hte name, id, parentId null and children
   */
  getVirtualStreamsList () {
    let virtualStreams = [];
    let i;
    const streamKeys = Object.keys(this.systemStreamsSettings);

    for (i = 0; i < streamKeys.length; i++){
      virtualStreams.push({
        name: streamKeys[i],
        id: SystemStreamsSerializer.addDotFromStreamId(streamKeys[i]),
        parentId: null,
        children: formSystemStreamsFromSettings(this.systemStreamsSettings[streamKeys[i]], [], SystemStreamsSerializer.addDotFromStreamId(streamKeys[i]))
      });
    }
    return virtualStreams;
  }

  /**
   * Build flattened account stream settings and converted from an array to object
   */
  static getFlatAccountStreamSettings () {
    let accountSettings = {};
    const flatStreamsList = treeUtils.flattenTree(config.get(accountStreamsConfigPath));
    
    // convert list to object
    let i;
    for (i = 0; i < flatStreamsList.length; i++) {
      accountSettings[flatStreamsList[i].id] = flatStreamsList[i];
    }
    return accountSettings;
  }
}

/**
 * Converts systemStreams settings to the actual simple streams objects
 * @param object settings 
 * @param array systemStreams 
 * @param string parentName 
 */
function formSystemStreamsFromSettings (settings, systemStreams, parentName: string): [] {
  let streamIndex;
  
  for (streamIndex = 0; streamIndex < settings.length; streamIndex++) {
    // if stream has children recursivelly call the same function
    if (typeof settings[streamIndex].children !== "undefined") {
      systemStreams.push({
        name: settings[streamIndex].name,
        id: settings[streamIndex].id,
        parentId: parentName,
        children: []
      });
      systemStreams[systemStreams.length - 1].children = formSystemStreamsFromSettings(settings[streamIndex].children, systemStreams[systemStreams.length - 1].children, settings[streamIndex].id)
    }

    // if the stream is not visible, dont add it to the tree
    if (settings[streamIndex].isShown) {
      systemStreams.push({
        name: settings[streamIndex].name ? settings[streamIndex].name : settings[streamIndex].id ,
        id: settings[streamIndex].id,
        parentId: parentName,
        children: []
      });
    }
  };
  return systemStreams;
}

/**
 * Iterate throught the tree and add keys to the flat list streamsNames
 * @param {*} streams - tree structure object
 * @param enum string whatToReturn - enum values should be retrieved with 
 *  getReadableAccountStreams(), getAllAccountStreams (), getEditableAccountStreams;
 * if they are equal to false or true
 */
function getStreamsNames (streams, whatToReturn) {
  let flatStreamsListObj = {};
  
  if (Array.isArray(streams) === false) {
    return flatStreamsListObj;
  }
  const flatStreamsList = treeUtils.flattenTree(streams);

  // convert list to objects
  let i;
  for (i = 0; i < flatStreamsList.length; i++){
    // if the stream value is equal to false, it should be not visible 
    // (except when all account streams should be returned)
    switch (whatToReturn) {
      case readable:
        if (!flatStreamsList[i].isShown) {
          continue;
        }
        break;
      case allAccountStreams:
        break;
      case indexedStreams:
        if (!flatStreamsList[i].isIndexed) {
          continue;
        }
        break;
      case uniqueStreams:
        if (!flatStreamsList[i].isUnique) {
          continue;
        }
        break;
      case editableAccountStreams:
        if (!flatStreamsList[i].isEditable) {
          continue;
        }
        break;
      default:
        if (!flatStreamsList[i].isShown) {
          continue;
        }
        break;
    }
    flatStreamsListObj[flatStreamsList[i].id] = flatStreamsList[i]
  }
  return flatStreamsListObj;
}

SystemStreamsSerializer.options = {
  STREAM_ID_ACTIVE: '.active',
  STREAM_ID_UNIQUE: '.unique',
  STREAM_ID_USERNAME: '.username',
  STREAM_ID_PASSWORDHASH: '.passwordHash',
  STREAM_ID_HELPERS: '.helpers',
}
module.exports = SystemStreamsSerializer;
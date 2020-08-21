/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
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

/**
 * Class that converts system->account events to the
 * Account information that matches the previous 
 * structure of the account info
 */
class SystemStreamsSerializer {
  systemStreamsSettings;
  accountStreamsSettings;

  constructor () {
    this.systemStreamsSettings = config.get('systemStreams');
    if (this.systemStreamsSettings == null) {
      throw Error("Not valid system streams settings.");
    }
    this.accountStreamsSettings = this.systemStreamsSettings.account;
  }

  /**
   * Convert system->account events to the account object
   * @param {*} events 
   */
  serializeEventsToAccountInfo(events){
    let user = {};
    return formEventsTree(this.accountStreamsSettings, events, user);
  }

  /**
   * Get the names of all readable streams that belongs to the system->account stream
   * and could be returned to the user
   */
  getReadableAccountStreams () {
    return getStreamsNames(this.accountStreamsSettings, readable);
  }

  /**
   * Get only those streams that user is allowed to edit 
   */
  getEditableAccountStreams () {
    return getStreamsNames(this.accountStreamsSettings, editableAccountStreams);
  }

  /**
   * Get the names of all streams that belongs to the system->account stream
   * should be used only for internal usage because contains fields that 
   * should not be returned to the user
   */
  getAllAccountStreams () {
    return getStreamsNames(this.accountStreamsSettings, allAccountStreams);
  }

/**
 * Get streamIds of fields that should be indexed
 */
  getIndexedAccountStreams () {
    return getStreamsNames(this.accountStreamsSettings, indexedStreams);
  }

/**
 * Get streamIds of fields that should be unique
 */
  getUniqueAccountStreamsIds () {
    return Object.keys(getStreamsNames(this.accountStreamsSettings, uniqueStreams));
  }

  /**
   * Get steams that are NOT allowed to edit - this function will be used to 
   * exclude from queries
   */
  getAccountStreamsIdsForbiddenForEditing () {
    let allStreams = this.getAllAccountStreams();
    let editableStreams = this.getEditableAccountStreams();

    const notEditableStreamsIds = _.difference(_.keys(allStreams), _.keys(editableStreams));
    return notEditableStreamsIds;
  }

  /**
   * Get steams that are NOT allowed to view for the user
   * this function will be used to exclude streamIds from queries
   */
  getAccountStreamsIdsForbiddenForReading () {
    let allStreams = this.getAllAccountStreams();
    let readableStreams = this.getReadableAccountStreams();

    const notReadableStreamsIds = _.difference(_.keys(allStreams), _.keys(readableStreams));
    return notReadableStreamsIds;
  }

  /**
   * Iterate the tree and change all its properties except the children
   * // TODO IEVA -now only account streams are processed
   */
  getVirtualStreamsList () {
    return {
      name: 'account',
      id: 'account',
      parentId: null,
      children: formSystemStreamsFromSettings(this.systemStreamsSettings.account, [], 'account')
    };
  }

  /**
   * Form flattened account stream settings and converted from an array to object
   */
  getFlatAccountStreamSettings () {
    let accountSettings = {};
    const flatStreamsList = treeUtils.flattenTree(this.accountStreamsSettings);
    
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
function formSystemStreamsFromSettings (settings, systemStreams, parentName: string):array {
  let streamIndex;
  
  for (streamIndex = 0; streamIndex < settings.length; streamIndex++) {
    // if stream has children recursivelly call the same function
    if (typeof settings[streamIndex].children !== "undefined") {
      systemStreams.push({
        name: settings[streamIndex].name ? settings[streamIndex].name : settings[streamIndex].id,
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
 * Takes the list of the streams, events list
 * and object where events will be saved in a tree structure
 * @param object streams
 * @param array events
 * @param object user 
 */
function formEventsTree (streams:object, events: array, user:object):object {
  let streamIndex;
  for (streamIndex = 0; streamIndex < streams.length; streamIndex++) {
    const streamName = streams[streamIndex].id;

    // if stream has children recursivelly call the same function
    if (typeof streams[streamIndex].children !== "undefined") {
      user[streamName] = {};
      user[streamName] = formEventsTree(streams[streamIndex].children, events, user[streamName])
    }

    // get value for the stream element
    let i;
    for (i = 0; i < events.length; i++) {
      if (events[i].streamIds.includes(streamName)) {
        user[streamName] = events[i].content;
        break;
      }
    }
  };
  return user;
}

/**
 * Iterate throught the tree and add keys to the flat list streamsNames
 * @param {*} streams - tree structure object
 * @param enum string whatToReturn - enum values should be retrieved with 
 *  getReadableAccountStreams(), getAllAccountStreams (), getEditableAccountStreams;
 * if they are equal to false or true
 */
function getStreamsNames(streams, whatToReturn) {
  const flatStreamsList = treeUtils.flattenTree(streams);

  // convert list to objects
  let flatStreamsListObj = {};
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
  STREAM_ID_ACTIVE: 'active'
}
module.exports = SystemStreamsSerializer;
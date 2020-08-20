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
class UserInfoSerializer {
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
    let streamsNames = {};
    return getStreamsNames(this.accountStreamsSettings, streamsNames, readable);
  }

  /**
   * Get only those streams that user is allowed to edit 
   */
  getEditableAccountStreams () {
    let streamsNames = {};
    return getStreamsNames(this.accountStreamsSettings, streamsNames, editableAccountStreams);
  }

  /**
   * Get the names of all streams that belongs to the system->account stream
   * should be used only for internal usage because contains fields that 
   * should not be returned to the user
   */
  getAllAccountStreams () {
    let streamsNames = {};
    return getStreamsNames(this.accountStreamsSettings, streamsNames, allAccountStreams);
  }

/**
 * Get streamIds of fields that should be indexed
 */
  getIndexedAccountStreams () {
    let streamsNames = {};
    return getStreamsNames(this.accountStreamsSettings, streamsNames, indexedStreams);
  }

/**
 * Get streamIds of fields that should be unique
 */
  getUniqueAccountStreamsIds () {
    let streamsNames = {};
    return Object.keys(getStreamsNames(this.accountStreamsSettings, streamsNames, uniqueStreams));
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
    let virtualStreams = [];
    const flatStreamsList = treeUtils.flattenTree(this.accountStreamsSettings);
   
    let i;
    for (i = 0; i < flatStreamsList.length; i++) {
      if (flatStreamsList[i].isShown === true ||
        (typeof flatStreamsList[i].isShown === 'undefined' &&
          flatStreamsList[i].parentId === null)) {
        virtualStreams.push({
          name: flatStreamsList[i].name ? flatStreamsList[i].name : flatStreamsList[i].id ,
          id: flatStreamsList[i].id,
          parentId: flatStreamsList[i].parentId ? flatStreamsList[i].parentId: 'account',
          children: flatStreamsList[i].children ? flatStreamsList[i].children: []
        });
      }
    }
    //TODO IEVA - do in more dynamic way
    return {
      name: 'account',
      id: 'account',
      parentId: null,
      children: virtualStreams
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

function formEventsTree (streams, events, user) {
  let streamIndex;
  for (streamIndex = 0; streamIndex < streams.length; streamIndex++) {
    const streamName = streams[streamIndex].id;

    // if stream has children recursivelly call the same function
    if (typeof streams[streamIndex].children !== "undefined") {
      user[streamName] = {};
      user[streamName] = formEventsTree(streams[streamIndex].children, events, user[streamName])
    }

    // if the stream is not visible, dont add it to the tree
    // if (streams[streamIndex].isShown === false){
    //   continue;
    // }

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
 * @param array streamsNames - flat list of keys
 * @param enum string whatToReturn - enum values should be retrieved with 
 *  getReadableAccountStreams(), getAllAccountStreams (), getEditableAccountStreams;
 * if they are equal to false or true
 */
function getStreamsNames(streams, streamsNames, whatToReturn) {
  const flatStreamsList = treeUtils.flattenTree(streams);

  // convert list to objects
  let flatStreamsListObj = {};
  let i;
  for (i = 0; i < flatStreamsList.length; i++){
    // if the stream value is equal to false, it should be not visible 
    // (except when all account streams should be returned)
    switch (whatToReturn) {
      case readable:
        if (flatStreamsList[i].isShown === false) {
          continue;
        }
        break;
      case allAccountStreams:
        break;
      case indexedStreams:
        if (flatStreamsList[i].isIndexed === false) {
          continue;
        }
        break;
      case uniqueStreams:
        if (flatStreamsList[i].isUnique === false) {
          continue;
        }
        break;
      case editableAccountStreams:
        if (flatStreamsList[i].isEditable === false) {
          continue;
        }
        break;
      default:
        if (flatStreamsList[i].isShown === false) {
          continue;
        }
        break;
    }
    flatStreamsListObj[flatStreamsList[i].id] = flatStreamsList[i]
  }
  return flatStreamsListObj;
}

UserInfoSerializer.options = {
  STREAM_ID_ACTIVE: 'active'
}
module.exports = UserInfoSerializer;
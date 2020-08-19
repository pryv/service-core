/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const _ = require('lodash');
const Settings = require('components/api-server/src/settings');

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

  constructor () {
    this.systemStreamsSettings = config.get('systemStreams');
    if (this.systemStreamsSettings == null) {
      throw Error("Not valid system streams settings.");
    }
  }

  /**
   * Convert system->account events to the account object
   * @param {*} events 
   */
  serializeEventsToAccountInfo(events){
    let user = {};
    return formEventsTree(this.systemStreamsSettings.account, events, user);
  }

  /**
   * Get the names of all readable streams that belongs to the system->account stream
   * and could be returned to the user
   */
  getReadableAccountStreams () {
    let streamsNames = {};
    return getStreamsNames(this.systemStreamsSettings.account, streamsNames, readable);
  }

  /**
   * Get only those streams that user is allowed to edit 
   */
  getEditableAccountStreams () {
    let streamsNames = {};
    return getStreamsNames(this.systemStreamsSettings.account, streamsNames, editableAccountStreams);
  }

  /**
   * Get the names of all streams that belongs to the system->account stream
   * should be used only for internal usage because contains fields that 
   * should not be returned to the user
   */
  getAllAccountStreams () {
    let streamsNames = {};
    return getStreamsNames(this.systemStreamsSettings.account, streamsNames, allAccountStreams);
  }

/**
 * Get streamIds of fields that should be indexed
 */
  getIndexedAccountStreams () {
    let streamsNames = {};
    return getStreamsNames(this.systemStreamsSettings.account, streamsNames, indexedStreams);
  }

/**
 * Get streamIds of fields that should be unique
 */
  getUniqueAccountStreamsIds () {
    let streamsNames = {};
    return Object.keys(getStreamsNames(this.systemStreamsSettings.account, streamsNames, uniqueStreams));
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
   * Get virtual streams list
   * //TODO IEVA - improve it
   */

  getVirtualStreamsList () {
    let streamsNames = {};

    const streamsName = getStreamsNames(this.systemStreamsSettings.account, streamsNames, readable);
    const streams = Object.keys(streamsName).map(streamName => {
      return {
        name: streamName,
        id: streamName,
        parentId: 'account',
        children: []
      }
    })

    return {
      name: 'account',
      id: 'account',
      parentId: 'systemStreams',
      children: streams
    };
  }
}
/*
function getVirtualStreams (streams, virtualStreams) {
  let i;
  let stream;
  const streamsKeys = Object.keys(streams);
  for (i = 0; i < streamsKeys.length; i++) {
    stream = streams[streamsKeys[i]];
    // if stream has children recursivelly call the same function
    if (typeof stream.isShown === "undefined") { 
      virtualStreams[streamsKeys[i]] = stream;
      virtualStreams = getVirtualStreams(stream, virtualStreams, whatToReturn);
    }

    if (stream.isShown === false) {
      continue;
    }
  
    virtualStreams.push({
      
      name: streamsKeys[i].name ? streamsKeys[i].name: streamsKeys[i],
      id: streamsKeys[i],
      parentId: 'systemStreams',
      children: streams
    });
  }
}
*/
/**
 * Form events depending on the system streams structure
 * @param {*} stream - streams structure
 * @param {*} events - flat list of the events
 * @param {*} user - object that will be returned after it is updated
 */
function formEventsTree(stream, events, user){
  let streamIndex;
  const streamsNames = Object.keys(stream);
  for (streamIndex = 0; streamIndex < streamsNames.length; streamIndex++) {
    const streamName = streamsNames[streamIndex];

    // if stream has children recursivelly call the same function
    if (typeof stream[streamName].isShown === "undefined") {
      user[streamName] = {};
      user[streamName] = formEventsTree(stream[streamName], events, user[streamName])
    }

    // if the stream value is equal to false, it should be not visible
    /*TODO IEVA   if (stream[streamName].isShown === false){
         continue;
       }*/

    // get value for the stream element
    let i;
    for (i = 0; i < events.length; i++) {
      if (events[i].streamIds.includes(streamName)) {
        // allow to display variable with different name 
        // currently setting is adapted only on dbDocuments case and do not
        // handle edge cases
        if (stream[streamName].displayName) {
          user[stream[streamName].displayName] = events[i].content;
        } else {
          user[streamName] = events[i].content;
        }
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
  let i;
  let stream;
  const streamsKeys = Object.keys(streams);
  for (i = 0; i < streamsKeys.length; i++) {
    stream = streams[streamsKeys[i]];
    // if stream has children recursivelly call the same function
    if (typeof stream.isShown === "undefined") {
      streamsNames[streamsKeys[i]] = stream;
      streamsNames = getStreamsNames(stream, streamsNames, whatToReturn);
      continue;
    }

    // if the stream value is equal to false, it should be not visible 
    // (except when all account streams should be returned)
    switch (whatToReturn) {
      case readable:
        if (stream.isShown === false) {
          continue;
        }
        break;
      case allAccountStreams:
        break;
      case indexedStreams:
        if (stream.isIndexed === false) {
          continue;
        }
        break;
      case uniqueStreams:
        if (stream.isUnique === false) {
          continue;
        }
        break;
      case editableAccountStreams:
        if (stream.isEditable === false) {
          continue;
        }
        break;
      default:
        if (stream.isShown === true) {
          continue;
        }
        break;
    }
    streamsNames[streamsKeys[i]] = stream;
  }
  return streamsNames
}
UserInfoSerializer.options = {
  STREAM_ID_ACTIVE: 'active'
}
module.exports = UserInfoSerializer;
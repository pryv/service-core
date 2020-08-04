/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const Settings = require('components/api-server/src/settings');

const readable = 'readable-core-streams',
  allCoreStreams = 'all-core-streams',
  onlyWritableCoreStreams = 'only-writable-core-streams';
/**
 * Class that converts system->profile events to the
 * Account information that matches the previous 
 * structure of the account info
 */
class UserInfoSerializer {
  systemStreamsSettings;
 
  constructor (systemStreamsSettings) {
    if (typeof systemStreamsSettings === 'undefined') {
      throw new Error('UserInfoSerializer cannot be called directly');
    }
    this.systemStreamsSettings = systemStreamsSettings;
  }

  // set asyncronously system streams settings information
  static async build () {
    // Load settings asynchronously because we have to fetch
    // some values from register via an http-get request.
    const settings = await Settings.load();
    const systemStreamsSettings = settings.get('systemStreams').obj();
    if (!systemStreamsSettings) {
      throw Error("Not valid system streams settings.");
    }
    return new UserInfoSerializer(systemStreamsSettings);
  }

  /**
   * Convert system->profile events to the account object
   * @param {*} events 
   */
  serializeEventsToAccountInfo(events){
    let user = {};
    return formEventsTree(this.systemStreamsSettings.profile, events, user);
  }

  /**
   * Get the names of all readable streams that belongs to the system->profile stream
   * and could be returned to the user
   */
  getReadableCoreStreams () {
    let streamsNames = {};
    return getStreamsNames(this.systemStreamsSettings.profile, streamsNames, readable);
  }

  /**
   * Get the names of the streams that belongs to the system->profile stream
   * but is not readable for the user (only writable) 
   */
  getOnlyWritableCoreStreams () {
    let streamsNames = {};
    return getStreamsNames(this.systemStreamsSettings.profile, streamsNames, onlyWritableCoreStreams);
  }

  /**
   * Get the names of all streams that belongs to the system->profile stream
   * should be used only for internal usage because contains fields that 
   * should not be returned to the user
   */
  getAllCoreStreams () {
    let streamsNames = {};
    return getStreamsNames(this.systemStreamsSettings.profile, streamsNames, allCoreStreams);
  }

  /**
   * Get virtual streams list
   * @param {*} events 
   * TODO IEVA - perhaps delete
   */
  getVirtualStreamsList (whatToReturn) {
    let streamsNames = {};
    const streamsName = getStreamsNames(this.systemStreamsSettings.profile, streamsNames, whatToReturn);
    const streams = Object.keys(streamsName).map(streamName => {
      return {
        name: streamName,
        id: streamName,
        parentId: 'profile',
        children: []
      }
    })

    return streams;
  }
}

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
        // currently setting is adapted only on dbDocs case and do not
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
 *  getReadableCoreStreams(), getAllCoreStreams (), getOnlyWritableCoreStreams;
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
      streamsNames = getStreamsNames(stream, streamsNames, whatToReturn);
      continue;
    }

    // if the stream value is equal to false, it should be not visible 
    // (except when all core streams should be returned)
    switch (whatToReturn) {
      case readable:
        if (stream.isShown === false) {
          continue;
        }
        break;
      case allCoreStreams:
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

module.exports = UserInfoSerializer;
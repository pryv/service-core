const Settings = require('components/api-server/src/settings');

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
 * Form events depending on the system streams structure
 * @param {*} stream - streams structure
 * @param {*} events - flat list of the events
 * @param {*} user - object that will be returned after it is updated
 */
  static formEventsTree(stream, events, user){
    let streamIndex;
    const streamsNames = Object.keys(stream);
    for (streamIndex = 0; streamIndex < streamsNames.length; streamIndex++) {
      const streamName = streamsNames[streamIndex];

      // if stream has children recursivelly call the same function
      if(typeof stream[streamName].isShown === "undefined"){
        user[streamName] = {};
        user[streamName] = UserInfoSerializer.formEventsTree(stream[streamName], events, user[streamName])
      }

      // if the stream value is equal to false, it should be not visible
      if (stream[streamName].isShown === false){
        continue;
      }

      // get value for the stream element
      let i;
      for (i = 0; i < events.length; i++) { 
        if (events[i].streamIds.includes(streamName)) {
          // allow to display variable with different name 
          // currently setting is adapted only on dbDocs case and do not
          // handle edge cases
          if(stream[streamName].displayName){
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
   * Convert system->profile events to the account object
   * @param {*} events 
   */
  serializeEventsToAccountInfo(events){
    let user = {};
    return UserInfoSerializer.formEventsTree(this.systemStreamsSettings.profile, events, user);
  }

  /**
   * Iterate throught the tree and add keys to the flat list streamsNames
   * @param {*} streams - tree structure object
   * @param array streamsNames - flat list of keys
   * @param boolean returnAll - if true - all keys will be returned no matter 
   * if they are equal to false or true
   */
  static getStreamsNames (streams, streamsNames, returnAll: Boolean) {
    let i;
    let stream;
    const streamsKeys = Object.keys(streams);
    for (i = 0; i < streamsKeys.length; i++) {
      stream = streams[streamsKeys[i]];
      // if stream has children recursivelly call the same function
      if (typeof stream.isShown === "undefined") {
        streamsNames = UserInfoSerializer.getStreamsNames(stream, streamsNames, returnAll);
        continue;
      }

      // if the stream value is equal to false, it should be not visible (except when returnAll is true)
      if (!returnAll && stream.isShown === false) {
        continue;
      }
      streamsNames[streamsKeys[i]] = stream;
    }
    return streamsNames
  }

  /**
   * Get the names of all streams that belongs to the system->profile stream
   * @param {*} events 
   */
  getProfileStreamIds(returnAll) {
    let streamsNames = {};
    return UserInfoSerializer.getStreamsNames(this.systemStreamsSettings.profile, streamsNames, returnAll);
  }
}
module.exports = UserInfoSerializer;
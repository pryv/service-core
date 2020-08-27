/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

const _ = require('lodash');

const getConfig: () => Config = require('components/api-server/config/Config').getConfig;
import type { Config } from 'components/api-server/config/Config';
const config: Config = getConfig();
//const SystemStreamsSerializer = require('components/business/src/system-streams/serializer');

class User {
  id: string;
  userId: string; // to remove
  events: Array<{}>;
  account: Object;
  //serializer: ?SystemStreamsSerializer;
  accountStreamsSettings: Array<{}>;
  accountFields: Array<string> = [];

  constructor (userId: string, events: Array<{}> = [] ) {
    //this.serializer = new SystemStreamsSerializer();
    this.events = events;
    this.userId = userId;
    this.accountStreamsSettings = config.get('systemStreams:account');
    formAccountDataFromListOfEvents(this);
  }

  

  getAccount () {
    return _.pick(this, this.accountFields);
  }

  getAccountWithId () {
    return _.pick(this, _.concat(this.accountFields, ['id']));
  }
}

/**
 * Convert system->account events to the account object
 */
function formAccountDataFromListOfEvents (user: User) {
  const account = formEventsTree(user.accountStreamsSettings, user.events, {});
  Object.keys(account).forEach(p => {
    
    user.accountFields.push(p);
    user[p] = account[p];
  });
  user.id = user.userId;
}

/**
 * Takes the list of the streams, events list
 * and object where events will be saved in a tree structure
 * @param object streams
 * @param array events
 * @param object user 
 */
function formEventsTree (streams: object, events: array, user: object): object {
  let streamIndex;
  for (streamIndex = 0; streamIndex < streams.length; streamIndex++) {
    const streamName = streams[streamIndex].id;

    // if stream has children recursivelly call the same function
    if (typeof streams[streamIndex].children !== 'undefined') {
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

module.exports = User;
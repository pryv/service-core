/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

// Gathers all the repositories into one big object for convenience. 

const bluebird = require('bluebird');

import type Database  from './Database';

const Versions = require('./Versions');
const PasswordResetRequests = require('./PasswordResetRequests');
const Sessions = require('./Sessions');
const Accesses = require('./user/Accesses');
const EventFiles = require('./user/EventFiles');
const Events = require('./user/Events');
const FollowedSlices = require('./user/FollowedSlices');
const Profile = require('./user/Profile');
const Streams = require('./user/Streams');
const Webhooks = require('./user/Webhooks');

class StorageLayer {
  connection: Database; 
  
  versions: Versions;
  passwordResetRequests: PasswordResetRequests;
  sessions: Sessions;
  accesses: Accesses;
  eventFiles: EventFiles;
  events: Events;
  followedSlices: FollowedSlices;
  profile: Profile;
  streams: Streams;
  webhooks: Webhooks;
  
  constructor(
    connection: Database, 
    logger, 
    attachmentsDirPath: string,
    previewsDirPath: string,
    passwordResetRequestMaxAge: number,
    sessionMaxAge: number,
  ) {
    this.connection = connection;
    
    this.versions = new Versions(
      connection, 
      attachmentsDirPath, 
      logger);
    this.passwordResetRequests = new PasswordResetRequests(
      connection,
      { maxAge: passwordResetRequestMaxAge });
    this.sessions = new Sessions(
      connection, 
      { maxAge: sessionMaxAge });
    this.accesses = new Accesses(connection);
    this.eventFiles = new EventFiles(
      { 
        attachmentsDirPath: attachmentsDirPath, 
        previewsDirPath: previewsDirPath,
      }, 
      logger);  
    this.events = new Events(connection);
    this.followedSlices = new FollowedSlices(connection);
    this.profile = new Profile(connection);
    this.streams = new Streams(connection);
    this.webhooks = new Webhooks(connection);
  }
  
  async waitForConnection() {
    const database = this.connection;
    
    return bluebird.fromCallback(
      (cb) => database.waitForConnection(cb));
  }
}
module.exports = StorageLayer;
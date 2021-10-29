/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
 var Transform = require('stream').Transform;

 
 /**
  * Sets the FileReadToken for each of the given event's attachments (if any) for the given
  * access.
  *
  * @param params
  *        params.access {Object} Access with which the API call was made
  *        params.filesReadTokenSecret {String} available in authSettings
  * @constructor
  */
 class AddStorePrefixOnEventsStream extends Transform {
   constructor(storeId) {
     super({objectMode: true, highWaterMark: 4000});
     this.storePrefix = ':' + storeId + ':';
   }
   _transform = function (event, encoding, callback) {
     event.id = this.storePrefix + event.id;
     event.streamIds = event.streamIds.map(streamId => this.storePrefix +streamId);
     this.push(event);
     callback();
   };
 }
 
 module.exports = AddStorePrefixOnEventsStream;
 
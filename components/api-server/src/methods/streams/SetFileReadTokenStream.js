/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const Transform = require('stream').Transform;
const inherits = require('util').inherits;
const utils = require('utils');

module.exports = SetFileReadTokenStream;

/**
 * Sets the FileReadToken for each of the given event's attachments (if any) for the given
 * access.
 *
 * @param params
 *        params.access {Object} Access with which the API call was made
 *        params.filesReadTokenSecret {String} available in authSettings
 * @constructor
 */
function SetFileReadTokenStream(params) {
  Transform.call(this, {objectMode: true, highWaterMark: 4000});

  this.access = params.access;
  this.filesReadTokenSecret = params.filesReadTokenSecret;
}

inherits(SetFileReadTokenStream, Transform);

SetFileReadTokenStream.prototype._transform = function (event, encoding, callback) {
  
  // To remove when streamId not necessary
  event.streamId = event.streamIds[0];

  if (! event.attachments) {
    this.push(event);
  } else {
    event.attachments.forEach(function (att) {
      att.readToken = utils.encryption
        .fileReadToken(
          att.id, this.access.id, this.access.token,
          this.filesReadTokenSecret);
    }.bind(this));
    this.push(event);
  }
  callback();
};


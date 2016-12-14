var Transform = require('stream').Transform,
    inherits = require('util').inherits;

/**
 * Returns a stream that does setFileReadToken()
 *
 * @returns {SetFileReadTokenStream}
 */
function SetFileReadTokenStream(params) {
  Transform.call(this, {objectMode: true});

  this.access = params.access;
  this.authSettings = params.authSettings;
  this.utils = params.utils;
}

inherits(SetFileReadTokenStream, Transform);

SetFileReadTokenStream.prototype._transform = function _transform(event, encoding, callback) {
  console.log('SetFileReadTokenStream: got data', event);
  if (! event.attachments) {
    this.push(event);
  } else {
    event.attachments.forEach(function (att) {
      att.readToken = this.utils.encryption.fileReadToken(att.id, this.access,
        this.authSettings.filesReadTokenSecret);
    });
    this.push(event);
  }
  callback();
};

module.exports = SetFileReadTokenStream;
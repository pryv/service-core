var Transform = require('stream').Transform,
    inherits = require('util').inherits,
    utils = require('components/utils');

/**
 * Returns a stream that does setFileReadToken()
 *
 * @returns {SetFileReadTokenStream}
 */
function SetFileReadTokenStream(params) {
  Transform.call(this, {objectMode: true});

  this.access = params.access;
  this.authSettings = params.authSettings;
}

inherits(SetFileReadTokenStream, Transform);

SetFileReadTokenStream.prototype._transform = function (event, encoding, callback) {
  if (! event.attachments) {
    this.push(event);
  } else {
    // TODO replace this
    var that = this;
    event.attachments.forEach(function (att) {
      att.readToken = utils.encryption.fileReadToken(att.id, that.access,
        that.authSettings.filesReadTokenSecret);
    });
    this.push(event);
  }
  callback();
};

module.exports = SetFileReadTokenStream;
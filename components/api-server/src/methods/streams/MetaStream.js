var Transform = require('stream').Transform,
    inherits = require('util').inherits,
    setCommonMeta = require('../helpers/setCommonMeta');

module.exports = MetaStream;

inherits(MetaStream, Transform);

function MetaStream() {
  Transform.call(this, {objectMode: true});
}

MetaStream.prototype._transform = function (event, encoding, callback) {
  console.log('MetaStream: pushing', event);
  this.push(event);
  callback();
};

MetaStream.prototype._flush = function (callback) {
  var end = ',' + JSON.stringify(setCommonMeta({})) + '}';
  console.log('MetaStream: pushing', end);
  this.push(end);
  callback();
};
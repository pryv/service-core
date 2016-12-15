var Transform = require('stream').Transform,
    inherits = require('util').inherits,
    setCommonMeta = require('../helpers/setCommonMeta');

module.exports = MetaStream;

inherits(MetaStream, Transform);

function MetaStream() {
  Transform.call(this, {objectMode: true});
}

MetaStream.prototype._transform = function (event, encoding, callback) {
  console.log(event);
  this.push(event);
  callback();
};

MetaStream.prototype._flush = function (callback) {
  var end = ',"meta": ' + JSON.stringify(setCommonMeta({}).meta) + '}';
  //console.log('MetaStream: pushing', end);
  console.log(end);
  this.push(end);
  callback();
};
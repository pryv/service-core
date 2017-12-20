// @flow

const msgpack = require('msgpack5')();

function encode(msg: Object | string): Buffer {
  return msgpack.encode(msg);
}
function decode(wireMsg: Buffer | string): mixed {
  return msgpack.decode(wireMsg);
}

exports.encode = encode; 
exports.decode = decode; 
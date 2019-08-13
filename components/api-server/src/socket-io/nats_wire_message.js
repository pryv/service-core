// @flow

const msgpack = require('msgpack5')();

function encode(msg: Object | string): Buffer {
  return msgpack.encode(msg);
}
function decode(wireMsg: Buffer | string): string {
  return msgpack.decode(wireMsg);
}

exports.encode = encode; 
exports.decode = decode; 
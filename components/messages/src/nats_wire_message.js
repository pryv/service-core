/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
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
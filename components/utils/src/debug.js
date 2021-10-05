/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */


const util = require("util");

function log() {
  for(let i = 0; i < arguments.length; i++) {
    console.log(util.inspect(arguments[i], {depth: 12, colors: true}));
  }
}

function stack(start = 0, length = 100) {
  const e = new Error();
  return e.stack.split('\n').filter(l => l.indexOf('node_modules') <0 ).slice(start + 1, start + length + 1);
}

function logstack() {
  log(...arguments, stack(3, 2));
}

module.exports = {
  logstack,
  log,
  stack
};

global.$$ = logstack;
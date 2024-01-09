/**
 * @license
 * Copyright (C) 2012–2024 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const ah = require('./hooks');
const { Tags } = require('opentracing');
/**
 * return currentTracer or null if not available
 */
module.exports.getHookedTracer = (name, tags) => {
  const requestContext = ah.getRequestContext();
  // console.log(requestContext);
  return new HookedTracer(requestContext?.data?.tracing, name, tags);
};

class HookedTracer {
  tracing;

  name;

  running;
  constructor (tracing, name, tags) {
    this.tracing = tracing;
    this.name = name;
    this.running = true;
    if (tracing == null) {
      // console.log('Null request Context', name);
    } else {
      // console.log('Start', name);
      this.name = this.tracing.startSpan(this.name, tags);
    }
  }

  /**
   * @param {{} | null} tags
   * @returns {void}
   */
  tag (tags) {
    if (!this.running) { throw new Error('Cannot tag a finished span ' + this.name); }
    if (tags == null) { return; }
    for (const [key, value] of Object.entries(tags)) {
      if (this.tracing != null) {
        this.tracing.tagSpan(this.name, key, value);
      }
    }
  }

  /**
   * @param {FinishCallback} cb
   * @returns {FinishCallback}
   */
  finishOnCallBack (cb) {
    const that = this;
    return function (err, result) {
      if (err != null) {
        const tags = { errorId: err.id };
        tags[Tags.ERROR] = true;
        that.tag(tags);
      }
      that.finish();
      cb(err, result);
    };
  }

  /**
   * @param {{} | null} tags
   * @returns {void}
   */
  finish (tags) {
    if (!this.running) { throw new Error('Cannot finish a finished span ' + this.name); }
    if (this.tracing == null) {
      return;
    }
    this.tag(tags);
    this.running = false;
    this.tracing.finishSpan(this.name);
  }
}

/** @typedef {(err?: Error | null, result?: unknown) => unknown} FinishCallback */

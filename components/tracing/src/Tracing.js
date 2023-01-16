/**
 * @license
 * Copyright (C) 2012–2023 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const { initTracer: initJaegerTracer } = require('jaeger-client');
const { Tags } = require('opentracing');
const ah = require('./hooks');
const TRACING_NAME = 'api-server';
/**
 * Starts jaeger tracer
 * @param {string} serviceName
 * @returns {any}
 */
function initTracer (serviceName) {
  const config = {
    serviceName,
    sampler: {
      // Tracing all spans. See https://www.jaegertracing.io/docs/1.7/sampling/#client-sampling-configuration
      type: 'const',
      param: 1
    }
  };
  return initJaegerTracer(config, {});
}
/**
 * The jaeger tracer singleton
 */
let tracerSingleton;
/**
 * @returns {{}}
 */
function getTracer () {
  if (tracerSingleton != null) { return tracerSingleton; }
  tracerSingleton = initTracer(TRACING_NAME);
  return tracerSingleton;
}
/**
 * Object implementing
 */
class Tracing {
  /**
   * the jaeger tracer
   */
  tracer;
  /**
   * used to track the top span to set the parent in startSpan()
   */
  spansStack;
  /**
   * index of the top stack element. To avoid using length-1
   */
  lastIndex;

  history;
  constructor () {
    this.tracer = getTracer();
    this.spansStack = [];
    this.lastIndex = -1;
    this.history = [];
    // register tracer to Asynchronous Hooks
    ah.createRequestContext({ tracing: this });
  }

  /**
   * Starts a new span with the given name and tags.
   * The span is a child of the latest span if there is one.
   * @param {string} name
   * @param {{} | null} tags
   * @param {string | null} childOf
   * @returns {string}
   */
  startSpan (name, tags, childOf) {
    this.history.push('start ' + name);
    // console.log('started span', name, ', spans present', this.lastIndex+2)
    /// console.log('started span', name, ', spans present', this.lastIndex+2)
    const options = {};
    // check if name already exists .. if yes add a trailer
    let trailer = '';
    while (this.spansStack.findIndex((span) => span._operationName === name + trailer) >= 0) {
      trailer = trailer === '' ? 1 : trailer + 1;
    }
    name = name + trailer;
    if (childOf != null) {
      const index = this.spansStack.findIndex((span) => span._operationName === childOf);
      if (index < 0) { throw new Error(`parent span that does not exists "${childOf}"`); }
      options.childOf = this.spansStack[index];
    } else {
      // take last item as parent
      if (this.lastIndex > -1) {
        const parent = this.spansStack[this.lastIndex];
        options.childOf = parent;
        /// console.log('wid parent', parent._operationName);
      }
    }
    if (tags != null) { options.tags = tags; }
    const newSpan = this.tracer.startSpan(name, options);
    this.spansStack.push(newSpan);
    this.lastIndex++;
    return name;
  }

  /**
   * Tags an existing span. Used mainly for errors, by setError()
   * @param {string | undefined | null} name
   * @param {string} key
   * @param {string} value
   * @returns {void}
   */
  tagSpan (name, key, value) {
    this.history.push('tag ' + name + ':  ' + key + ' > ' + value);
    let span;
    if (name == null) {
      span = this.spansStack[this.lastIndex];
    } else {
      span = this.spansStack.find((span) => span._operationName === name);
    }
    if (span == null) {
      console.log('Cannot find Span : ' + name, this.history);
    } else {
      span.setTag(key, value);
    }
  }

  /**
   * Add log information to span
   * @param {string | null} name
   * @param {object | null} data
   * @returns {void}
   */
  logForSpan (name, data) {
    this.history.push('log ' + name + ': ' + JSON.stringify(data));
    let span;
    if (name == null) {
      span = this.spansStack[this.lastIndex];
    } else {
      span = this.spansStack.find((span) => span._operationName === name);
    }
    if (span == null) {
      console.log('Cannot find Span for Log: ' + name, this.history);
    } else {
      span.log(data);
    }
  }

  /**
   * Finishes the span with the given name. Throws an error if no span with such a name exists.
   * @param {string | null} name
   * @param {string | null} forceName
   * @returns {void}
   */
  finishSpan (name, forceName) {
    this.history.push('finish ' + name);
    let span;
    if (name == null) {
      span = this.spansStack.pop();
    } else {
      const index = this.spansStack.findIndex((span) => span._operationName === name);
      if (index < 0) { throw new Error(`finishing span that does not exists "${name}"`); }
      [span] = this.spansStack.splice(index, 1);
    }
    if (forceName != null) { span._operationName = forceName; }
    span.finish();
    this.lastIndex--;
    /// console.log('finishin span wid name', name, ', spans left:', this.lastIndex+1);
  }

  /**
   * @param {string | undefined | null} name
   * @param {Error} err
   * @returns {void}
   */
  setError (name, err) {
    this.tagSpan(name, Tags.ERROR, true);
    this.tagSpan(name, 'errorId', err.id);
    this.tagSpan(name, Tags.HTTP_STATUS_CODE, err.httpStatus || 500);
  }

  /**
   * @returns {void}
   */
  checkIfFinished () {
    if (this.spansStack.length !== 0) {
      const remaining = this.spansStack.map((x) => x._operationName);
      console.log(' Not done ', this.history, remaining);
    }
  }
}

class DummyTracing {
  /**
   * @returns {void}
   */
  startSpan () { }
  /**
   * @returns {void}
   */
  finishSpan () { }
  /**
   * @returns {void}
   */
  logForSpan () { }
  /**
   * @returns {void}
   */
  setError () { }
}
module.exports.DummyTracing = DummyTracing;
module.exports.Tracing = Tracing;

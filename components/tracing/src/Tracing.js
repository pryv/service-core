/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */


const { initTracer: initJaegerTracer } = require('jaeger-client');


const ah = require('./hooks');


const TRACING_NAME: string = 'api-server';


/**
 * Starts jaeger tracer
 */
 function initTracer(serviceName: string) {
  const config = {
    serviceName: serviceName,
    sampler: { // Tracing all spans. See https://www.jaegertracing.io/docs/1.7/sampling/#client-sampling-configuration
      type: "const",
      param: 1,
    },
  };
  return initJaegerTracer(config, {});
}



/**
 * The jaeger tracer singleton
 */
 let tracerSingleton;
 function getTracer(): {} {
   if (tracerSingleton != null) return tracerSingleton;
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
  tracer: {};
  /**
   * used to track the top span to set the parent in startSpan()
   */
  spansStack: Array<{}>;
  /**
   * index of the top stack element. To avoid using length-1
   */
  lastIndex: number;

  constructor () {
    this.tracer = getTracer();
    this.spansStack = [];
    this.lastIndex = -1;
    // register tracer to Asynchronous Hooks 
    ah.createRequestContext({ tracing: this });
  }

  /**
   * Starts a new span with the given name and tags.
   * The span is a child of the latest span if there is one.
   */
  startSpan(name: string, tags: ?{}): void {
    ///console.log('started span', name, ', spans present', this.lastIndex+2)
    const options = {};
    if (this.lastIndex > -1) { 
      const parent = this.spansStack[this.lastIndex];
      options.childOf = parent; 
      ///console.log('wid parent', parent._operationName);
    }
    if (tags != null) options.tags = tags;
    const newSpan = this.tracer.startSpan(name, options);
    this.spansStack.push(newSpan);
    this.lastIndex++;
  }
  /**
   * Tags an existing span. Used mainly for errors, by setErrorToTracingSpan()
   */
  tagSpan(name: ?string, key: string, value: string): void {
    let span;
    if (name == null) {
      span = this.spansStack[lastIndex];
    } else {
      span = this.spansStack.find(span => span._operationName === name);
    }
    span.setTag(key, value);
  }
  
  /**
   * Finishes the span with the given name. Throws an error if no span with such a name exists.
   */
  finishSpan(name: ?string): void {
    let span;
    if (name == null) {
      span = this.spansStack.pop();
    } else {
      const index = this.spansStack.findIndex(span => span._operationName === name);
      if (index < 0) throw new Error(`finishing span that does not exists "${name}"`);
      [span] = this.spansStack.splice(index, 1);
    }
    span.finish();
    this.lastIndex--;
    ///console.log('finishin span wid name', name, ', spans left:', this.lastIndex+1);
  }
}

class DummyTracing {
  startSpan() {}
  finishSpan() {}
  logSpan() {}
}

module.exports.DummyTracing = DummyTracing;
module.exports.Tracing = Tracing;
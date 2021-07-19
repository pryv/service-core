/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const { initTracer: initJaegerTracer } = require('jaeger-client');
const { Tags, FORMAT_HTTP_HEADERS } = require('opentracing');

let tracerSingleton;
module.exports.getTracer = () => {
  if (tracerSingleton != null) return tracerSingleton;
  tracerSingleton = initTracer('api-server');
  return tracerSingleton;
}

function initTracer(serviceName) {
  const config = {
    serviceName: serviceName,
    sampler: {
      type: "const",
      param: 1,
    },
    reporter: {
      logSpans: true,
    },
  };
  /*const options = {
    logger: {
      info(msg) {
        console.log("INFO ", msg);
      },
      error(msg) {
        console.log("ERROR", msg);
      },
    },
  };*/
  return initJaegerTracer(config, {}); //options);
}

module.exports.Tags = Tags;
module.exports.FORMAT_HTTP_HEADERS = FORMAT_HTTP_HEADERS;
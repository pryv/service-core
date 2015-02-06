/**
 * Dumps basic request info to the log.
 *
 * @param express
 * @param logging
 */
module.exports = function (express, logging) {
  var logger = logging.getLogger('routes');

  // customize output a little

  express.logger.token('url', function (req) {
    return req.url;
  });

  // copied & adapted from Connect source
  var devFormat = function (tokens, req, res) {
    var status = res.statusCode,
        len = parseInt(res.getHeader('Content-Length'), 10),
        color = 32;

    if (status >= 500) { color = 31; }
    else if (status >= 400) { color = 33; }
    else if (status >= 300) { color = 36; }

    len = isNaN(len) ? '' : (' - ' + len + 'b');

    return '\x1b[90m' + req.method +
        ' ' + req.url + ' ' +
        '\x1b[' + color + 'm' + res.statusCode +
        ' \x1b[90m' +
        (new Date() - req._startTime) +
        'ms' + len +
        '\x1b[0m';
  };

  return express.logger({
    format: process.env.NODE_ENV === 'development' ? devFormat: 'tiny',
    stream: {
      write: function (message) {
        logger.info(message);
      }
    }
  });
};
module.exports.injectDependencies = true; // make it DI-friendly

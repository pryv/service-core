
var axon = require('axon');
var config = require('./config');
var settings = config.load();
var utils = require('components/utils');

var errors = require('components/errors'),
    logging = utils.logging(settings.logs),
    logger = logging.getLogger('blockchain');

var Event = require('./event.js');

// singleton to handle the socket
var socket = null;


module.exports = {};

module.exports.connectIfNeeded = function (done) {

  if (socket) { 
    return done();
  }
  socket = axon.socket('req');
  socket.connect(settings.blockchainServer.messages.port, settings.blockchainServer.messages.ip,
    function (err) {
      if (err) {
        return done(err);
      }
      // if positive connectin done is called by socket.on('connect
    }.bind(this)
  );

  socket.on('connect', function () {
    module.exports.event = new Event(socket);
    logger.info('Connected to Blockchain server with AXON on ' +
      settings.blockchainServer.messages.ip + ':' + settings.blockchainServer.messages.port);
    done();
  });

  socket.on('error', function (err) {
    errors.errorHandling.logError(err, null, logger);
  });

};





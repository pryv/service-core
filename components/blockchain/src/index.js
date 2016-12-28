
// start axon client

var axon = require('axon');
var sock = axon.socket('req');

var config = require('./config');
var settings = config.load();
var socket = null;

var Event = require('./event.js');

module.exports = {};


module.exports.connect = function (done) {
  if (! done) {  done = function () {}; }

  if (socket) { 
    return done();
  }
  sock.connect(settings.blockchainServer.messages.port, settings.blockchainServer.messages.ip,
    function (err) {
      socket = sock;

      if (err) {
        // TODO error management
        console.error('Failed to connect to Blockchain server with AXON: ', err);
        return done(err);
      }



      socket.on('connect', function () {
        console.log('Connect event from AXON (blockchain)');
      });

      console.log('Connected to Blockchain server with AXON on ' +
        settings.blockchainServer.messages.ip + ':' + settings.blockchainServer.messages.port);

      module.exports.event = new Event(socket);

      done();

    }.bind(this)
  );

};





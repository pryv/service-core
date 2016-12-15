
// start axon client

var axon = require('axon');
var sock = axon.socket('req');

var config = require('./config');
var settings = config.load();


var socket;

sock.connect(settings.blockchainServer.messages.port, settings.blockchainServer.messages.ip,
  function (err) {
    console.log('Messages connected', err);
    socket = sock;
  });
  sock.on('connect', function () {

});


module.exports = {
  event: require('./event')(socket);
};

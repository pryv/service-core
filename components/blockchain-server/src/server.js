var server = require('service-core-blockchain');
var config = require('./config');

var settings = config.load();

server.setup(settings.blockchainServer);


//server.startHTTP();
server.startAXON();

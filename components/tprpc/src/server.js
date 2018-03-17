// @flow

const protobuf = require('protobufjs');

type Handler = Object;

class Server {
  
  async listen(endpoint: string) {
    endpoint;
  }
  
  add(description: protobuf.rpc.Service, handler: Handler) {
    handler;
  }
  
  async close() {
    
  }
}

module.exports = Server;
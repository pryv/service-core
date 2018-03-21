// @flow

type Handler = Object;

class Server {
  
  async listen(endpoint: string) {
    endpoint;
  }
  
  add(description: mixed, handler: Handler) {
    handler;
  }
  
  async close() {
    
  }
}

module.exports = Server;
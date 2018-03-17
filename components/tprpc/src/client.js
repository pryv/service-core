// @flow

// An rpc client connection; use this as a factory for 'proxy' objects that 
// you can use to make calls on. 
// 
class Client {
  endpoint: string;
  
  constructor(endpoint: string) {
    this.endpoint = endpoint;
  }
  
  proxy<T>(definition: T): T {
    return definition;
  }
}

module.exports = Client;
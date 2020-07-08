/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

const TChannel = require('tchannel');

const Definition = require('./definition');
const { RemoteError } = require('./errors');

// An rpc client connection; use this as a factory for 'proxy' objects that 
// you can use to make calls on. 
// 
class Client {
  channel: TChannel;      // Main channel
  root: Definition; 
  
  constructor(root: Definition) {
    this.channel = new TChannel(); 
    
    this.root = root; 
  }
  
  proxy<T>(serviceName: string, endpoint: string): T {
    const channel = this.channel; 
    const root = this.root; 
    
    const serviceChannel = channel.makeSubChannel({
      peers: [ endpoint ], 
      serviceName: serviceName, 
      requestDefaults: {
        hasNoParent: true, 
        headers: {
          as: 'raw',
          cn: 'tprpc-client'
        }
      }
    });
    
    const service = root.lookup(serviceName);
    const proxy = service.create(
      (...args) => this.onCall(serviceChannel, serviceName, ...args), 
      false,  // delimit query
      false); // delimit response
    
    return proxy;
  }
  
  onCall(
    channel: TChannel, serviceName: string, 
    method: MethodDescriptor, requestData: Buffer, cb: ForwarderCallback) 
  {
    const methodName = method.name; 
    const responseType = method.resolvedResponseType;
    
    channel
      .request({ 
        serviceName: serviceName, 
        timeout: 1000})
      .send(
        methodName, 'arg1', requestData,
        (...args) => this.onResponse(responseType, cb, ...args));
  }
  
  onResponse(
    responseType: Type, cb: ForwarderCallback, 
    err: ?Error, res: any, arg2: Buffer, arg3: Buffer) 
  {
    if (err != null) return cb(err);

    if (arg2.toString() === 'error') 
      return cb(new RemoteError(arg3.toString()));
      
    const answer = responseType.decode(arg3);
    cb(null, answer);
  }
}

type Type = {
  decode: (string | Buffer) => mixed,
}
type MethodDescriptor = {
  name: string, 
  resolvedResponseType: Type, 
}
type ForwarderCallback = (err: ?Error, res: any) => mixed;

module.exports = Client;
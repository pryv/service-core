/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

const bluebird = require('bluebird');
const TChannel = require('tchannel');
const logger = require('boiler').getLogger('tprpc.server');
const lodash = require('lodash');

const Definition = require('./definition');

type Handler = Object;
type PBType = any;
type PBRequest = any;
type PBResponse = any;

class Server {
  channel: TChannel; 
  
  constructor() {
    this.channel = new TChannel();
  }
  
  async listen(endpoint: string): Promise<*> {
    // endpoint is of the form 'ip:port'
    const idx = endpoint.indexOf(':');
    if (idx < 0) throw new Error('Endpoint must be of the form IP:PORT.');
    
    const host = endpoint.slice(0, idx);
    const port = Number(endpoint.slice(idx+1, endpoint.length));
    
    return await bluebird.fromCallback(
      cb => this.channel.listen(port, host, cb));
  }
  
  // Register a handler for a service to the server. The `definition` should
  // contain the description for the service named `name` - which is also used
  // to identify client requests, so use this same `name` when constructing your
  // client. 
  // 
  // `handler` implements the interface exposed to clients. 
  // 
  add(definition: Definition, name: string, handler: Handler) {
    const channel = this.channel; 
    
    const subChannel = channel.makeSubChannel({
      serviceName: name,
    });
    
    definition.forEachMethod(name, (methodName, req, res) => {
      subChannel.register(methodName, 
        (...args) => this.handleRequest(methodName, req, res, handler, ...args));
    });
  }
  
  // Handles an individual request to a method. 
  // 
  async handleRequest(
    methodName: string, reqType: PBType, resType: PBType, 
    handler: Handler, 
    req: PBRequest, res: PBResponse, arg2: Buffer, arg3: Buffer): Promise<void>
  {
    const request = reqType.decode(arg3);
    const impl = handler[lodash.lowerFirst(methodName)];

    res.headers.as = 'raw';
    
    logger.debug('request to ', methodName);
    
    try {
      if (impl == null) 
        throw new Error(`No such method '${methodName}'.`);
      
      const result = await impl.call(handler, request);
      logger.debug('success');
      
      const encodedResult = resType.encode(result).finish();
      
      res.sendOk('result', encodedResult);
    }
    catch (err) {
      logger.debug('errors out', err);
      res.sendNotOk('error', err.toString());
    }
  }
  
  async close() {
    const channel = this.channel; 
    channel.close(); 
  }
}

module.exports = Server;
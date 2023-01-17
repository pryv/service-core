/**
 * @license
 * Copyright (C) 2012–2023 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const bluebird = require('bluebird');
const TChannel = require('tchannel');
const { getLogger } = require('@pryv/boiler');
const lodash = require('lodash');

class Server {
  channel;

  logger;
  constructor () {
    this.channel = new TChannel();
    this.logger = getLogger('tprpc:server');
  }

  /**
   * @param {string} endpoint
   * @returns {Promise<any>}
   */
  async listen (endpoint) {
    // endpoint is of the form 'ip:port'
    const idx = endpoint.indexOf(':');
    if (idx < 0) { throw new Error('Endpoint must be of the form IP:PORT.'); }
    const host = endpoint.slice(0, idx);
    const port = Number(endpoint.slice(idx + 1, endpoint.length));
    return await bluebird.fromCallback((cb) => this.channel.listen(port, host, cb));
  }

  // Register a handler for a service to the server. The `definition` should
  // contain the description for the service named `name` - which is also used
  // to identify client requests, so use this same `name` when constructing your
  // client.
  //
  // `handler` implements the interface exposed to clients.
  //
  /**
   * @param {Definition} definition
   * @param {string} name
   * @param {Handler} handler
   * @returns {void}
   */
  add (definition, name, handler) {
    const channel = this.channel;
    const subChannel = channel.makeSubChannel({
      serviceName: name
    });
    definition.forEachMethod(name, (methodName, req, res) => {
      subChannel.register(methodName, (...args) => this.handleRequest(methodName, req, res, handler, ...args));
    });
  }

  // Handles an individual request to a method.
  //
  /**
   * @param {string} methodName
   * @param {PBType} reqType
   * @param {PBType} resType
   * @param {Handler} handler
   * @param {PBRequest} req
   * @param {PBResponse} res
   * @param {Buffer} arg2
   * @param {Buffer} arg3
   * @returns {Promise<void>}
   */
  async handleRequest (methodName, reqType, resType, handler, req, res, arg2, arg3) {
    const request = reqType.decode(arg3);
    const impl = handler[lodash.lowerFirst(methodName)];
    res.headers.as = 'raw';
    this.logger.debug('request to ', methodName);
    try {
      if (impl == null) { throw new Error(`No such method '${methodName}'.`); }
      const result = await impl.call(handler, request);
      this.logger.debug('success');
      const encodedResult = resType.encode(result).finish();
      res.sendOk('result', encodedResult);
    } catch (err) {
      this.logger.debug('errors out', err);
      res.sendNotOk('error', err.toString());
    }
  }

  /**
   * @returns {Promise<void>}
   */
  async close () {
    const channel = this.channel;
    channel.close();
  }
}
module.exports = Server;

/** @typedef {any} Handler */

/** @typedef {any} PBType */

/** @typedef {any} PBRequest */

/** @typedef {any} PBResponse */

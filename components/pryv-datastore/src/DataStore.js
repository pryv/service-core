/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

// @flow


const UserEvents = require('./UserEvents');
const UserStreams = require('./UserStreams');
const Constants = require('./Constants');

/**
 * Notes:
 * - supports 
 *    - attachments
 *    - series
 * 
 * - series
 */

function toBeImplemented() {
  throw new Error('Should be Implemented');
}

/**
 * @property {UserStreams} streams 
 * @property {UserEvents} events 
 * @property {timestamp} UNKNOWN_DATE - Unkown creation / modification date
 * @property {string} BY_SYSTEM - When createdBy / modifiedBy value is SYSTEM
 * @property {string} BY_UNKOWN - When createdBy / modifiedBy value is UNKOWN
 * @property {string} BY_EXTERNAL_PREFIX - When createdBy / modifiedBy value is an external Reference
 */
class DataStore { 

  static UNKNOWN_DATE: number = Constants.UNKNOWN_DATE;
  static BY_SYSTEM: string = Constants.BY_SYSTEM;
  static BY_UNKOWN: string =  Constants.BY_UNKOWN;
  static BY_EXTERNAL_PREFIX: string = Constants.BY_EXTERNAL_PREFIX;
  static UserEvents = UserEvents;
  static UserStreams = UserStreams;

  _id: string;
  _name: string;
  _streams: UserStreams;
  _events: UserEvents;

  set id(id: string): void { this._id = id; }
  set name(name: string): void { this._name = name; }
  get id(): string { return this._id; }
  get name(): string { return this._name; }
  
  async init(config: {}): Promise<void> { toBeImplemented(); }

  /** @returns  UserStreams */
  get streams(): UserStreams { toBeImplemented(); } 
  /** @returns  UserEvents */
  get events(): UserEvents { toBeImplemented(); } 

  // -- will be overriden by the system to throw appropriate error
  static throwUnkownRessource(resourceType, id, innerError) { // APIError.UnknownResource 
    console.error('unkownRessource', resourceType, id, innerError);
    throw(new Error('unkownRessource ' + resourceType + ' id: '+  id));
  } 

  // -- will be overriden by the system to throw appropriate error
  static throwInvalidRequestStructure(message, data) { // APIError.InvalidRequestStructure 
    console.error('invalidRequestStructure', message, data);
    throw(new Error('invalidRequestStructure ' + message + ' ' + data));
  } 


  /**
   * Uncomment and implement the following if this storage supports it
   * @param {identifier} streamId - the streamId to expand (should be returned in Array list)
   * @returns {Streams<Array>|string|null> returns all children recursively for this stream OR a proprietary string to be interpreted by events.get() in the streamQuery OR null if not expandable
   */
  //async expandStreamForStreamQuery(streamId) { toBeImplemented(); }

  // ----------- Store Settings ------ //


}


module.exports = DataStore;





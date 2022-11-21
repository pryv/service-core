/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

// @flow

const DataMatrix = require('./data_matrix');
const { error, ParseFailure } = require('./errors');

import type InfluxRowType  from '../types/influx_row_type';

type TypeResolveFunction = (eventId: string) => Promise<InfluxRowType>;

// A `BatchRequest` is a collection of batch elements. Each of those in turn 
// will contain a series meta data descriptor and a data matrix to input into
// that series. 
// 
class BatchRequest {
  list: Array<BatchRequestElement>; 
  
  // Parses an object and verifies that its structure corresponds to a series 
  // batch, as described in the documentation ('seriesBatch'). If the input
  // object contains an error, it is thrown as a `ParseFailure`. 
  // 
  static parse(jsonObj: mixed, resolver: TypeResolveFunction): Promise<BatchRequest> {
    const parser = new Parser(resolver);
    
    return parser.parse(jsonObj);
  }
  
  constructor() {
    this.list = []; 
  }
  
  // Append an element to the list of elements in this BatchRequest.
  // 
  append(element: BatchRequestElement) {
    this.list.push(element);
  }
  
  // Returns the amount of batch elements stored here. 
  // 
  length(): number {
    return this.list.length;
  }

  *elements(): Iterator<BatchRequestElement> {
    // No arr.values() in node yet...
    for (const el of this.list) {
      yield el; 
    }
  }
}

// A batch request for a single series event. Contains the `eventId`, the 
// meta data for the series and the actual data points. 
// 
class BatchRequestElement {
  eventId: string;
  data: DataMatrix;
  
  static parse(obj: mixed, resolver: TypeResolveFunction): Promise<BatchRequestElement> {
    const parser = new ElementParser(); 
    return parser.parse(obj, resolver);
  }

  constructor(eventId: string, data: DataMatrix) {
    this.eventId = eventId;
    this.data = data; 
  }
}

const SERIES_BATCH = 'seriesBatch';

// Parses the envelope of a seriesBatch request. Individual entries in the
// `data` array are then parsed by `ElementParser`.
// 
class Parser {
  resolver: TypeResolveFunction;
    
  constructor(resolver: TypeResolveFunction) {
    this.resolver = resolver;
  }
  
  parse(jsonObj: mixed): Promise<BatchRequest> {
    if (jsonObj == null || typeof jsonObj !== 'object') 
      throw error('Request body needs to be in JSON format.');
    
    return this.parseSeriesBatch(jsonObj);
  }
  async parseSeriesBatch(obj: Object): Promise<BatchRequest> {
    const resolver = this.resolver;
    const out = new BatchRequest(); 
    
    if (obj.format !== SERIES_BATCH) 
      throw error('Envelope "format" must be "seriesBatch"');
    
    if (! Array.isArray(obj.data))
      throw error('Envelope must have a data list, containing individual batch elements');
    
    for (const elObj of obj.data) {
      out.append(
        await BatchRequestElement.parse(elObj, resolver));
    }
    
    return out; 
  }
}

class ElementParser {
  async parse(obj: mixed, resolver: TypeResolveFunction): Promise<BatchRequestElement> {
    if (obj == null || typeof obj !== 'object')
      throw error('Batch element must be an object with properties.');
      
    const eventId = obj.eventId;
    if (typeof eventId !== 'string')
      throw error('Batch element must contain an eventId of the series event.');
      
    const type = await resolver(eventId);
    return new BatchRequestElement(
      eventId,
      DataMatrix.parse(obj.data, type),
    );
  }
}

module.exports = { BatchRequest, BatchRequestElement, ParseFailure };
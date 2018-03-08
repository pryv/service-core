
// @flow

const DataMatrix = require('./data_matrix');
const { error, ParseFailure } = require('./errors');

import type InfluxRowType from '../types/influx_row_type';

type TypeResolveFunction = (eventId: string) => InfluxRowType;

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
  static parse(jsonObj: mixed, resolver: TypeResolveFunction): BatchRequest {
    const req = new BatchRequest(); 
    const parser = new Parser(req, resolver);
    
    parser.parse(jsonObj);
    
    return req;
  }
  
  constructor() {
    this.list = []; 
  }
  
  append(element: BatchRequestElement) {
    this.list.push(element);
  }
  
  length(): number {
    return this.list.length;
  }
}

// A batch request for a single series event. Contains the `eventId`, the 
// meta data for the series and the actual data points. 
// 
class BatchRequestElement {
  eventId: string;
  data: DataMatrix;
  
  static parse(obj: mixed, resolver: TypeResolveFunction): BatchRequestElement {
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
  out: BatchRequest;
  resolver: TypeResolveFunction;
    
  constructor(out: BatchRequest, resolver: TypeResolveFunction) {
    this.out = out; 
    this.resolver = resolver;
  }
  
  parse(jsonObj: mixed) {
    if (jsonObj == null || typeof jsonObj !== 'object') 
      throw error('Request body needs to be in JSON format.');
    
    this.parseSeriesBatch(jsonObj);
  }
  parseSeriesBatch(obj: Object) {
    const resolver = this.resolver;
    const out = this.out; 
    
    if (obj.format !== SERIES_BATCH) 
      throw error('Envelope "format" must be "seriesBatch"');
    
    if (! Array.isArray(obj.data))
      throw error('Envelope must have a data list, containing individual batch elements');
    
    for (const elObj of obj.data) {
      out.append(
        BatchRequestElement.parse(elObj, resolver));
    }
  }
}

class ElementParser {
  parse(obj: mixed, resolver: TypeResolveFunction): BatchRequestElement {
    if (obj == null || typeof obj !== 'object')
      throw error('Batch element must be an object with properties.');
      
    const eventId = obj.eventId;
    if (typeof eventId !== 'string')
      throw error('Batch element must contain an eventId of the series event.');
      
    const type = resolver(eventId);
    return new BatchRequestElement(
      eventId,
      DataMatrix.parse(obj.data, type),
    );
  }
}

module.exports = { BatchRequest, BatchRequestElement, ParseFailure };
/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// 

// TypeRepository is the repository for all Pryv event types. It allows access
// to coercion and validation. 


const fs = require('fs');
const lodash = require('lodash');
const superagent = require('superagent');
const bluebird = require('bluebird');
const ZSchemaValidator = require('z-schema');

let defaultTypes = require('./types/event-types.default.json');

const errors = require('./types/errors');
const InfluxRowType = require('./types/influx_row_type');
const BasicType = require('./types/basic_type');
const ComplexType = require('./types/complex_type');

const SERIES_PREFIX = 'series:';

// Returns true if the name given refers to a series type. Currently this means
// that the name starts with SERIES_PREFIX. 
// 
function isSeriesType(name) {
  return name.startsWith(SERIES_PREFIX);
}

// A validator that can check values against a types JSON Schema. 
// 
class TypeValidator {

  // Validates the given event type against its schema. 
  // 
  validate(type, content) {
    return type.callValidator(this, content);
  }

  validateWithSchema(
    content,
    schema
  ) {
    return bluebird.try(() => {
      const validator = new ZSchemaValidator();

      return bluebird
        .fromCallback(
          (cb) => validator.validate(content, schema, cb))
        .then(() => content);
    });
  }
}

// A repository of types that Pryv knows about. Currently, this is seeded from 
// 'types/event-types.default.json' in this component. Also, once the server 
// is running, a list is downloaded from the internet (pryv.com) that will
// extend the built in types. 
// 
// There are several different kind of types: 
// 
//  * 'leaf' types, which form the types you would use in vanilla events, such 
//    as 'mass/kg' or 'picture/attached'. 
//  * 'series' types, which describe a sequence of individual data points, each 
//    data point being of the same leaf type. 
// 
// Leaf types are further divided into 'complex' types and 'basic' types.
// Complex types are objects with attributes, each attribute being itself either
// of a complex or a basic type. E.g. 'message/email'. 
// 
// Basic types are 'number', 'string' and others. These are the types of a
// single element of data. 
// 
// Synopsis: 
// 
//    const repo = new TypeRepository(); 
//    await repo.tryUpdate(someUrl);
//    
//    const type = repo.lookup('mass/kg');
//    const seriesType = repo.lookup('series:mass/kg');
// 
class TypeRepository {

  _validator;

  constructor() {
    this._validator = new ZSchemaValidator();
  }

  /**
   * Simple version of validate - to be used
   * 
   * In api-server, use only:
   * - isSeriesType()
   * - isKnown()
   * - validate()
   * 
   * The old path: lookup(), then validator() are too heavy
   */
  async validate(event) {
    const content = event.hasOwnProperty('content') ? event.content : null;
    const schema = defaultTypes.types[event.type];
    if (schema == null) throw new Error(`Event type validation was used on the unknown type "${event.type}".`);
    return bluebird
      .fromCallback(
        (cb) => this._validator.validate(content, schema, cb))
      .then(() => content);
  }

  // Returns true if the type given by `name` is known by Pryv. To be known, 
  // it needs to be part of our standard types list that we load on startup
  // (#tryUpdate). 
  // 
  isKnown(name) {
    if (isSeriesType(name)) {
      const leafTypeName = name.slice(SERIES_PREFIX.length);
      return this.isKnown(leafTypeName);
    }

    return defaultTypes.types.hasOwnProperty(name);
  }

  // Lookup a leaf type by name. A leaf type is either simple ('mass/kg') or 
  // complex ('position/wgs84'). Leaf types are listed in 
  // `event-types.default.json`. 
  // 
  lookupLeafType(name) {
    if (!this.isKnown(name)) throw new errors.TypeDoesNotExistError(
      `Type '${name}' does not exist in this Pryv instance.`);

    const typeSchema = defaultTypes.types[name];

    if (typeSchema.type === 'object') {
      return new ComplexType(name, typeSchema);
    }

    return new BasicType(name, typeSchema);
  }

  // Lookup a Pryv Event Type by name. To check if a type exists, use
  // `#isKnown`. Pryv types are either leaf types ('mass/kg', 'position/wgs84')
  // or series types ('series:LEAFTYPE'). 
  // 
  // @throw {TypeDoesNotExistError} when name doesn't refer to a built in type.
  // 
  lookup(name) {
    if (isSeriesType(name)) {
      const leafTypeName = name.slice(SERIES_PREFIX.length);
      const leafType = this.lookupLeafType(leafTypeName);

      return new InfluxRowType(leafType);
    }

    // assert: Not a series type, must be a leaf type. 
    return this.lookupLeafType(name);
  }

  // Produces a validator instance. 
  //
  validator() {
    return new TypeValidator();
  }

  // Tries to update the stored type definitions with a file found on the 
  // internet. 
  // 
  async tryUpdate(sourceURL, apiVersion) {
    function unavailableError(err) {
      throw new Error(
        'Could not update event types from ' + sourceURL +
        '\nError: ' + err.message);
    }
    function invalidError(err) {
      throw new Error(
        'Invalid event types schema returned from ' + sourceURL +
        '\nErrors: ' + err.errors);
    }
    const FILE_PROTOCOL = 'file://';
    function isFileUrl(url) { return url.startsWith(FILE_PROTOCOL); }
    function removeFileProtocol(url) { return url.substring(FILE_PROTOCOL.length); }

    let eventTypesDefinition;

    try {
      if (isFileUrl(sourceURL)) { // used for tests
        const filePath = removeFileProtocol(sourceURL);
        eventTypesDefinition = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      } else {
        const USER_AGENT_PREFIX = 'Pryv.io/';
        const res = await superagent
          .get(sourceURL)
          .set('User-Agent', USER_AGENT_PREFIX + apiVersion);
        eventTypesDefinition = res.body;
      }
    } catch (err) {
      unavailableError(err);
    }
    
    const validator = this._validator;
    await bluebird.try(() => {
      if (!validator.validateSchema(eventTypesDefinition))
        return invalidError(validator.lastReport);
      // Overwrite defaultTypes with the merged list of type schemata. 
      defaultTypes = lodash.merge(defaultTypes, eventTypesDefinition);
    });

  }
}

module.exports = {
  TypeRepository: TypeRepository,
  InfluxRowType: InfluxRowType,
  isSeriesType: isSeriesType,
  errors: errors,
};



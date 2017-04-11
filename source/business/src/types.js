// @flow

const defaultTypes = require('./types/event-types.default.json');

import type {EventType} from './types/interfaces';

const bluebird = require('bluebird');
const ZSchemaValidator = require('z-schema');

const errors = require('./types/errors');
const InfluxRowType = require('./types/influx_row_type');
const BasicType = require('./types/basic_type');
const ComplexType = require('./types/complex_type');

const SERIES_PREFIX = 'series:';

// Returns true if the name given refers to a series type. Currently this means
// that the name starts with SERIES_PREFIX. 
// 
function isSeriesType(name: string): boolean {
  return name.startsWith(SERIES_PREFIX);
}

// A validator that can check values against a types JSON Schema. 
// 
class TypeValidator {
  
  // Validates the given event type against its schema. 
  // 
  validate(type: EventType, content: Object | string | number | boolean): Promise<void> {
    return type.callValidator(this, content);
  }
  
  validateWithSchema(
    content: Object | string | number | boolean, 
    schema: any
  ): Promise<void> 
  {
    return bluebird.try(() => {
      const validator = new ZSchemaValidator(); 
      
      return bluebird.fromCallback(
        (cb) => validator.validate(content, schema, cb));
    }); 
  }
}

// A repository of types that Pryv knows about. Currently, this is seeded from 
// 'types/event-types.default.json' in this component. Also, once the server 
// is running, a list is downloaded from the internet (pryv.com) that will
// extend the built in types. 
// 
class TypeRepository {
  isKnown(name: string): boolean {
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
  lookupLeafType(name: string): EventType {
    if (! this.isKnown(name)) throw new errors.TypeDoesNotExistError(
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
  lookup(name: string) {
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
  validator(): TypeValidator {
    return new TypeValidator(); 
  }
}

module.exports = {
  TypeRepository: TypeRepository, 
  InfluxRowType: InfluxRowType, // TODO remove eventually 
  isSeriesType: isSeriesType,
  errors: errors, 
};


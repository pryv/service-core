// @flow

const defaultTypes = require('./types/event-types.default.json');

import type {EventType} from './types/interfaces';

const errors = require('./types/errors');
const InfluxRowType = require('./types/influx_row_type');
const BasicType = require('./types/basic_type');
const ComplexType = require('./types/complex_type');

// A repository of types that Pryv knows about. Currently, this is seeded from 
// 'types/event-types.default.json' in this component. Also, once the server 
// is running, a list is downloaded from the internet (pryv.com) that will
// extend the built in types. 
// 
class TypeRepository {
  isKnown(name: string): boolean {
    return defaultTypes.types.hasOwnProperty(name);
  }
  
  // Lookup a Pryv Event Type by name. 
  // 
  // To check if a type exists, use `#isKnown`.
  // 
  // @throw {TypeDoesNotExistError} when name doesn't refer to a built in type.
  // 
  lookup(name: string): EventType {
    if (! this.isKnown(name)) throw new errors.TypeDoesNotExistError(
      `Type '${name}' does not exist in this Pryv instance.`);

    const typeSchema = defaultTypes.types[name];

    if (typeSchema.type === 'object') {
      return new ComplexType(typeSchema);
    }
    
    return new BasicType(typeSchema.type);
  }
}

module.exports = {
  TypeRepository: TypeRepository, 
  InfluxRowType: InfluxRowType, 
  errors: errors, 
};


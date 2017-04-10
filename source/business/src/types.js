// @flow

const R = require('ramda');
const assert = require('assert');

const defaultTypes = require('./types/event-types.default.json');

/** Error thrown when the coercion of a value into a type fails. 
 */
class InputTypeError extends Error { }

/** Error thrown when you try to `TypeRepository#lookup` a type that doesn't
 * exist in Pryv. 
 */
class TypeDoesNotExistError extends Error { } 

// Event type: One of two, simple or complex. If it is simple, then the only 
// 'property' that needs to be given is called 'value'. If not simple, then 
// some fields are required and some optional. Call `forField` with a valid
// field name to get a property type. 
// 
interface EventType {
  // Returns a type to use for coercion of field named `name`.
  // 
  forField(name: string): PropertyType; 
  
  // Returns a list of required fields in no particular order (a Set).
  // 
  requiredFields(): Array<string>; 
  
  // Returns a list of optional fields in no particular order. 
  // 
  optionalFields(): Array<string>; 
}

// All Pryv Event Types must implement this interface.
// 
interface PropertyType {
  // Coerces the value given into this type. If the input value cannot be
  // coerced, an error will be thrown. 
  // 
  // @throws {InputTypeError} Type after coercion must be valid for this column.
  //
  coerce(value: any): any; 
}

// A basic type like 'number' or 'boolean'. In high frequency data, this must 
// be stored using the column name 'value'.
// 
class BasicType implements EventType, PropertyType {
  typeName: string; 
  
  constructor(typeName: string) {
    assert.ok(typeName === 'number'); // TODO implement other variants
    
    this.typeName = typeName;
  }
  
  requiredFields() {
    return ['value'];
  }
  optionalFields() {
    return [];
  }
  
  forField(name: string): PropertyType {
    // NOTE BasicType only represents types that are not composed of multiple 
    // fields. So the name MUST be 'value' here. 
    assert.ok(name === 'value');
    
    return this;
  }
  
  coerce(value: any): any {
    switch (R.type(value)) {
      case 'String': 
        return this.coerceString(value);
      case 'Number':
        return value; 
    }
    
    throw new InputTypeError(`Unknown outer type (${R.type(value)}).`);
  }
  
  coerceString(str: string) {
    const reNumber = /^\d+(\.\d+)?$/;
    if (! reNumber.test(str)) {
      throw new InputTypeError(`Doesn't look like a valid number: '${str}'.`); 
    }
    
    return Number.parseFloat(str);
  }
}

// A complex type like 'position/wgs84' that has several subfields. 
// 
class ComplexType implements EventType {
  requiredFields() {
    return []; 
  }
  optionalFields() {
    return []; 
  }
  
  forField(name) {
    // TODO
    return new BasicType('number'); 
  }
}

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
    if (! this.isKnown(name)) throw new TypeDoesNotExistError(
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
  errors: {
    InputTypeError: InputTypeError,
    TypeDoesNotExistError: TypeDoesNotExistError,
  }
};


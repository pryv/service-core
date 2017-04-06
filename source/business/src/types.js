// @flow

const R = require('ramda');
const assert = require('assert');

/** Error thrown when the coercion of a value into a type fails. 
 */
class InputTypeError extends Error {
}

interface Type {
  forField(name: string): Type; 
  
  /** 
   * @throws {InputTypeError} Type after coercion must be valid for this column.
   */
  coerce(value: any): any; 
}

/** A basic type like 'number' or 'boolean'. In high frequency data, this must 
 * be stored using the column name 'value'.
 */
class BasicType {
  typeName: string; 
  
  constructor(typeName: string) {
    this.typeName = typeName;
  }
  
  forField(name: string): Type {
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

function lookupTypeFromName(name: string): Type {
  if (name === 'mass/kg') {
    return new BasicType('number');
  }
  
  throw new Error('Please: Implement composed types.');
}

module.exports = {
  lookup: lookupTypeFromName, 
  errors: {
    InputTypeError: InputTypeError,
  }
};


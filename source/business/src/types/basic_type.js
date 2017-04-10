// @flow

import type {EventType, PropertyType} from './interfaces';

const assert = require('assert');
const R = require('ramda');

const errors = require('./errors');

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
    
    throw new errors.InputTypeError(`Unknown outer type (${R.type(value)}).`);
  }
  
  coerceString(str: string) {
    const reNumber = /^\d+(\.\d+)?$/;
    if (! reNumber.test(str)) {
      throw new errors.InputTypeError(`Doesn't look like a valid number: '${str}'.`); 
    }
    
    return Number.parseFloat(str);
  }
}

module.exports = BasicType;

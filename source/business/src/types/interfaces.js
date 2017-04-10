// @flow

// Event type: One of two, simple or complex. If it is simple, then the only 
// 'property' that needs to be given is called 'value'. If not simple, then 
// some fields are required and some optional. Call `forField` with a valid
// field name to get a property type. 
// 
export interface EventType {
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
export interface PropertyType {
  // Coerces the value given into this type. If the input value cannot be
  // coerced, an error will be thrown. 
  // 
  // @throws {InputTypeError} Type after coercion must be valid for this column.
  //
  coerce(value: any): any; 
}


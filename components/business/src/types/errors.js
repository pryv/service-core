/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// 

/** Error thrown when the coercion of a value into a type fails. 
 */
class InputTypeError extends Error { }
module.exports.InputTypeError = InputTypeError; 

/** Error thrown when you try to `TypeRepository#lookup` a type that doesn't
 * exist in Pryv. 
 */
class TypeDoesNotExistError extends Error { } 
module.exports.TypeDoesNotExistError = TypeDoesNotExistError; 
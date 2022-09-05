import { assert, details as X } from '@agoric/assert';
import { assertIsRatio } from '@agoric/zoe/src/contractSupport/ratio.js';

/**
 *
 * @param boundries
 * @param {Brand} centralBrand
 * @param {Brand} secondaryBrand
 */
export const assertBoundryShape = (boundries, centralBrand, secondaryBrand) => {
  const { upper, lower } = boundries;

  assert(upper, X`Upper property should exist in a boundry configuration`);
  assert(lower, X`Upper property should exist in a boundry configuration`);

  // upper and lower boundry should be a ratio
  assertIsRatio(upper);
  assertIsRatio(lower);

  assert(upper.numerator.brand === secondaryBrand, X`Numerator of the upper ratio should be of the brand: ${secondaryBrand}`);
  assert(upper.denominator.brand === centralBrand, X`Denominator of the upper ratio should be of the brand: ${centralBrand}`);

  assert(lower.numerator.brand === secondaryBrand, X`Numerator of the lower ratio should be of the brand: ${secondaryBrand}`);
  assert(lower.denominator.brand === centralBrand, X`Denominator of the lower ratio should be of the brand: ${centralBrand}`);
};
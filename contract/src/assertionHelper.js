import { assert, details as X } from '@agoric/assert';
import { assertIsRatio } from '@agoric/zoe/src/contractSupport/ratio.js';
import { makeTracer } from '@agoric/run-protocol/src/makeTracer.js';

const tracer = makeTracer('assertionHelper');

/**
 *
 * @param boundaries
 * @param {Brand} centralBrand
 * @param {Brand} secondaryBrand
 */
export const assertBoundryShape = (boundaries, centralBrand, secondaryBrand) => {
  const { upper, lower } = boundaries;

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

/**
 *
 * @param {XYKAMMPublicFacet} ammPublicFacet
 * @param {PriceAuthority} devPriceAuthority
 */
export const assertExecutionMode = (ammPublicFacet, devPriceAuthority) => {
  const checkExecutionModeValid = () => {
    return (ammPublicFacet && !devPriceAuthority) || (!ammPublicFacet && devPriceAuthority);
  };
  tracer('assertExecutionMode', { ammPublicFacet, devPriceAuthority });
  assert(checkExecutionModeValid(),
    X`You can either run this contract with a ammPublicFacet for prod mode or with a priceAuthority for dev mode`);
};
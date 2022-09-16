import { assert, details as X } from '@agoric/assert';
import { assertIsRatio } from '@agoric/zoe/src/contractSupport/ratio.js';
import { E } from '@endo/far';
import { makeTracer } from '@agoric/inter-protocol/src/makeTracer.js';
import { UPDATE_BOUNDARY_STATUS } from './constants.js';

const tracer = makeTracer('assertionHelper');

/**
 *
 * @param boundaries
 * @param {Brand} centralBrand
 * @param {Brand} secondaryBrand
 */
export const assertBoundaryShape = (boundaries, centralBrand, secondaryBrand) => {
  const { upper, lower } = boundaries;

  assert(upper, X`Upper property should exist in a boundary configuration`);
  assert(lower, X`Upper property should exist in a boundary configuration`);

  // upper and lower boundary should be a ratio
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

export const assertAllocationStatePhase = (phaseSnapshot, phase) => {
  assert(phaseSnapshot === phase, X`AllocationState phase should be: ${phase}`);
};

export const assertUpdateConfigOfferArgs = offerArgs => {
  tracer('updateBoudnaryConfiguration', offerArgs);
  assert(typeof offerArgs == 'object', '[NO_OFFER_ARGS]');
  assert(offerArgs.hasOwnProperty('boundaries'), X`OfferArgs should include an object named 'boundaries'`);
};

/**
 *
 * @param {{code: number, message: string}} updateReulst
 */
export const assertUpdateSucceeded = updateReulst => {
  assert(updateReulst.code === UPDATE_BOUNDARY_STATUS.SUCCESS, X`${updateReulst.message}`);
};
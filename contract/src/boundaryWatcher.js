import { E } from '@endo/far';
import { makePromiseKit } from '@endo/promise-kit';
import {
  BOUNDARY_WATCHER_STATUS,
  UPDATED_BOUNDARY_MESSAGE,
} from './constants.js';
import { makeTracer } from '@agoric/run-protocol/src/makeTracer.js';
import { assertBoundaryShape } from './assertionHelper.js';

const trace = makeTracer('Boundary Watcher Module');

/**
 *
 * @param {PriceAuthority} fromCentralPriceAuthority
 * @param boundaries
 * @param {Brand} centralBrand
 * @param {Brand} secondaryBrand
 */
export const makeBoundaryWatcher = ({
  fromCentralPriceAuthority,
  boundaries,
  centralBrand,
  secondaryBrand,
}) => {
  assertBoundaryShape(boundaries, centralBrand, secondaryBrand);

  const boundaryPromiseKit = makePromiseKit();
  const { upper, lower } = boundaries;

  // Get mutable quotes
  /** @type MutableQuote */
  const upperBoundaryMutableQuote = E(
    fromCentralPriceAuthority,
  ).mutableQuoteWhenGT(upper.denominator, upper.numerator);
  /** @type MutableQuote */
  const lowerBoundaryMutableQuote = E(
    fromCentralPriceAuthority,
  ).mutableQuoteWhenLT(lower.denominator, lower.numerator);

  // Get promises from mutable quotes
  const upperBoundaryMutableQuotePromise = E(
    upperBoundaryMutableQuote,
  ).getPromise();
  const lowerBoundaryMutableQuotePromise = E(
    lowerBoundaryMutableQuote,
  ).getPromise();

  const watchBoundaries = async () => {
    const quote = await Promise.race([
      upperBoundaryMutableQuotePromise,
      lowerBoundaryMutableQuotePromise,
    ]);
    boundaryPromiseKit.resolve({
      code: BOUNDARY_WATCHER_STATUS.SUCCESS,
      quote,
    });
  };

  watchBoundaries().catch((error) =>
    boundaryPromiseKit.resolve({ code: BOUNDARY_WATCHER_STATUS.FAIL, error }),
  );

  const updateBoundaries = async (newBoundaries) => {
    assertBoundaryShape(newBoundaries, centralBrand, secondaryBrand);
    const { upper, lower } = newBoundaries;
    trace('Updating Boundaries', newBoundaries);

    await Promise.all([
      E(upperBoundaryMutableQuote).updateLevel(
        upper.denominator,
        upper.numerator,
      ),
      E(lowerBoundaryMutableQuote).updateLevel(
        lower.denominator,
        lower.numerator,
      ),
    ]);

    return UPDATED_BOUNDARY_MESSAGE;
  };

  return harden({
    boundaryWatcherPromise: boundaryPromiseKit.promise,
    updateBoundaries,
  });
};

import { E } from '@endo/far';
import { makePromiseKit } from '@endo/promise-kit';
import { BOUNDARY_WATCHER_STATUS } from './constants.js';
import { makeTracer } from '@agoric/inter-protocol/src/makeTracer.js';
import { assertBoundaryShape } from './assertionHelper.js';

const trace = makeTracer('Boundary Watcher Module');

/**
 * This the main module contains logic for being notified when the price
 * hits either of the boundaries.
 *
 * This modules achieves the described behaviour by making use of built agoric
 * feature like priceAuthoritiy and promiseKit. We create two mutable quotes
 * for both upper and lower boundaries. Then wait for one of them to resolve.
 * We are also able to update the triggerPoints for either of the mutableQuotes,
 * as the name suggests 'mutable'. We create a promiseKit then return its promise
 * to the caller of this module so that they know price hit one of the boundaries
 * when the promise we return to them resolves.
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

    const updateBoundaryPromiseKit = makePromiseKit();

    const callUpdateOnMutableQuoteObjects = async () => {
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

      updateBoundaryPromiseKit.resolve({
        code: BOUNDARY_WATCHER_STATUS.SUCCESS,
        message: 'Both mutable quotes are updates successfuly',
      });
    };

    callUpdateOnMutableQuoteObjects().catch((error) =>
      updateBoundaryPromiseKit.resolve({
        code: BOUNDARY_WATCHER_STATUS.FAIL,
        message: `[ERROR] Following error occured when updating the quotes: ${error}`,
      }),
    );

    return updateBoundaryPromiseKit.promise;
  };

  return harden({
    boundaryWatcherPromise: boundaryPromiseKit.promise,
    updateBoundaries,
  });
};

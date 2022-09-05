import { E } from '@endo/far';
import { makePromiseKit } from '@endo/promise-kit';
import { BOUNDRY_WATCHER_STATUS, UPDATED_BOUNDRY_MESSAGE } from './constants.js';
import { makeTracer } from '@agoric/run-protocol/src/makeTracer.js';
import { assertBoundryShape } from './assertionHelper.js';

const trace = makeTracer('Boundry Watcher Module');

/**
 *
 * @param {PriceAuthority} fromCentralPriceAuthority
 * @param boundries
 * @param {Brand} centralBrand
 * @param {Brand} secondaryBrand
 */
export const makeBoundryWatcher = ({
                                     fromCentralPriceAuthority,
                                     boundries,
                                     centralBrand,
                                     secondaryBrand,
                                   }) => {

  assertBoundryShape(boundries, centralBrand, secondaryBrand);

  const boundryPromiseKit = makePromiseKit();
  const { upper, lower } = boundries;

  // Get mutable quotes
  /** @type MutableQuote */
  const upperBoundryMutableQuote = E(fromCentralPriceAuthority).mutableQuoteWhenGT(upper.denominator, upper.numerator);
  /** @type MutableQuote */
  const lowerBoundryMutableQuote = E(fromCentralPriceAuthority).mutableQuoteWhenLT(lower.denominator, lower.numerator);

  // Get promises from mutable quotes
  const upperBoundryMutableQuotePromise = E(upperBoundryMutableQuote).getPromise();
  const lowerBoundryMutableQuotePromise = E(lowerBoundryMutableQuote).getPromise();

  const watchBoundries = async () => {
    const quote = await Promise.race([ upperBoundryMutableQuotePromise, lowerBoundryMutableQuotePromise ]);
    boundryPromiseKit.resolve({ code: BOUNDRY_WATCHER_STATUS.SUCCESS, quote });
  };

  watchBoundries().catch(error => boundryPromiseKit.resolve({ code: BOUNDRY_WATCHER_STATUS.FAIL, error }));

  const updateBoundries = async newBoundries => {
    assertBoundryShape(newBoundries, centralBrand, secondaryBrand);
    const { upper, lower } = newBoundries;
    trace('Updating Boundries', newBoundries);

    await Promise.all([
      E(upperBoundryMutableQuote).updateLevel(upper.denominator, upper.numerator),
      E(lowerBoundryMutableQuote).updateLevel(lower.denominator, lower.numerator)
    ]);

    return UPDATED_BOUNDRY_MESSAGE;
  };

  return harden({
    boundryWatcherPromise: boundryPromiseKit.promise,
    updateBoundries,
  });
}
// @ts-check
import '@agoric/zoe/tools/prepare-test-env.js';
import test from 'ava';
import { E } from '@endo/far';
import { getAmountIn, getAmountOut } from '@agoric/zoe/src/contractSupport/priceQuote.js';
import { AmountMath } from '@agoric/ertp';
import { makeManualPriceAuthority } from '@agoric/zoe/tools/manualPriceAuthority.js';
import { getBoundaries, makeAssets } from './helper.js';
import buildManualTimer from '@agoric/zoe/tools/manualTimer.js';
import { makeRatio, makeRatioFromAmounts } from '@agoric/zoe/src/contractSupport/ratio.js';
import { makeBoundaryWatcher } from '../src/boundaryWatcher.js';
import { eventLoopIteration } from '@agoric/zoe/tools/eventLoopIteration.js';
import { BOUNDARY_WATCHER_STATUS, UPDATE_BOUNDARY_STATUS, UPDATED_BOUNDARY_MESSAGE } from '../src/constants.js';
import { makeTracer } from '@agoric/inter-protocol/src/makeTracer.js';

const trace = makeTracer('Boundary Watcher Test');

test.before(async t => {
  t.context = {
    timer: buildManualTimer(console.log),
    assets: makeAssets(),
  };
});

test('price-goes-above-upper', async t => {

  const {
    timer,
    assets: {
      centralR: { brand: centralBrand, displayInfo: { decimalPlaces: centralDecimalPlaces } },
      secondaryR: { brand: secondaryBrand, displayInfo: { decimalPlaces: secondaryDecimalPlaces } },
    },
  } = t.context;

  t.plan(2);

  const centralAmountOneUnit = AmountMath.make(centralBrand, 10n ** BigInt(centralDecimalPlaces));

  /** @type PriceAuthority */
  const fromCentralPriceAuthority = makeManualPriceAuthority({
    actualBrandIn: centralBrand,
    actualBrandOut: secondaryBrand,
    initialPrice: makeRatio(2n * 10n ** BigInt(secondaryDecimalPlaces), secondaryBrand, 10n ** BigInt(centralDecimalPlaces), centralBrand),
    timer,
  });

  const boundaries = await getBoundaries(fromCentralPriceAuthority, centralAmountOneUnit, secondaryBrand);
  trace(boundaries);

  const { boundaryWatcherPromise } = makeBoundaryWatcher({ fromCentralPriceAuthority, boundaries, centralBrand, secondaryBrand });

  boundaryWatcherPromise.then(({ code, quote }) => {
    t.is(code, BOUNDARY_WATCHER_STATUS.SUCCESS);
    t.deepEqual(getAmountOut(quote), newSecondaryPrice.numerator);

    trace('boundaryWatcherPromise', {
      code,
      amountIn: getAmountIn(quote),
      amountout: getAmountOut(quote),
    });
  });

  const { upper } = boundaries;

  await E(fromCentralPriceAuthority).setPrice(makeRatioFromAmounts(
    AmountMath.make(secondaryBrand, upper.numerator.value - 5n),
    centralAmountOneUnit,
  ));

  await E(fromCentralPriceAuthority).setPrice(makeRatioFromAmounts(
    AmountMath.make(secondaryBrand, upper.numerator.value - 4n),
    centralAmountOneUnit,
  ));

  const newSecondaryPrice = makeRatioFromAmounts(
    AmountMath.make(secondaryBrand, upper.numerator.value + 10n),
    centralAmountOneUnit,
  );

  E(fromCentralPriceAuthority).setPrice(newSecondaryPrice);
  await eventLoopIteration();

});

test('price-goes-below-lower', async t => {

  const {
    timer,
    assets: {
      centralR: { brand: centralBrand, displayInfo: { decimalPlaces: centralDecimalPlaces } },
      secondaryR: { brand: secondaryBrand, displayInfo: { decimalPlaces: secondaryDecimalPlaces } },
    },
  } = t.context;

  t.plan(2);

  const centralAmountOneUnit = AmountMath.make(centralBrand, 10n ** BigInt(centralDecimalPlaces));

  /** @type PriceAuthority */
  const fromCentralPriceAuthority = makeManualPriceAuthority({
    actualBrandIn: centralBrand,
    actualBrandOut: secondaryBrand,
    initialPrice: makeRatio(2n * 10n ** BigInt(secondaryDecimalPlaces), secondaryBrand, 10n ** BigInt(centralDecimalPlaces), centralBrand),
    timer,
  });

  const boundaries = await getBoundaries(fromCentralPriceAuthority, centralAmountOneUnit, secondaryBrand);
  trace(boundaries);

  const { boundaryWatcherPromise } = makeBoundaryWatcher({ fromCentralPriceAuthority, boundaries, centralBrand, secondaryBrand });

  boundaryWatcherPromise.then(({ code, quote }) => {
    t.is(code, BOUNDARY_WATCHER_STATUS.SUCCESS);
    t.deepEqual(getAmountOut(quote), lastSecondaryPrice.numerator);

    trace('boundaryWatcherPromise', {
      code,
      amountIn: getAmountIn(quote),
      amountout: getAmountOut(quote),
    });
  });

  const { lower } = boundaries;

  await E(fromCentralPriceAuthority).setPrice(makeRatioFromAmounts(
    AmountMath.make(secondaryBrand, lower.numerator.value + 2n),
    centralAmountOneUnit,
  ));

  await E(fromCentralPriceAuthority).setPrice(makeRatioFromAmounts(
    AmountMath.make(secondaryBrand, lower.numerator.value + 1n),
    centralAmountOneUnit,
  ));

  const lastSecondaryPrice = makeRatioFromAmounts(
    AmountMath.make(secondaryBrand, lower.numerator.value - 1n),
    centralAmountOneUnit,
  );

  await E(fromCentralPriceAuthority).setPrice(lastSecondaryPrice);
  await eventLoopIteration();

});


test('update-upper-boundary-then-price-goes-above-upper', async t => {

  const {
    timer,
    assets: {
      centralR: { brand: centralBrand, displayInfo: { decimalPlaces: centralDecimalPlaces } },
      secondaryR: { brand: secondaryBrand, displayInfo: { decimalPlaces: secondaryDecimalPlaces } },
    },
  } = t.context;

  t.plan(4);

  const centralAmountOneUnit = AmountMath.make(centralBrand, 10n ** BigInt(centralDecimalPlaces));

  /** @type PriceAuthority */
  const fromCentralPriceAuthority = makeManualPriceAuthority({
    actualBrandIn: centralBrand,
    actualBrandOut: secondaryBrand,
    initialPrice: makeRatio(2n * 10n ** BigInt(secondaryDecimalPlaces), secondaryBrand, 10n ** BigInt(centralDecimalPlaces), centralBrand),
    timer,
  });
  const boundaries = await getBoundaries(fromCentralPriceAuthority, centralAmountOneUnit, secondaryBrand);
  trace(boundaries);

  const { boundaryWatcherPromise, updateBoundaries } = makeBoundaryWatcher({ fromCentralPriceAuthority, boundaries, centralBrand, secondaryBrand });

  boundaryWatcherPromise.then(({ code, quote }) => {
    t.is(code, BOUNDARY_WATCHER_STATUS.SUCCESS);
    t.deepEqual(getAmountOut(quote), lastSecondaryPrice.numerator);

    trace('boundaryWatcherPromise', {
      code,
      amountIn: getAmountIn(quote),
      amountout: getAmountOut(quote),
    });
  });

  const { upper, lower } = boundaries;

  await E(fromCentralPriceAuthority).setPrice(
    makeRatioFromAmounts(
      AmountMath.make(secondaryBrand, upper.numerator.value - 2n),
      centralAmountOneUnit,
    ));

  await E(fromCentralPriceAuthority).setPrice(
    makeRatioFromAmounts(
      AmountMath.make(secondaryBrand, upper.numerator.value - 1n),
      centralAmountOneUnit,
    ));

  // Build new upper boundary
  const upperBoundaryIncreaseByValue = 10000n;
  const newBoundaryConf = {
    upper: makeRatioFromAmounts(
      AmountMath.make(secondaryBrand, upper.numerator.value + upperBoundaryIncreaseByValue),
      centralAmountOneUnit),
    lower,
  };

  /** @type {{code: number, message: string}} */
  const updateResult = await updateBoundaries(newBoundaryConf);
  t.is(updateResult.code, UPDATE_BOUNDARY_STATUS.SUCCESS);
  t.is(updateResult.message, 'Both mutable quotes are updates successfuly');

  // Set the price just above the old upper boundary
  await E(fromCentralPriceAuthority).setPrice(
    makeRatioFromAmounts(
      AmountMath.make(secondaryBrand, upper.numerator.value + 10n),
      centralAmountOneUnit,
    ));

  // Set the price just above the new upper boundary
  const lastSecondaryPrice = makeRatioFromAmounts(
    AmountMath.make(secondaryBrand, newBoundaryConf.upper.numerator.value + 10n),
    centralAmountOneUnit,
  );

  await E(fromCentralPriceAuthority).setPrice(lastSecondaryPrice);

  await eventLoopIteration();

});

test('update-lower-boundary-then-price-goes-below-lower', async t => {

  const {
    timer,
    assets: {
      centralR: { brand: centralBrand, displayInfo: { decimalPlaces: centralDecimalPlaces } },
      secondaryR: { brand: secondaryBrand, displayInfo: { decimalPlaces: secondaryDecimalPlaces } },
    },
  } = t.context;

  t.plan(4);

  const centralAmountOneUnit = AmountMath.make(centralBrand, 10n ** BigInt(centralDecimalPlaces));

  /** @type PriceAuthority */
  const fromCentralPriceAuthority = makeManualPriceAuthority({
    actualBrandIn: centralBrand,
    actualBrandOut: secondaryBrand,
    initialPrice: makeRatio(2n * 10n ** BigInt(secondaryDecimalPlaces), secondaryBrand, 10n ** BigInt(centralDecimalPlaces), centralBrand),
    timer,
  });

  const boundaries = await getBoundaries(fromCentralPriceAuthority, centralAmountOneUnit, secondaryBrand);
  trace(boundaries);

  const { boundaryWatcherPromise, updateBoundaries } = makeBoundaryWatcher({ fromCentralPriceAuthority, boundaries, centralBrand, secondaryBrand });

  boundaryWatcherPromise.then(({ code, quote }) => {
    t.is(code, BOUNDARY_WATCHER_STATUS.SUCCESS);
    t.deepEqual(getAmountOut(quote), lastSecondaryPrice.numerator);

    trace('boundaryWatcherPromise', {
      code,
      amountIn: getAmountIn(quote),
      amountout: getAmountOut(quote),
    });
  });

  const { upper, lower } = boundaries;

  await E(fromCentralPriceAuthority).setPrice(
    makeRatioFromAmounts(
      AmountMath.make(secondaryBrand, lower.numerator.value + 2n),
      centralAmountOneUnit,
    ));

  await E(fromCentralPriceAuthority).setPrice(
    makeRatioFromAmounts(
      AmountMath.make(secondaryBrand, lower.numerator.value + 1n),
      centralAmountOneUnit,
    ));

  // Build new upper boundary
  const upperBoundaryIncreaseByValue = 10000n;
  const newBoundaryConf = {
    upper,
    lower: makeRatioFromAmounts(
      AmountMath.make(secondaryBrand, lower.numerator.value - upperBoundaryIncreaseByValue),
      centralAmountOneUnit),
  };

  /** @type {{code: number, message: string}} */
  const updateResult = await updateBoundaries(newBoundaryConf);
  t.is(updateResult.code, UPDATE_BOUNDARY_STATUS.SUCCESS);
  t.is(updateResult.message, 'Both mutable quotes are updates successfuly');

  // Set the price just below the old lower boundary
  await E(fromCentralPriceAuthority).setPrice(
    makeRatioFromAmounts(
      AmountMath.make(secondaryBrand, lower.numerator.value - 10n),
      centralAmountOneUnit,
    ));

  // Set the price just below the new lower boundary
  const lastSecondaryPrice = makeRatioFromAmounts(
    AmountMath.make(secondaryBrand, newBoundaryConf.lower.numerator.value - 10n),
    centralAmountOneUnit,
  );

  await E(fromCentralPriceAuthority).setPrice(lastSecondaryPrice);

  await eventLoopIteration();

});

test('update-both-boundaries-then-price-goes-above-upper', async t => {

  const {
    timer,
    assets: {
      centralR: { brand: centralBrand, displayInfo: { decimalPlaces: centralDecimalPlaces } },
      secondaryR: { brand: secondaryBrand, displayInfo: { decimalPlaces: secondaryDecimalPlaces } },
    },
  } = t.context;

  t.plan(4);

  const centralAmountOneUnit = AmountMath.make(centralBrand, 10n ** BigInt(centralDecimalPlaces));

  /** @type PriceAuthority */
  const fromCentralPriceAuthority = makeManualPriceAuthority({
    actualBrandIn: centralBrand,
    actualBrandOut: secondaryBrand,
    initialPrice: makeRatio(2n * 10n ** BigInt(secondaryDecimalPlaces), secondaryBrand, 10n ** BigInt(centralDecimalPlaces), centralBrand),
    timer,
  });
  const boundaries = await getBoundaries(fromCentralPriceAuthority, centralAmountOneUnit, secondaryBrand);
  trace(boundaries);

  const { boundaryWatcherPromise, updateBoundaries } = makeBoundaryWatcher({ fromCentralPriceAuthority, boundaries, centralBrand, secondaryBrand });

  boundaryWatcherPromise.then(({ code, quote }) => {
    t.is(code, BOUNDARY_WATCHER_STATUS.SUCCESS);
    t.deepEqual(getAmountOut(quote), lastSecondaryPrice.numerator);

    trace('boundaryWatcherPromise', {
      code,
      amountIn: getAmountIn(quote),
      amountout: getAmountOut(quote),
    });
  });

  const { upper, lower } = boundaries;

  await E(fromCentralPriceAuthority).setPrice(
    makeRatioFromAmounts(
      AmountMath.make(secondaryBrand, upper.numerator.value - 2n),
      centralAmountOneUnit,
    ));

  await E(fromCentralPriceAuthority).setPrice(
    makeRatioFromAmounts(
      AmountMath.make(secondaryBrand, upper.numerator.value - 1n),
      centralAmountOneUnit,
    ));

  // Build new upper boundary
  const upperBoundaryIncreaseByValue = 10000n;
  const newBoundaryConf = {
    upper: makeRatioFromAmounts(
      AmountMath.make(secondaryBrand, upper.numerator.value + upperBoundaryIncreaseByValue),
      centralAmountOneUnit),
    lower: makeRatioFromAmounts(
      AmountMath.make(secondaryBrand, lower.numerator.value - upperBoundaryIncreaseByValue),
      centralAmountOneUnit),
  };

  /** @type {{code: number, message: string}} */
  const updateResult = await updateBoundaries(newBoundaryConf);
  t.is(updateResult.code, UPDATE_BOUNDARY_STATUS.SUCCESS);
  t.is(updateResult.message, 'Both mutable quotes are updates successfuly');

  // Set the price just above the old upper boundary
  await E(fromCentralPriceAuthority).setPrice(
    makeRatioFromAmounts(
      AmountMath.make(secondaryBrand, upper.numerator.value + 10n),
      centralAmountOneUnit,
    ));

  // Set the price just above the new upper boundary
  const lastSecondaryPrice = makeRatioFromAmounts(
    AmountMath.make(secondaryBrand, newBoundaryConf.upper.numerator.value + 10n),
    centralAmountOneUnit,
  );

  await E(fromCentralPriceAuthority).setPrice(lastSecondaryPrice);

  await eventLoopIteration();

});

test('mutableQuote-promises-rejected', async t => {

  const {
    timer,
    assets: {
      centralR: { brand: centralBrand, displayInfo: { decimalPlaces: centralDecimalPlaces } },
      secondaryR: { brand: secondaryBrand, displayInfo: { decimalPlaces: secondaryDecimalPlaces } },
    },
  } = t.context;

  t.plan(2);

  const centralAmountOneUnit = AmountMath.make(centralBrand, 10n ** BigInt(centralDecimalPlaces));

  /** @type PriceAuthority */
  const fromCentralPriceAuthority = makeManualPriceAuthority({
    actualBrandIn: centralBrand,
    actualBrandOut: secondaryBrand,
    initialPrice: makeRatio(2n * 10n ** BigInt(secondaryDecimalPlaces), secondaryBrand, 10n ** BigInt(centralDecimalPlaces), centralBrand),
    timer,
  });
  const boundaries = await getBoundaries(fromCentralPriceAuthority, centralAmountOneUnit, secondaryBrand);
  trace(boundaries);

  const { boundaryWatcherPromise } = makeBoundaryWatcher({
    fromCentralPriceAuthority,
    boundaries,
    centralBrand,
    secondaryBrand,
  });

  boundaryWatcherPromise.then(({ code, error }) => {
    t.is(code, BOUNDARY_WATCHER_STATUS.FAIL);
    t.truthy(error instanceof Error);

    trace('boundaryWatcherPromise', {
      code,
      error,
    });
  });

  await E(fromCentralPriceAuthority).setPrice(undefined);
  await eventLoopIteration();

});


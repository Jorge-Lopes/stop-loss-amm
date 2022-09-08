// @ts-check
import { test } from '@agoric/zoe/tools/prepare-test-env-ava.js';
import { E } from '@endo/far';
import { getAmountIn, getAmountOut } from '@agoric/zoe/src/contractSupport/priceQuote.js';
import { AmountMath, makeIssuerKit, AssetKind } from '@agoric/ertp';
import { makeManualPriceAuthority } from '@agoric/zoe/tools/manualPriceAuthority.js';
import { getBoundaries, makeAssets } from './helper.js';
import buildManualTimer from '@agoric/zoe/tools/manualTimer.js';
import { makeRatio, makeRatioFromAmounts } from '@agoric/zoe/src/contractSupport/ratio.js';
import { makeBoundryWatcher } from '../src/boundryWatcher.js';
import { waitForPromisesToSettle } from '@agoric/run-protocol/test/supports.js';
import { BOUNDRY_WATCHER_STATUS, UPDATED_BOUNDRY_MESSAGE } from '../src/constants.js';
import { makeTracer } from '@agoric/run-protocol/src/makeTracer.js';

const trace = makeTracer('Boundry Watcher Test');

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

  const { boundryWatcherPromise } = makeBoundryWatcher({ fromCentralPriceAuthority, boundaries, centralBrand, secondaryBrand });

  boundryWatcherPromise.then(({ code, quote }) => {
    t.is(code, BOUNDRY_WATCHER_STATUS.SUCCESS);
    t.deepEqual(getAmountOut(quote), newSecondaryPrice.numerator);

    trace('boundryWatcherPromise', {
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
  await waitForPromisesToSettle();

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

  const { boundryWatcherPromise } = makeBoundryWatcher({ fromCentralPriceAuthority, boundaries, centralBrand, secondaryBrand });

  boundryWatcherPromise.then(({ code, quote }) => {
    t.is(code, BOUNDRY_WATCHER_STATUS.SUCCESS);
    t.deepEqual(getAmountOut(quote), lastSecondaryPrice.numerator);

    trace('boundryWatcherPromise', {
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
  await waitForPromisesToSettle();

});


test('update-upper-boundry-then-price-goes-above-upper', async t => {

  const {
    timer,
    assets: {
      centralR: { brand: centralBrand, displayInfo: { decimalPlaces: centralDecimalPlaces } },
      secondaryR: { brand: secondaryBrand, displayInfo: { decimalPlaces: secondaryDecimalPlaces } },
    },
  } = t.context;

  t.plan(3);

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

  const { boundryWatcherPromise, updateBoundaries } = makeBoundryWatcher({ fromCentralPriceAuthority, boundaries, centralBrand, secondaryBrand });

  boundryWatcherPromise.then(({ code, quote }) => {
    t.is(code, BOUNDRY_WATCHER_STATUS.SUCCESS);
    t.deepEqual(getAmountOut(quote), lastSecondaryPrice.numerator);

    trace('boundryWatcherPromise', {
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

  // Build new upper boundry
  const upperBoundryIncreaseByValue = 10000n;
  const newBoundryConf = {
    upper: makeRatioFromAmounts(
      AmountMath.make(secondaryBrand, upper.numerator.value + upperBoundryIncreaseByValue),
      centralAmountOneUnit),
    lower,
  };

  const updateResultMessage = await updateBoundaries(newBoundryConf);
  t.is(updateResultMessage, UPDATED_BOUNDRY_MESSAGE);

  // Set the price just above the old upper boundry
  await E(fromCentralPriceAuthority).setPrice(
    makeRatioFromAmounts(
      AmountMath.make(secondaryBrand, upper.numerator.value + 10n),
      centralAmountOneUnit,
    ));

  // Set the price just above the new upper boundry
  const lastSecondaryPrice = makeRatioFromAmounts(
    AmountMath.make(secondaryBrand, newBoundryConf.upper.numerator.value + 10n),
    centralAmountOneUnit,
  );

  await E(fromCentralPriceAuthority).setPrice(lastSecondaryPrice);

  await waitForPromisesToSettle();

});

test('update-lower-boundry-then-price-goes-below-lower', async t => {

  const {
    timer,
    assets: {
      centralR: { brand: centralBrand, displayInfo: { decimalPlaces: centralDecimalPlaces } },
      secondaryR: { brand: secondaryBrand, displayInfo: { decimalPlaces: secondaryDecimalPlaces } },
    },
  } = t.context;

  t.plan(3);

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

  const { boundryWatcherPromise, updateBoundaries } = makeBoundryWatcher({ fromCentralPriceAuthority, boundaries, centralBrand, secondaryBrand });

  boundryWatcherPromise.then(({ code, quote }) => {
    t.is(code, BOUNDRY_WATCHER_STATUS.SUCCESS);
    t.deepEqual(getAmountOut(quote), lastSecondaryPrice.numerator);

    trace('boundryWatcherPromise', {
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

  // Build new upper boundry
  const upperBoundryIncreaseByValue = 10000n;
  const newBoundryConf = {
    upper,
    lower: makeRatioFromAmounts(
      AmountMath.make(secondaryBrand, lower.numerator.value - upperBoundryIncreaseByValue),
      centralAmountOneUnit),
  };

  const updateResultMessage = await updateBoundaries(newBoundryConf);
  t.is(updateResultMessage, UPDATED_BOUNDRY_MESSAGE);

  // Set the price just below the old lower boundry
  await E(fromCentralPriceAuthority).setPrice(
    makeRatioFromAmounts(
      AmountMath.make(secondaryBrand, lower.numerator.value - 10n),
      centralAmountOneUnit,
    ));

  // Set the price just below the new lower boundry
  const lastSecondaryPrice = makeRatioFromAmounts(
    AmountMath.make(secondaryBrand, newBoundryConf.lower.numerator.value - 10n),
    centralAmountOneUnit,
  );

  await E(fromCentralPriceAuthority).setPrice(lastSecondaryPrice);

  await waitForPromisesToSettle();

});

test('update-both-boundaries-then-price-goes-above-upper', async t => {

  const {
    timer,
    assets: {
      centralR: { brand: centralBrand, displayInfo: { decimalPlaces: centralDecimalPlaces } },
      secondaryR: { brand: secondaryBrand, displayInfo: { decimalPlaces: secondaryDecimalPlaces } },
    },
  } = t.context;

  t.plan(3);

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

  const { boundryWatcherPromise, updateBoundaries } = makeBoundryWatcher({ fromCentralPriceAuthority, boundaries, centralBrand, secondaryBrand });

  boundryWatcherPromise.then(({ code, quote }) => {
    t.is(code, BOUNDRY_WATCHER_STATUS.SUCCESS);
    t.deepEqual(getAmountOut(quote), lastSecondaryPrice.numerator);

    trace('boundryWatcherPromise', {
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

  // Build new upper boundry
  const upperBoundryIncreaseByValue = 10000n;
  const newBoundryConf = {
    upper: makeRatioFromAmounts(
      AmountMath.make(secondaryBrand, upper.numerator.value + upperBoundryIncreaseByValue),
      centralAmountOneUnit),
    lower: makeRatioFromAmounts(
      AmountMath.make(secondaryBrand, lower.numerator.value - upperBoundryIncreaseByValue),
      centralAmountOneUnit),
  };

  const updateResultMessage = await updateBoundaries(newBoundryConf);
  t.is(updateResultMessage, UPDATED_BOUNDRY_MESSAGE);

  // Set the price just above the old upper boundry
  await E(fromCentralPriceAuthority).setPrice(
    makeRatioFromAmounts(
      AmountMath.make(secondaryBrand, upper.numerator.value + 10n),
      centralAmountOneUnit,
    ));

  // Set the price just above the new upper boundry
  const lastSecondaryPrice = makeRatioFromAmounts(
    AmountMath.make(secondaryBrand, newBoundryConf.upper.numerator.value + 10n),
    centralAmountOneUnit,
  );

  await E(fromCentralPriceAuthority).setPrice(lastSecondaryPrice);

  await waitForPromisesToSettle();

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

  const { boundryWatcherPromise } = makeBoundryWatcher({
    fromCentralPriceAuthority,
    boundaries,
    centralBrand,
    secondaryBrand,
  });

  boundryWatcherPromise.then(({ code, error }) => {
    t.is(code, BOUNDRY_WATCHER_STATUS.FAIL);
    t.truthy(error instanceof Error);

    trace('boundryWatcherPromise', {
      code,
      error,
    });
  });

  await E(fromCentralPriceAuthority).setPrice(undefined);
  await waitForPromisesToSettle();

});

/**
 * Test Case
 * Update the one of the boundaries in a way that the updated boundry falls outside of the allowed price window
 * according to the current price. So the boundryWatcher promise should resolve as soon as this update is made.
 * In real life this would lead to a trigger of an LP removal from AMM. Should we allow it?
 */

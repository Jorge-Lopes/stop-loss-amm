// @ts-check

import { test } from '@agoric/zoe/tools/prepare-test-env-ava.js';
import { unsafeMakeBundleCache } from '@agoric/run-protocol/test/bundleTool.js';
import { makeTracer } from '@agoric/run-protocol/src/makeTracer.js';
import {
  addLiquidityToPool,
  startAmmPool,
  startServices,
  startStopLoss,
  swapSecondaryForCentral,
  swapCentralForSecondary, getBoundries, moveFromCentralPriceUp, moveFromCentralPriceDown,
} from './helper.js';
import { E } from '@endo/far';
import { makeRatioFromAmounts } from '@agoric/zoe/src/contractSupport/ratio.js';
import { waitForPromisesToSettle } from '@agoric/run-protocol/test/supports.js';
import { AmountMath } from '@agoric/ertp';
import { ALLOCATION_PHASE, UPDATED_BOUNDRY_MESSAGE } from '../src/constants.js';
import { makeManualPriceAuthority } from '@agoric/zoe/tools/manualPriceAuthority.js';
import buildManualTimer from '@agoric/zoe/tools/manualTimer.js';

const trace = makeTracer('Test-StopLoss');

test.before(async (t) => {
  const bundleCache = await unsafeMakeBundleCache('./bundles/');

  const makeAmountBuilderInUnit = (brand, displayInfo) => {

    const { decimalPlaces } = displayInfo;

    /**
     * @param {BigInt} value
     * @returns {Amount<K>}
     */
    const makeAmount = value => {
      return AmountMath.make(brand, value * 10n ** BigInt(decimalPlaces));
    };

    return { makeAmount };
  };

  t.context = { bundleCache, makeAmountBuilderInUnit };
});

test('Test lock LP Tokens to contract', async (t) => {
  const { /** @type ZoeService */ zoe,
    /** @type XYKAMMPublicFacet */ amm,
    /** @type IssuerKit */ centralR,
    /** @type IssuerKit */ secondaryR,
  } = await startServices(t);
  const centralInitialValue = 10n;
  const secondaryInitialValue = 20n;

  /** @type XYKAMMPublicFacet */
  const ammPublicFacet = amm.ammPublicFacet;

  const { makeAmountBuilderInUnit } = t.context;

  const { makeAmount: centralInUnit } = makeAmountBuilderInUnit(centralR.brand, centralR.displayInfo);
  const { makeAmount: secondaryInUnit } = makeAmountBuilderInUnit(secondaryR.brand, secondaryR.displayInfo);

  const { /** @type Issuer */ liquidityIssuer } = await startAmmPool(
    zoe,
    ammPublicFacet,
    centralR,
    secondaryR,
    centralInitialValue,
    secondaryInitialValue,
  );

  const centralValue = 30n;
  const secondaryValue = 60n;

  const payout = await addLiquidityToPool(
    zoe,
    ammPublicFacet,
    centralR,
    secondaryR,
    liquidityIssuer,
    centralValue,
    secondaryValue,
  );

  const { Liquidity } = payout;
  const [liquidityAmount, { fromCentral: fromCentralPA }] = await Promise.all([
    E(liquidityIssuer).getAmountOf(Liquidity),
    E(ammPublicFacet).getPriceAuthorities(secondaryR.brand)
  ]);

  const centralIssuer = centralR.issuer;
  const secondaryIssuer = secondaryR.issuer;

  const boundries = await getBoundries(fromCentralPA, centralInUnit(1n), secondaryR.brand);
  trace('Boundries', boundries);

  const terms = {
    ammPublicFacet,
    centralIssuer,
    secondaryIssuer,
    liquidityIssuer,
    boundries
  };

  const issuerKeywordRecord = harden({
    Central: centralIssuer,
    Secondary: secondaryIssuer,
    Liquidity: liquidityIssuer,
  });

  const { creatorFacet, publicFacet } = await startStopLoss(
    zoe,
    issuerKeywordRecord,
    terms,
  );

  const notfierP = E(creatorFacet).getNotifier();
  const { value: initialNotification } = await E(notfierP).getUpdateSince();

  t.deepEqual(initialNotification.phase, ALLOCATION_PHASE.SCHEDULED);

  const addLiquidityInvitation =
    E(creatorFacet).makeLockLPTokensInvitation();
  const proposal = harden({ give: { Liquidity: liquidityAmount } });
  const paymentKeywordRecord = harden({ Liquidity: Liquidity });

  const addLiquiditSeat = await E(zoe).offer(
    addLiquidityInvitation,
    proposal,
    paymentKeywordRecord,
  );
  const [addLiquidityMessage, addLiquidityTokenBalance, { value: notificationAfterLPLock }] = await Promise.all([
    E(addLiquiditSeat).getOfferResult(),
    E(publicFacet).getBalanceByBrand('Liquidity', liquidityIssuer),
    E(notfierP).getUpdateSince(),
  ]);

  t.deepEqual(addLiquidityMessage, `Liquidity locked in the value of ${liquidityAmount.value}`);
  t.deepEqual(addLiquidityTokenBalance, liquidityAmount); // Make sure the balance in the contract is as expected
  t.deepEqual(notificationAfterLPLock.phase, ALLOCATION_PHASE.ACTIVE);
});

test('Test remove Liquidity from AMM', async (t) => {
  const { /** @type ZoeService */ zoe,
    /** @type XYKAMMPublicFacet */ amm,
    /** @type IssuerKit */ centralR,
    /** @type IssuerKit */ secondaryR,
  } = await startServices(t);
  const centralInitialValue = 10n;
  const secondaryInitialValue = 20n;

  /** @type XYKAMMPublicFacet */
  const ammPublicFacet = amm.ammPublicFacet;

  const { makeAmountBuilderInUnit } = t.context;

  const { makeAmount: centralInUnit } = makeAmountBuilderInUnit(centralR.brand, centralR.displayInfo);
  const { makeAmount: secondaryInUnit } = makeAmountBuilderInUnit(secondaryR.brand, secondaryR.displayInfo);

  const { /** @type Issuer */ liquidityIssuer } = await startAmmPool(
    zoe,
    ammPublicFacet,
    centralR,
    secondaryR,
    centralInitialValue,
    secondaryInitialValue,
  );

  const centralValue = 30n;
  const secondaryValue = 60n;

  const payout = await addLiquidityToPool(
    zoe,
    ammPublicFacet,
    centralR,
    secondaryR,
    liquidityIssuer,
    centralValue,
    secondaryValue,
  );

  const { Liquidity } = payout;
  const [liquidityAmount, { fromCentral: fromCentralPA }] = await Promise.all([
    E(liquidityIssuer).getAmountOf(Liquidity),
    E(ammPublicFacet).getPriceAuthorities(secondaryR.brand)
  ]);

  const centralIssuer = centralR.issuer;
  const secondaryIssuer = secondaryR.issuer;

  const boundries = await getBoundries(fromCentralPA, centralInUnit(1n), secondaryR.brand);
  trace('Boundries', boundries);

  const terms = {
    ammPublicFacet,
    centralIssuer,
    secondaryIssuer,
    liquidityIssuer,
    boundries
  };

  const issuerKeywordRecord = harden({
    Central: centralIssuer,
    Secondary: secondaryIssuer,
    Liquidity: liquidityIssuer,
  });

  const { creatorFacet, publicFacet } = await startStopLoss(
    zoe,
    issuerKeywordRecord,
    terms,
  );

  const notfierP = E(creatorFacet).getNotifier();
  const { value: initialNotification } = await E(notfierP).getUpdateSince();

  t.deepEqual(initialNotification.phase, ALLOCATION_PHASE.SCHEDULED);

  const addLiquidityInvitation =
    E(creatorFacet).makeLockLPTokensInvitation();
  const proposal = harden({ give: { Liquidity: liquidityAmount } });
  const paymentKeywordRecord = harden({ Liquidity: Liquidity });

  const addLiquiditSeat = await E(zoe).offer(
    addLiquidityInvitation,
    proposal,
    paymentKeywordRecord,
  );
  const [addLiquidityMessage, addLiquidityTokenBalance, { value: notificationAfterLPLock }] = await Promise.all([
    E(addLiquiditSeat).getOfferResult(),
    E(publicFacet).getBalanceByBrand('Liquidity', liquidityIssuer),
    E(notfierP).getUpdateSince(),
  ]);

  t.deepEqual(addLiquidityMessage, `Liquidity locked in the value of ${liquidityAmount.value}`);
  t.deepEqual(addLiquidityTokenBalance, liquidityAmount); // Make sure the balance in the contract is as expected
  t.deepEqual(notificationAfterLPLock.phase, ALLOCATION_PHASE.ACTIVE);

  // remove Assets from AMM
  const removeLiquidityMessage = await E(creatorFacet).removeLiquidityFromAmm();
  t.deepEqual(removeLiquidityMessage, 'Liquidity successfully removed.')

  const [liquidityAmountAllocated, liquidityBrand, centralAmountAllocated, secondaryAmountAllocated, { value: notificationAfterRemoveLiquidity  }] = await Promise.all([
    E(publicFacet).getBalanceByBrand('Liquidity', liquidityIssuer),
    E(liquidityIssuer).getBrand(),
    E(publicFacet).getBalanceByBrand('Central', centralR.issuer),
    E(publicFacet).getBalanceByBrand('Secondary', secondaryR.issuer),
    E(notfierP).getUpdateSince(),
  ]);

  trace('Balances from contract', {
    Liquidity: liquidityAmountAllocated,
    Central: centralAmountAllocated,
    Secondary: secondaryAmountAllocated,
  });
  // Check Balances
  t.deepEqual(liquidityAmountAllocated, AmountMath.makeEmpty(liquidityBrand));
  t.deepEqual(centralAmountAllocated, centralInUnit(30n));
  t.deepEqual(secondaryInUnit(60n), secondaryAmountAllocated);

  // Check notifier
  t.deepEqual(notificationAfterRemoveLiquidity.phase, ALLOCATION_PHASE.LIQUIDATED);
  t.deepEqual(notificationAfterRemoveLiquidity.lpBalance, liquidityAmountAllocated);
  t.deepEqual(notificationAfterRemoveLiquidity.liquidityBalance.central, centralAmountAllocated);
  t.deepEqual(notificationAfterRemoveLiquidity.liquidityBalance.secondary, secondaryAmountAllocated);
});

test('trigger-lp-removal-price-moves-above-upper', async (t) => {
  const { zoe, amm, centralR, secondaryR } = await startServices(t);
  const centralInitialValue = 10n;
  const secondaryInitialValue = 20n;

  /** @type XYKAMMPublicFacet */
  const ammPublicFacet = amm.ammPublicFacet;

  const { makeAmountBuilderInUnit } = t.context;

  const { makeAmount: centralInUnit } = makeAmountBuilderInUnit(centralR.brand, centralR.displayInfo);
  const { makeAmount: secondaryInUnit } = makeAmountBuilderInUnit(secondaryR.brand, secondaryR.displayInfo);

  const { /** @type Issuer */ liquidityIssuer } = await startAmmPool(
    zoe,
    ammPublicFacet,
    centralR,
    secondaryR,
    centralInitialValue,
    secondaryInitialValue,
  );

  // Add liquidity offer (secondary:central) 40_000:30_000.
  const centralValue = 30n;
  const secondaryValue = 60n;

  const payout = await addLiquidityToPool(
    zoe,
    ammPublicFacet,
    centralR,
    secondaryR,
    liquidityIssuer,
    centralValue,
    secondaryValue,
  );

  const { Liquidity } = payout;
  const [liquidityAmount, { fromCentral: fromCentralPA }] = await Promise.all([
    E(liquidityIssuer).getAmountOf(Liquidity),
    E(ammPublicFacet).getPriceAuthorities(secondaryR.brand)
  ]);

  const centralIssuer = centralR.issuer;
  const secondaryIssuer = secondaryR.issuer;

  const boundries = await getBoundries(fromCentralPA, centralInUnit(1n), secondaryR.brand);
  trace('Boundries', boundries);

  const terms = {
    ammPublicFacet,
    centralIssuer,
    secondaryIssuer,
    liquidityIssuer,
    boundries
  };

  const issuerKeywordRecord = harden({
    Central: centralIssuer,
    Secondary: secondaryIssuer,
    Liquidity: liquidityIssuer,
  });

  const { creatorFacet, publicFacet } = await startStopLoss(
    zoe,
    issuerKeywordRecord,
    terms,
  );

  const notifierP = E(creatorFacet).getNotifier();
  const { value: initialNotification } = await E(notifierP).getUpdateSince();

  t.deepEqual(initialNotification.phase, ALLOCATION_PHASE.SCHEDULED);

  const addLiquidityInvitation =
    E(creatorFacet).makeLockLPTokensInvitation();
  const proposal = harden({ give: { Liquidity: liquidityAmount } });
  const paymentKeywordRecord = harden({ Liquidity: Liquidity });

  const addLiquiditSeat = await E(zoe).offer(
    addLiquidityInvitation,
    proposal,
    paymentKeywordRecord,
  );
  const [addLiquidityMessage, addLiquidityTokenBalance, { value: notificationAfterLPLock }] = await Promise.all([
    E(addLiquiditSeat).getOfferResult(),
    E(publicFacet).getBalanceByBrand('Liquidity', liquidityIssuer),
    E(notifierP).getUpdateSince(),
  ]);

  t.deepEqual(addLiquidityMessage, `Liquidity locked in the value of ${liquidityAmount.value}`);
  t.deepEqual(addLiquidityTokenBalance, liquidityAmount); // Make sure the balance in the contract is as expected
  t.deepEqual(notificationAfterLPLock.phase, ALLOCATION_PHASE.ACTIVE);

  console.log('Moving the price up...')
  const { inputPriceAmountOut: inputPriceAfter }  =
    await moveFromCentralPriceUp(zoe, ammPublicFacet, secondaryR, centralR, liquidityIssuer, boundries.upper, 2n);
  console.log('Done.')

  trace('Input price after', inputPriceAfter);

  await waitForPromisesToSettle();

  const [liquidityAmountAllocated, liquidityBrand, centralAmountAllocated, secondaryAmountAllocated, { value: notificationAfterPriceAboveUpper }] = await Promise.all([
    E(publicFacet).getBalanceByBrand('Liquidity', liquidityIssuer),
    E(liquidityIssuer).getBrand(),
    E(publicFacet).getBalanceByBrand('Central', centralR.issuer),
    E(publicFacet).getBalanceByBrand('Secondary', secondaryR.issuer),
    E(notifierP).getUpdateSince(),
  ]);

  trace('Balances from contract', {
    Liquidity: liquidityAmountAllocated,
    Central: centralAmountAllocated,
    Secondary: secondaryAmountAllocated
  });

  // Check balances
  t.deepEqual(liquidityAmountAllocated, AmountMath.makeEmpty(liquidityBrand));
  t.truthy(AmountMath.isGTE(centralInUnit(30n), centralAmountAllocated));
  t.truthy(AmountMath.isGTE(secondaryAmountAllocated, secondaryInUnit(60n)));

  // Check notification
  t.deepEqual(notificationAfterPriceAboveUpper.phase, ALLOCATION_PHASE.LIQUIDATED);
  t.deepEqual(liquidityAmountAllocated, notificationAfterPriceAboveUpper.lpBalance);
  t.deepEqual(centralAmountAllocated, notificationAfterPriceAboveUpper.liquidityBalance.central);
  t.deepEqual(secondaryAmountAllocated, notificationAfterPriceAboveUpper.liquidityBalance.secondary);
});

test('trigger-lp-removal-price-moves-below-lower', async (t) => {
  const { /** @type ZoeService */ zoe,
    /** @type XYKAMMPublicFacet */ amm,
    /** @type IssuerKit */ centralR,
    /** @type IssuerKit */ secondaryR,
  } = await startServices(t);
  const centralInitialValue = 10n;
  const secondaryInitialValue = 20n;

  /** @type XYKAMMPublicFacet */
  const ammPublicFacet = amm.ammPublicFacet;

  const { makeAmountBuilderInUnit } = t.context;

  const { makeAmount: centralInUnit } = makeAmountBuilderInUnit(centralR.brand, centralR.displayInfo);
  const { makeAmount: secondaryInUnit } = makeAmountBuilderInUnit(secondaryR.brand, secondaryR.displayInfo);

  const { /** @type Issuer */ liquidityIssuer } = await startAmmPool(
    zoe,
    ammPublicFacet,
    centralR,
    secondaryR,
    centralInitialValue,
    secondaryInitialValue,
  );

  const centralValue = 30n;
  const secondaryValue = 60n;

  const payout = await addLiquidityToPool(
    zoe,
    ammPublicFacet,
    centralR,
    secondaryR,
    liquidityIssuer,
    centralValue,
    secondaryValue,
  );

  const { Liquidity } = payout;
  const [liquidityAmount, { fromCentral: fromCentralPA }] = await Promise.all([
    E(liquidityIssuer).getAmountOf(Liquidity),
    E(ammPublicFacet).getPriceAuthorities(secondaryR.brand)
  ]);

  const centralIssuer = centralR.issuer;
  const secondaryIssuer = secondaryR.issuer;

  const boundries = await getBoundries(fromCentralPA, centralInUnit(1n), secondaryR.brand);
  trace('Boundaries', boundries);

  const terms = {
    ammPublicFacet,
    centralIssuer,
    secondaryIssuer,
    liquidityIssuer,
    boundries
  };

  const issuerKeywordRecord = harden({
    Central: centralIssuer,
    Secondary: secondaryIssuer,
    Liquidity: liquidityIssuer,
  });

  const { creatorFacet, publicFacet } = await startStopLoss(
    zoe,
    issuerKeywordRecord,
    terms,
  );

  const notfierP = E(creatorFacet).getNotifier();
  const { value: initialNotification } = await E(notfierP).getUpdateSince();

  t.deepEqual(initialNotification.phase, ALLOCATION_PHASE.SCHEDULED);

  const addLiquidityInvitation =
    E(creatorFacet).makeLockLPTokensInvitation();
  const proposal = harden({ give: { Liquidity: liquidityAmount } });
  const paymentKeywordRecord = harden({ Liquidity: Liquidity });

  const addLiquiditSeat = await E(zoe).offer(
    addLiquidityInvitation,
    proposal,
    paymentKeywordRecord,
  );
  const [addLiquidityMessage, addLiquidityTokenBalance, { value: notificationAfterLPLock }] = await Promise.all([
    E(addLiquiditSeat).getOfferResult(),
    E(publicFacet).getBalanceByBrand('Liquidity', liquidityIssuer),
    E(notfierP).getUpdateSince(),
  ]);

  t.deepEqual(addLiquidityMessage, `Liquidity locked in the value of ${liquidityAmount.value}`);
  t.deepEqual(addLiquidityTokenBalance, liquidityAmount); // Make sure the balance in the contract is as expected
  t.deepEqual(notificationAfterLPLock.phase, ALLOCATION_PHASE.ACTIVE);

  console.log('Moving the price up...');
  const { inputPriceAmountOut: inputPriceAfter, swapInterval } =
    await moveFromCentralPriceDown(zoe, ammPublicFacet, secondaryR, centralR, liquidityIssuer, boundries.lower, 1n);
  console.log('Done.');
  trace('InputPriceAfter', inputPriceAfter);

  await waitForPromisesToSettle();

  const [liquidityAmountAllocated, liquidityBrand, centralAmountAllocated, secondaryAmountAllocated, { value: notificationAfterPriceExceedsLimit }] = await Promise.all([
    E(publicFacet).getBalanceByBrand('Liquidity', liquidityIssuer),
    E(liquidityIssuer).getBrand(),
    E(publicFacet).getBalanceByBrand('Central', centralR.issuer),
    E(publicFacet).getBalanceByBrand('Secondary', secondaryR.issuer),
    E(notfierP).getUpdateSince(),
  ]);

  trace('Balances from contract', {
    Liquidity: liquidityAmountAllocated,
    Central: centralAmountAllocated,
    Secondary: secondaryAmountAllocated,
  });

  // Check Balances
  t.deepEqual(liquidityAmountAllocated, AmountMath.makeEmpty(liquidityBrand));
  t.truthy(AmountMath.isGTE(centralAmountAllocated, centralInUnit(30n)));
  t.truthy(AmountMath.isGTE(secondaryInUnit(60n), secondaryAmountAllocated));

  // Check notifier
  t.deepEqual(notificationAfterPriceExceedsLimit.phase, ALLOCATION_PHASE.LIQUIDATED);
  t.deepEqual(notificationAfterPriceExceedsLimit.lpBalance, liquidityAmountAllocated);
  t.deepEqual(notificationAfterPriceExceedsLimit.liquidityBalance.central, centralAmountAllocated);
  t.deepEqual(notificationAfterPriceExceedsLimit.liquidityBalance.secondary, secondaryAmountAllocated);
});

test('update-boundaries-price-moves-below-old-lower-boundary', async (t) => {
  const { /** @type ZoeService */ zoe,
    /** @type XYKAMMPublicFacet */ amm,
    /** @type IssuerKit */ centralR,
    /** @type IssuerKit */ secondaryR,
  } = await startServices(t);
  const centralInitialValue = 10n;
  const secondaryInitialValue = 20n;

  /** @type XYKAMMPublicFacet */
  const ammPublicFacet = amm.ammPublicFacet;

  const { makeAmountBuilderInUnit } = t.context;

  const { makeAmount: centralInUnit } = makeAmountBuilderInUnit(centralR.brand, centralR.displayInfo);
  const { makeAmount: secondaryInUnit } = makeAmountBuilderInUnit(secondaryR.brand, secondaryR.displayInfo);

  const { /** @type Issuer */ liquidityIssuer } = await startAmmPool(
    zoe,
    ammPublicFacet,
    centralR,
    secondaryR,
    centralInitialValue,
    secondaryInitialValue,
  );

  // Add liquidity offer (secondary:central) 40_000:30_000.
  const centralValue = 30n;
  const secondaryValue = 60n;

  const payout = await addLiquidityToPool(
    zoe,
    ammPublicFacet,
    centralR,
    secondaryR,
    liquidityIssuer,
    centralValue,
    secondaryValue,
  );

  const { Liquidity } = payout;
  const [liquidityAmount, { fromCentral: fromCentralPA }] = await Promise.all([
    E(liquidityIssuer).getAmountOf(Liquidity),
    E(ammPublicFacet).getPriceAuthorities(secondaryR.brand)
  ]);

  const centralIssuer = centralR.issuer;
  const secondaryIssuer = secondaryR.issuer;

  const boundries = await getBoundries(fromCentralPA, centralInUnit(1n), secondaryR.brand);
  trace('Boundaries', boundries);

  const terms = {
    ammPublicFacet,
    centralIssuer,
    secondaryIssuer,
    liquidityIssuer,
    boundries
  };

  const issuerKeywordRecord = harden({
    Central: centralIssuer,
    Secondary: secondaryIssuer,
    Liquidity: liquidityIssuer,
  });

  const { creatorFacet, publicFacet } = await startStopLoss(
    zoe,
    issuerKeywordRecord,
    terms,
  );

  const notfierP = E(creatorFacet).getNotifier();
  const { value: initialNotification } = await E(notfierP).getUpdateSince();

  t.deepEqual(initialNotification.phase, ALLOCATION_PHASE.SCHEDULED);

  const addLiquidityInvitation =
    E(creatorFacet).makeLockLPTokensInvitation();
  const proposal = harden({ give: { Liquidity: liquidityAmount } });
  const paymentKeywordRecord = harden({ Liquidity: Liquidity });

  const addLiquiditSeat = await E(zoe).offer(
    addLiquidityInvitation,
    proposal,
    paymentKeywordRecord,
  );
  const [addLiquidityMessage, addLiquidityTokenBalance, { value: notificationAfterLPLock }] = await Promise.all([
    E(addLiquiditSeat).getOfferResult(),
    E(publicFacet).getBalanceByBrand('Liquidity', liquidityIssuer),
    E(notfierP).getUpdateSince(),
  ]);

  t.deepEqual(addLiquidityMessage, `Liquidity locked in the value of ${liquidityAmount.value}`);
  t.deepEqual(addLiquidityTokenBalance, liquidityAmount); // Make sure the balance in the contract is as expected
  t.deepEqual(notificationAfterLPLock.phase, ALLOCATION_PHASE.ACTIVE);

  // Move upper boundary by 0,01 Secondary
  const updateMargin = AmountMath.make(
    secondaryR.brand,
    10n ** BigInt(secondaryR.displayInfo.decimalPlaces - 1)); // Update amount is 0,1 Secondary

  const newBoundaries = {
    lower: makeRatioFromAmounts(AmountMath.subtract(boundries.lower.numerator, updateMargin), centralInUnit(1n)),
    upper: boundries.upper,
  };

  const updateResult = await E(creatorFacet).updateConfiguration(newBoundaries  );
  t.deepEqual(updateResult, UPDATED_BOUNDRY_MESSAGE);

  console.log('Moving the price down...');
  const { inputPriceAmountOut: inputPriceAfter, swapInterval } =
    await moveFromCentralPriceDown(zoe, ammPublicFacet, secondaryR, centralR, liquidityIssuer, boundries.lower, 1n);
  console.log('Done.');
  trace('InputPriceAfter', inputPriceAfter);

  // Check price against boundaries
  t.truthy(AmountMath.isGTE(boundries.lower.numerator, inputPriceAfter));
  t.truthy(AmountMath.isGTE(inputPriceAfter, newBoundaries.lower.numerator));

  await waitForPromisesToSettle();

  const [liquidityAmountAllocated, centralAmountAllocated, secondaryAmountAllocated, { value: notificationAfterPriceExceedsLimit }] = await Promise.all([
    E(publicFacet).getBalanceByBrand('Liquidity', liquidityIssuer),
    E(publicFacet).getBalanceByBrand('Central', centralR.issuer),
    E(publicFacet).getBalanceByBrand('Secondary', secondaryR.issuer),
    E(notfierP).getUpdateSince(),
  ]);

  trace('Balances from contract', {
    Liquidity: liquidityAmountAllocated,
    Central: centralAmountAllocated,
    Secondary: secondaryAmountAllocated,
  });

  // Check Balances
  t.deepEqual(liquidityAmountAllocated, liquidityAmount);
  t.truthy(AmountMath.isEmpty(centralAmountAllocated));
  t.truthy(AmountMath.isEmpty(secondaryAmountAllocated));

  // Check notifier
  t.deepEqual(notificationAfterPriceExceedsLimit.phase, ALLOCATION_PHASE.ACTIVE);
  t.deepEqual(notificationAfterPriceExceedsLimit.lpBalance, liquidityAmountAllocated);
  t.deepEqual(notificationAfterPriceExceedsLimit.liquidityBalance.central, centralAmountAllocated);
  t.deepEqual(notificationAfterPriceExceedsLimit.liquidityBalance.secondary, secondaryAmountAllocated);
});

test('update-boundaries-price-moves-above-old-upper-boundary', async (t) => {
  const { /** @type ZoeService */ zoe,
    /** @type XYKAMMPublicFacet */ amm,
    /** @type IssuerKit */ centralR,
    /** @type IssuerKit */ secondaryR,
  } = await startServices(t);
  const centralInitialValue = 10n;
  const secondaryInitialValue = 20n;

  /** @type XYKAMMPublicFacet */
  const ammPublicFacet = amm.ammPublicFacet;

  const { makeAmountBuilderInUnit } = t.context;

  const { makeAmount: centralInUnit } = makeAmountBuilderInUnit(centralR.brand, centralR.displayInfo);
  const { makeAmount: secondaryInUnit } = makeAmountBuilderInUnit(secondaryR.brand, secondaryR.displayInfo);

  const { /** @type Issuer */ liquidityIssuer } = await startAmmPool(
    zoe,
    ammPublicFacet,
    centralR,
    secondaryR,
    centralInitialValue,
    secondaryInitialValue,
  );

  // Add liquidity offer (secondary:central) 40_000:30_000.
  const centralValue = 30n;
  const secondaryValue = 60n;

  const payout = await addLiquidityToPool(
    zoe,
    ammPublicFacet,
    centralR,
    secondaryR,
    liquidityIssuer,
    centralValue,
    secondaryValue,
  );

  const { Liquidity } = payout;
  const [liquidityAmount, { fromCentral: fromCentralPA }] = await Promise.all([
    E(liquidityIssuer).getAmountOf(Liquidity),
    E(ammPublicFacet).getPriceAuthorities(secondaryR.brand)
  ]);

  const centralIssuer = centralR.issuer;
  const secondaryIssuer = secondaryR.issuer;

  const boundries = await getBoundries(fromCentralPA, centralInUnit(1n), secondaryR.brand);
  trace('Boundaries', boundries);

  const terms = {
    ammPublicFacet,
    centralIssuer,
    secondaryIssuer,
    liquidityIssuer,
    boundries
  };

  const issuerKeywordRecord = harden({
    Central: centralIssuer,
    Secondary: secondaryIssuer,
    Liquidity: liquidityIssuer,
  });

  const { creatorFacet, publicFacet } = await startStopLoss(
    zoe,
    issuerKeywordRecord,
    terms,
  );

  const notfierP = E(creatorFacet).getNotifier();
  const { value: initialNotification } = await E(notfierP).getUpdateSince();

  t.deepEqual(initialNotification.phase, ALLOCATION_PHASE.SCHEDULED);

  const addLiquidityInvitation =
    E(creatorFacet).makeLockLPTokensInvitation();
  const proposal = harden({ give: { Liquidity: liquidityAmount } });
  const paymentKeywordRecord = harden({ Liquidity: Liquidity });

  const addLiquiditSeat = await E(zoe).offer(
    addLiquidityInvitation,
    proposal,
    paymentKeywordRecord,
  );
  const [addLiquidityMessage, addLiquidityTokenBalance, { value: notificationAfterLPLock }] = await Promise.all([
    E(addLiquiditSeat).getOfferResult(),
    E(publicFacet).getBalanceByBrand('Liquidity', liquidityIssuer),
    E(notfierP).getUpdateSince(),
  ]);

  t.deepEqual(addLiquidityMessage, `Liquidity locked in the value of ${liquidityAmount.value}`);
  t.deepEqual(addLiquidityTokenBalance, liquidityAmount); // Make sure the balance in the contract is as expected
  t.deepEqual(notificationAfterLPLock.phase, ALLOCATION_PHASE.ACTIVE);

  // Move upper boundary by 0,01 Secondary
  const updateMargin = AmountMath.make(
    secondaryR.brand,
    10n ** BigInt(secondaryR.displayInfo.decimalPlaces - 1)); // Update amount is 0,1 Secondary

  // newLower = (oldLower.numerator - 0,1 Secodary) / 1 Central
  // newUpper = (oldUpper.numerator + 0,1 Secodary) / 1 Central
  const newBoundaries = {
    lower: makeRatioFromAmounts(AmountMath.subtract(boundries.lower.numerator, updateMargin), centralInUnit(1n)),
    upper: makeRatioFromAmounts(AmountMath.add(boundries.upper.numerator, updateMargin), centralInUnit(1n)),
  };

  const updateResult = await E(creatorFacet).updateConfiguration(newBoundaries);
  t.deepEqual(updateResult, UPDATED_BOUNDRY_MESSAGE);

  console.log('Moving the price down...');
  const { inputPriceAmountOut: inputPriceAfter } =
    await moveFromCentralPriceUp(zoe, ammPublicFacet, secondaryR, centralR, liquidityIssuer, boundries.upper, 2n);
  console.log('Done.');
  trace('InputPriceAfter', inputPriceAfter);

  // Check price against boundaries
  t.truthy(AmountMath.isGTE(inputPriceAfter, boundries.upper.numerator));
  t.truthy(AmountMath.isGTE(newBoundaries.upper.numerator, inputPriceAfter));

  await waitForPromisesToSettle();

  const [liquidityAmountAllocated, centralAmountAllocated, secondaryAmountAllocated, { value: notificationAfterPriceExceedsLimit }] = await Promise.all([
    E(publicFacet).getBalanceByBrand('Liquidity', liquidityIssuer),
    E(publicFacet).getBalanceByBrand('Central', centralR.issuer),
    E(publicFacet).getBalanceByBrand('Secondary', secondaryR.issuer),
    E(notfierP).getUpdateSince(),
  ]);

  trace('Balances from contract', {
    Liquidity: liquidityAmountAllocated,
    Central: centralAmountAllocated,
    Secondary: secondaryAmountAllocated,
  });

  // Check Balances
  t.deepEqual(liquidityAmountAllocated, liquidityAmount);
  t.truthy(AmountMath.isEmpty(centralAmountAllocated));
  t.truthy(AmountMath.isEmpty(secondaryAmountAllocated));

  // Check notifier
  t.deepEqual(notificationAfterPriceExceedsLimit.phase, ALLOCATION_PHASE.ACTIVE);
  t.deepEqual(notificationAfterPriceExceedsLimit.lpBalance, liquidityAmountAllocated);
  t.deepEqual(notificationAfterPriceExceedsLimit.liquidityBalance.central, centralAmountAllocated);
  t.deepEqual(notificationAfterPriceExceedsLimit.liquidityBalance.secondary, secondaryAmountAllocated);
});

test('update-boundaries-price-moves-above-old-upper-then-new-upper', async (t) => {
  const { /** @type ZoeService */ zoe,
    /** @type XYKAMMPublicFacet */ amm,
    /** @type IssuerKit */ centralR,
    /** @type IssuerKit */ secondaryR,
  } = await startServices(t);
  const centralInitialValue = 10n;
  const secondaryInitialValue = 20n;

  /** @type XYKAMMPublicFacet */
  const ammPublicFacet = amm.ammPublicFacet;

  const { makeAmountBuilderInUnit } = t.context;

  const { makeAmount: centralInUnit } = makeAmountBuilderInUnit(centralR.brand, centralR.displayInfo);
  const { makeAmount: secondaryInUnit } = makeAmountBuilderInUnit(secondaryR.brand, secondaryR.displayInfo);

  const { /** @type Issuer */ liquidityIssuer } = await startAmmPool(
    zoe,
    ammPublicFacet,
    centralR,
    secondaryR,
    centralInitialValue,
    secondaryInitialValue,
  );

  // Add liquidity offer (secondary:central) 40_000:30_000.
  const centralValue = 30n;
  const secondaryValue = 60n;

  const payout = await addLiquidityToPool(
    zoe,
    ammPublicFacet,
    centralR,
    secondaryR,
    liquidityIssuer,
    centralValue,
    secondaryValue,
  );

  const { Liquidity } = payout;
  const [liquidityAmount, { fromCentral: fromCentralPA }] = await Promise.all([
    E(liquidityIssuer).getAmountOf(Liquidity),
    E(ammPublicFacet).getPriceAuthorities(secondaryR.brand)
  ]);

  const centralIssuer = centralR.issuer;
  const secondaryIssuer = secondaryR.issuer;

  const boundries = await getBoundries(fromCentralPA, centralInUnit(1n), secondaryR.brand);
  trace('Boundaries', boundries);

  const terms = {
    ammPublicFacet,
    centralIssuer,
    secondaryIssuer,
    liquidityIssuer,
    boundries
  };

  const issuerKeywordRecord = harden({
    Central: centralIssuer,
    Secondary: secondaryIssuer,
    Liquidity: liquidityIssuer,
  });

  const { creatorFacet, publicFacet } = await startStopLoss(
    zoe,
    issuerKeywordRecord,
    terms,
  );

  const notfierP = E(creatorFacet).getNotifier();
  const { value: initialNotification } = await E(notfierP).getUpdateSince();

  t.deepEqual(initialNotification.phase, ALLOCATION_PHASE.SCHEDULED);

  const addLiquidityInvitation =
    E(creatorFacet).makeLockLPTokensInvitation();
  const proposal = harden({ give: { Liquidity: liquidityAmount } });
  const paymentKeywordRecord = harden({ Liquidity: Liquidity });

  const addLiquiditSeat = await E(zoe).offer(
    addLiquidityInvitation,
    proposal,
    paymentKeywordRecord,
  );
  const [addLiquidityMessage, addLiquidityTokenBalance, { value: notificationAfterLPLock }] = await Promise.all([
    E(addLiquiditSeat).getOfferResult(),
    E(publicFacet).getBalanceByBrand('Liquidity', liquidityIssuer),
    E(notfierP).getUpdateSince(),
  ]);

  t.deepEqual(addLiquidityMessage, `Liquidity locked in the value of ${liquidityAmount.value}`);
  t.deepEqual(addLiquidityTokenBalance, liquidityAmount); // Make sure the balance in the contract is as expected
  t.deepEqual(notificationAfterLPLock.phase, ALLOCATION_PHASE.ACTIVE);

  // Move upper boundary by 0,01 Secondary
  const updateMargin = AmountMath.make(
    secondaryR.brand,
    10n ** BigInt(secondaryR.displayInfo.decimalPlaces - 1)); // Update amount is 0,1 Secondary

  const newBoundaries = {
    lower: makeRatioFromAmounts(AmountMath.subtract(boundries.lower.numerator, updateMargin), centralInUnit(1n)),
    upper: makeRatioFromAmounts(AmountMath.add(boundries.upper.numerator, updateMargin), centralInUnit(1n)),
  };

  const updateResult = await E(creatorFacet).updateConfiguration(newBoundaries  );
  t.deepEqual(updateResult, UPDATED_BOUNDRY_MESSAGE);

  console.log('Moving the price up...');
  const { inputPriceAmountOut: inputPriceAfter } =
    await moveFromCentralPriceUp(zoe, ammPublicFacet, secondaryR, centralR, liquidityIssuer, boundries.upper, 1n);
  console.log('Done.');
  trace('InputPriceAfter', inputPriceAfter);

  // Check price against boundaries
  t.truthy(AmountMath.isGTE(newBoundaries.upper.numerator, inputPriceAfter));
  t.truthy(AmountMath.isGTE(inputPriceAfter, boundries.upper.numerator));

  await waitForPromisesToSettle();

  const [liquidityAmountAllocated, centralAmountAllocated, secondaryAmountAllocated, { value: notificationAfterPriceExceedsOldLimit }] =
    await Promise.all([
      E(publicFacet).getBalanceByBrand('Liquidity', liquidityIssuer),
      E(publicFacet).getBalanceByBrand('Central', centralR.issuer),
      E(publicFacet).getBalanceByBrand('Secondary', secondaryR.issuer),
      E(notfierP).getUpdateSince(),
    ]);

  trace('Balances from contract', {
    Liquidity: liquidityAmountAllocated,
    Central: centralAmountAllocated,
    Secondary: secondaryAmountAllocated,
  });

  // Check Balances
  t.deepEqual(liquidityAmountAllocated, liquidityAmount);
  t.truthy(AmountMath.isEmpty(centralAmountAllocated));
  t.truthy(AmountMath.isEmpty(secondaryAmountAllocated));

  // Check notifier
  t.deepEqual(notificationAfterPriceExceedsOldLimit.phase, ALLOCATION_PHASE.ACTIVE);
  t.deepEqual(notificationAfterPriceExceedsOldLimit.lpBalance, liquidityAmountAllocated);
  t.deepEqual(notificationAfterPriceExceedsOldLimit.liquidityBalance.central, centralAmountAllocated);
  t.deepEqual(notificationAfterPriceExceedsOldLimit.liquidityBalance.secondary, secondaryAmountAllocated);

  console.log('Moving the price up...');
  const { inputPriceAmountOut: inputPriceAfterBoundariesUpdated } =
    await moveFromCentralPriceUp(zoe, ammPublicFacet, secondaryR, centralR, liquidityIssuer, newBoundaries.upper, 1n);
  console.log('Done.');
  trace('inputPriceAfterBoundariesUpdated', inputPriceAfterBoundariesUpdated);

  await waitForPromisesToSettle();

  const [
    liquidityAmountAllocatedAfterUpdate,
    centralAmountAllocatedAfterUpdate,
    secondaryAmountAllocatedAfterUpdate,
    { value: notificationAfterPriceExceedsLimit }] = await Promise.all([
    E(publicFacet).getBalanceByBrand('Liquidity', liquidityIssuer),
    E(publicFacet).getBalanceByBrand('Central', centralR.issuer),
    E(publicFacet).getBalanceByBrand('Secondary', secondaryR.issuer),
    E(notfierP).getUpdateSince(),
  ]);

  trace('Balances from contract', {
    Liquidity: liquidityAmountAllocatedAfterUpdate,
    Central: centralAmountAllocatedAfterUpdate,
    Secondary: secondaryAmountAllocatedAfterUpdate,
  });

  // Check Balances
  t.truthy(AmountMath.isEmpty(liquidityAmountAllocatedAfterUpdate));
  t.truthy(AmountMath.isGTE(centralInUnit(30n), centralAmountAllocatedAfterUpdate));
  t.truthy(AmountMath.isGTE(secondaryAmountAllocatedAfterUpdate, secondaryInUnit(60n)));

  // Check notifier
  t.deepEqual(notificationAfterPriceExceedsLimit.phase, ALLOCATION_PHASE.LIQUIDATED);
  t.deepEqual(notificationAfterPriceExceedsLimit.lpBalance, liquidityAmountAllocatedAfterUpdate);
  t.deepEqual(notificationAfterPriceExceedsLimit.liquidityBalance.central, centralAmountAllocatedAfterUpdate);
  t.deepEqual(notificationAfterPriceExceedsLimit.liquidityBalance.secondary, secondaryAmountAllocatedAfterUpdate);
});

test('update-boundaries-price-moves-below-old-lower-then-new-lower', async (t) => {
  const { /** @type ZoeService */ zoe,
    /** @type XYKAMMPublicFacet */ amm,
    /** @type IssuerKit */ centralR,
    /** @type IssuerKit */ secondaryR,
  } = await startServices(t);
  const centralInitialValue = 10n;
  const secondaryInitialValue = 20n;

  /** @type XYKAMMPublicFacet */
  const ammPublicFacet = amm.ammPublicFacet;

  const { makeAmountBuilderInUnit } = t.context;

  const { makeAmount: centralInUnit } = makeAmountBuilderInUnit(centralR.brand, centralR.displayInfo);
  const { makeAmount: secondaryInUnit } = makeAmountBuilderInUnit(secondaryR.brand, secondaryR.displayInfo);

  const { /** @type Issuer */ liquidityIssuer } = await startAmmPool(
    zoe,
    ammPublicFacet,
    centralR,
    secondaryR,
    centralInitialValue,
    secondaryInitialValue,
  );

  // Add liquidity offer (secondary:central) 40_000:30_000.
  const centralValue = 30n;
  const secondaryValue = 60n;

  const payout = await addLiquidityToPool(
    zoe,
    ammPublicFacet,
    centralR,
    secondaryR,
    liquidityIssuer,
    centralValue,
    secondaryValue,
  );

  const { Liquidity } = payout;
  const [liquidityAmount, { fromCentral: fromCentralPA }] = await Promise.all([
    E(liquidityIssuer).getAmountOf(Liquidity),
    E(ammPublicFacet).getPriceAuthorities(secondaryR.brand)
  ]);

  const centralIssuer = centralR.issuer;
  const secondaryIssuer = secondaryR.issuer;

  const boundries = await getBoundries(fromCentralPA, centralInUnit(1n), secondaryR.brand);
  trace('Boundaries', boundries);

  const terms = {
    ammPublicFacet,
    centralIssuer,
    secondaryIssuer,
    liquidityIssuer,
    boundries
  };

  const issuerKeywordRecord = harden({
    Central: centralIssuer,
    Secondary: secondaryIssuer,
    Liquidity: liquidityIssuer,
  });

  const { creatorFacet, publicFacet } = await startStopLoss(
    zoe,
    issuerKeywordRecord,
    terms,
  );

  const notfierP = E(creatorFacet).getNotifier();
  const { value: initialNotification } = await E(notfierP).getUpdateSince();

  t.deepEqual(initialNotification.phase, ALLOCATION_PHASE.SCHEDULED);

  const addLiquidityInvitation =
    E(creatorFacet).makeLockLPTokensInvitation();
  const proposal = harden({ give: { Liquidity: liquidityAmount } });
  const paymentKeywordRecord = harden({ Liquidity: Liquidity });

  const addLiquiditSeat = await E(zoe).offer(
    addLiquidityInvitation,
    proposal,
    paymentKeywordRecord,
  );
  const [addLiquidityMessage, addLiquidityTokenBalance, { value: notificationAfterLPLock }] = await Promise.all([
    E(addLiquiditSeat).getOfferResult(),
    E(publicFacet).getBalanceByBrand('Liquidity', liquidityIssuer),
    E(notfierP).getUpdateSince(),
  ]);

  t.deepEqual(addLiquidityMessage, `Liquidity locked in the value of ${liquidityAmount.value}`);
  t.deepEqual(addLiquidityTokenBalance, liquidityAmount); // Make sure the balance in the contract is as expected
  t.deepEqual(notificationAfterLPLock.phase, ALLOCATION_PHASE.ACTIVE);

  // Move upper boundary by 0,01 Secondary
  const updateMargin = AmountMath.make(
    secondaryR.brand,
    10n ** BigInt(secondaryR.displayInfo.decimalPlaces - 1)); // Update amount is 0,1 Secondary

  const newBoundaries = {
    lower: makeRatioFromAmounts(AmountMath.subtract(boundries.lower.numerator, updateMargin), centralInUnit(1n)),
    upper: makeRatioFromAmounts(AmountMath.add(boundries.upper.numerator, updateMargin), centralInUnit(1n)),
  };

  const updateResult = await E(creatorFacet).updateConfiguration(newBoundaries  );
  t.deepEqual(updateResult, UPDATED_BOUNDRY_MESSAGE);

  console.log('Moving the price down...');
  const { inputPriceAmountOut: inputPriceAfter } =
    await moveFromCentralPriceDown(zoe, ammPublicFacet, secondaryR, centralR, liquidityIssuer, boundries.lower, 1n);
  console.log('Done.');
  trace('InputPriceAfter', inputPriceAfter);

  // Check price against boundaries
  t.truthy(AmountMath.isGTE(boundries.lower.numerator, inputPriceAfter));
  t.truthy(AmountMath.isGTE(inputPriceAfter, newBoundaries.lower.numerator));

  await waitForPromisesToSettle();

  const [liquidityAmountAllocated, centralAmountAllocated, secondaryAmountAllocated, { value: notificationAfterPriceExceedsOldLimit }] =
    await Promise.all([
      E(publicFacet).getBalanceByBrand('Liquidity', liquidityIssuer),
      E(publicFacet).getBalanceByBrand('Central', centralR.issuer),
      E(publicFacet).getBalanceByBrand('Secondary', secondaryR.issuer),
      E(notfierP).getUpdateSince(),
    ]);

  trace('Balances from contract', {
    Liquidity: liquidityAmountAllocated,
    Central: centralAmountAllocated,
    Secondary: secondaryAmountAllocated,
  });

  // Check Balances
  t.deepEqual(liquidityAmountAllocated, liquidityAmount);
  t.truthy(AmountMath.isEmpty(centralAmountAllocated));
  t.truthy(AmountMath.isEmpty(secondaryAmountAllocated));

  // Check notifier
  t.deepEqual(notificationAfterPriceExceedsOldLimit.phase, ALLOCATION_PHASE.ACTIVE);
  t.deepEqual(notificationAfterPriceExceedsOldLimit.lpBalance, liquidityAmountAllocated);
  t.deepEqual(notificationAfterPriceExceedsOldLimit.liquidityBalance.central, centralAmountAllocated);
  t.deepEqual(notificationAfterPriceExceedsOldLimit.liquidityBalance.secondary, secondaryAmountAllocated);

  console.log('Moving the price down...');
  const { inputPriceAmountOut: inputPriceAfterBoundariesUpdated } =
    await moveFromCentralPriceDown(zoe, ammPublicFacet, secondaryR, centralR, liquidityIssuer, newBoundaries.lower, 1n);
  console.log('Done.');
  trace('inputPriceAfterBoundariesUpdated', inputPriceAfterBoundariesUpdated);

  await waitForPromisesToSettle();

  const [
    liquidityAmountAllocatedAfterUpdate,
    centralAmountAllocatedAfterUpdate,
    secondaryAmountAllocatedAfterUpdate,
    { value: notificationAfterPriceExceedsLimit }] = await Promise.all([
    E(publicFacet).getBalanceByBrand('Liquidity', liquidityIssuer),
    E(publicFacet).getBalanceByBrand('Central', centralR.issuer),
    E(publicFacet).getBalanceByBrand('Secondary', secondaryR.issuer),
    E(notfierP).getUpdateSince(),
  ]);

  trace('Balances from contract', {
    Liquidity: liquidityAmountAllocatedAfterUpdate,
    Central: centralAmountAllocatedAfterUpdate,
    Secondary: secondaryAmountAllocatedAfterUpdate,
  });

  // Check Balances
  t.truthy(AmountMath.isEmpty(liquidityAmountAllocatedAfterUpdate));
  t.truthy(AmountMath.isGTE(centralAmountAllocatedAfterUpdate, centralInUnit(30n)));
  t.truthy(AmountMath.isGTE(secondaryInUnit(60n), secondaryAmountAllocatedAfterUpdate));

  // Check notifier
  t.deepEqual(notificationAfterPriceExceedsLimit.phase, ALLOCATION_PHASE.LIQUIDATED);
  t.deepEqual(notificationAfterPriceExceedsLimit.lpBalance, liquidityAmountAllocatedAfterUpdate);
  t.deepEqual(notificationAfterPriceExceedsLimit.liquidityBalance.central, centralAmountAllocatedAfterUpdate);
  t.deepEqual(notificationAfterPriceExceedsLimit.liquidityBalance.secondary, secondaryAmountAllocatedAfterUpdate);
});

test('update-boundaries-price-moves-below-old-lower-then-new-upper', async (t) => {
  const { /** @type ZoeService */ zoe,
    /** @type XYKAMMPublicFacet */ amm,
    /** @type IssuerKit */ centralR,
    /** @type IssuerKit */ secondaryR,
  } = await startServices(t);
  const centralInitialValue = 10n;
  const secondaryInitialValue = 20n;

  /** @type XYKAMMPublicFacet */
  const ammPublicFacet = amm.ammPublicFacet;

  const { makeAmountBuilderInUnit } = t.context;

  const { makeAmount: centralInUnit } = makeAmountBuilderInUnit(centralR.brand, centralR.displayInfo);
  const { makeAmount: secondaryInUnit } = makeAmountBuilderInUnit(secondaryR.brand, secondaryR.displayInfo);

  const { /** @type Issuer */ liquidityIssuer } = await startAmmPool(
    zoe,
    ammPublicFacet,
    centralR,
    secondaryR,
    centralInitialValue,
    secondaryInitialValue,
  );

  // Add liquidity offer (secondary:central) 40_000:30_000.
  const centralValue = 30n;
  const secondaryValue = 60n;

  const payout = await addLiquidityToPool(
    zoe,
    ammPublicFacet,
    centralR,
    secondaryR,
    liquidityIssuer,
    centralValue,
    secondaryValue,
  );

  const { Liquidity } = payout;
  const [liquidityAmount, { fromCentral: fromCentralPA }] = await Promise.all([
    E(liquidityIssuer).getAmountOf(Liquidity),
    E(ammPublicFacet).getPriceAuthorities(secondaryR.brand)
  ]);

  const centralIssuer = centralR.issuer;
  const secondaryIssuer = secondaryR.issuer;

  const boundries = await getBoundries(fromCentralPA, centralInUnit(1n), secondaryR.brand);
  trace('Boundaries', boundries);

  const terms = {
    ammPublicFacet,
    centralIssuer,
    secondaryIssuer,
    liquidityIssuer,
    boundries
  };

  const issuerKeywordRecord = harden({
    Central: centralIssuer,
    Secondary: secondaryIssuer,
    Liquidity: liquidityIssuer,
  });

  const { creatorFacet, publicFacet } = await startStopLoss(
    zoe,
    issuerKeywordRecord,
    terms,
  );

  const notfierP = E(creatorFacet).getNotifier();
  const { value: initialNotification } = await E(notfierP).getUpdateSince();

  t.deepEqual(initialNotification.phase, ALLOCATION_PHASE.SCHEDULED);

  const addLiquidityInvitation =
    E(creatorFacet).makeLockLPTokensInvitation();
  const proposal = harden({ give: { Liquidity: liquidityAmount } });
  const paymentKeywordRecord = harden({ Liquidity: Liquidity });

  const addLiquiditSeat = await E(zoe).offer(
    addLiquidityInvitation,
    proposal,
    paymentKeywordRecord,
  );
  const [addLiquidityMessage, addLiquidityTokenBalance, { value: notificationAfterLPLock }] = await Promise.all([
    E(addLiquiditSeat).getOfferResult(),
    E(publicFacet).getBalanceByBrand('Liquidity', liquidityIssuer),
    E(notfierP).getUpdateSince(),
  ]);

  t.deepEqual(addLiquidityMessage, `Liquidity locked in the value of ${liquidityAmount.value}`);
  t.deepEqual(addLiquidityTokenBalance, liquidityAmount); // Make sure the balance in the contract is as expected
  t.deepEqual(notificationAfterLPLock.phase, ALLOCATION_PHASE.ACTIVE);

  // Move upper boundary by 0,01 Secondary
  const updateMargin = AmountMath.make(
    secondaryR.brand,
    10n ** BigInt(secondaryR.displayInfo.decimalPlaces - 1)); // Update amount is 0,1 Secondary

  const newBoundaries = {
    lower: makeRatioFromAmounts(AmountMath.subtract(boundries.lower.numerator, updateMargin), centralInUnit(1n)),
    upper: makeRatioFromAmounts(AmountMath.add(boundries.upper.numerator, updateMargin), centralInUnit(1n)),
  };

  const updateResult = await E(creatorFacet).updateConfiguration(newBoundaries  );
  t.deepEqual(updateResult, UPDATED_BOUNDRY_MESSAGE);

  console.log('Moving the price down...');
  const { inputPriceAmountOut: inputPriceAfter } =
    await moveFromCentralPriceDown(zoe, ammPublicFacet, secondaryR, centralR, liquidityIssuer, boundries.lower, 1n);
  console.log('Done.');
  trace('InputPriceAfter', inputPriceAfter);

  // Check price against boundaries
  t.truthy(AmountMath.isGTE(boundries.lower.numerator, inputPriceAfter));
  t.truthy(AmountMath.isGTE(inputPriceAfter, newBoundaries.lower.numerator));

  await waitForPromisesToSettle();

  const [liquidityAmountAllocated, centralAmountAllocated, secondaryAmountAllocated, { value: notificationAfterPriceExceedsOldLimit }] =
    await Promise.all([
      E(publicFacet).getBalanceByBrand('Liquidity', liquidityIssuer),
      E(publicFacet).getBalanceByBrand('Central', centralR.issuer),
      E(publicFacet).getBalanceByBrand('Secondary', secondaryR.issuer),
      E(notfierP).getUpdateSince(),
    ]);

  trace('Balances from contract', {
    Liquidity: liquidityAmountAllocated,
    Central: centralAmountAllocated,
    Secondary: secondaryAmountAllocated,
  });

  // Check Balances
  t.deepEqual(liquidityAmountAllocated, liquidityAmount);
  t.truthy(AmountMath.isEmpty(centralAmountAllocated));
  t.truthy(AmountMath.isEmpty(secondaryAmountAllocated));

  // Check notifier
  t.deepEqual(notificationAfterPriceExceedsOldLimit.phase, ALLOCATION_PHASE.ACTIVE);
  t.deepEqual(notificationAfterPriceExceedsOldLimit.lpBalance, liquidityAmountAllocated);
  t.deepEqual(notificationAfterPriceExceedsOldLimit.liquidityBalance.central, centralAmountAllocated);
  t.deepEqual(notificationAfterPriceExceedsOldLimit.liquidityBalance.secondary, secondaryAmountAllocated);

  console.log('Moving the price up...');
  const { inputPriceAmountOut: inputPriceAfterBoundariesUpdated } =
    await moveFromCentralPriceUp(zoe, ammPublicFacet, secondaryR, centralR, liquidityIssuer, newBoundaries.upper, 1n);
  console.log('Done.');
  trace('inputPriceAfterBoundariesUpdated', inputPriceAfterBoundariesUpdated);

  await waitForPromisesToSettle();

  const [
    liquidityAmountAllocatedAfterUpdate,
    centralAmountAllocatedAfterUpdate,
    secondaryAmountAllocatedAfterUpdate,
    { value: notificationAfterPriceExceedsLimit }] = await Promise.all([
    E(publicFacet).getBalanceByBrand('Liquidity', liquidityIssuer),
    E(publicFacet).getBalanceByBrand('Central', centralR.issuer),
    E(publicFacet).getBalanceByBrand('Secondary', secondaryR.issuer),
    E(notfierP).getUpdateSince(),
  ]);

  trace('Balances from contract', {
    Liquidity: liquidityAmountAllocatedAfterUpdate,
    Central: centralAmountAllocatedAfterUpdate,
    Secondary: secondaryAmountAllocatedAfterUpdate,
  });

  // Check Balances
  t.truthy(AmountMath.isEmpty(liquidityAmountAllocatedAfterUpdate));
  t.truthy(AmountMath.isGTE(centralInUnit(30n), centralAmountAllocatedAfterUpdate));
  t.truthy(AmountMath.isGTE(secondaryAmountAllocatedAfterUpdate, secondaryInUnit(60n)));

  // Check notifier
  t.deepEqual(notificationAfterPriceExceedsLimit.phase, ALLOCATION_PHASE.LIQUIDATED);
  t.deepEqual(notificationAfterPriceExceedsLimit.lpBalance, liquidityAmountAllocatedAfterUpdate);
  t.deepEqual(notificationAfterPriceExceedsLimit.liquidityBalance.central, centralAmountAllocatedAfterUpdate);
  t.deepEqual(notificationAfterPriceExceedsLimit.liquidityBalance.secondary, secondaryAmountAllocatedAfterUpdate);
});

test('Test withdraw Liquidity', async (t) => {
  const { /** @type ZoeService */ zoe,
    /** @type XYKAMMPublicFacet */ amm,
    /** @type IssuerKit */ centralR,
    /** @type IssuerKit */ secondaryR,
  } = await startServices(t);
  const centralInitialValue = 10n;
  const secondaryInitialValue = 20n;

  /** @type XYKAMMPublicFacet */
  const ammPublicFacet = amm.ammPublicFacet;

  const { makeAmountBuilderInUnit } = t.context;

  const { makeAmount: centralInUnit } = makeAmountBuilderInUnit(centralR.brand, centralR.displayInfo);
  const { makeAmount: secondaryInUnit } = makeAmountBuilderInUnit(secondaryR.brand, secondaryR.displayInfo);

  const { /** @type Issuer */ liquidityIssuer } = await startAmmPool(
    zoe,
    ammPublicFacet,
    centralR,
    secondaryR,
    centralInitialValue,
    secondaryInitialValue,
  );

  const centralValue = 30n;
  const secondaryValue = 60n;

  const payout = await addLiquidityToPool(
    zoe,
    ammPublicFacet,
    centralR,
    secondaryR,
    liquidityIssuer,
    centralValue,
    secondaryValue,
  );

  const { Liquidity } = payout;
  const [liquidityAmount, { fromCentral: fromCentralPA }] = await Promise.all([
    E(liquidityIssuer).getAmountOf(Liquidity),
    E(ammPublicFacet).getPriceAuthorities(secondaryR.brand)
  ]);

  const centralIssuer = centralR.issuer;
  const secondaryIssuer = secondaryR.issuer;

  const boundries = await getBoundries(fromCentralPA, centralInUnit(1n), secondaryR.brand);

  const terms = {
    ammPublicFacet,
    centralIssuer,
    secondaryIssuer,
    liquidityIssuer,
    boundries
  };

  const issuerKeywordRecord = harden({
    Central: centralIssuer,
    Secondary: secondaryIssuer,
    Liquidity: liquidityIssuer,
  });

  const { creatorFacet, publicFacet } = await startStopLoss(
    zoe,
    issuerKeywordRecord,
    terms,
  );

  const notfierP = E(creatorFacet).getNotifier();
  const { value: initialNotification } = await E(notfierP).getUpdateSince();

  t.deepEqual(initialNotification.phase, ALLOCATION_PHASE.SCHEDULED);

  const addLiquidityInvitation =
    E(creatorFacet).makeLockLPTokensInvitation();
  const proposal = harden({ give: { Liquidity: liquidityAmount } });
  const paymentKeywordRecord = harden({ Liquidity: Liquidity });

  const addLiquiditSeat = await E(zoe).offer(
    addLiquidityInvitation,
    proposal,
    paymentKeywordRecord,
  );
  const [addLiquidityMessage, addLiquidityTokenBalance, { value: notificationAfterLPLock }] = await Promise.all([
    E(addLiquiditSeat).getOfferResult(),
    E(publicFacet).getBalanceByBrand('Liquidity', liquidityIssuer),
    E(notfierP).getUpdateSince(),
  ]);

  t.deepEqual(addLiquidityMessage, `Liquidity locked in the value of ${liquidityAmount.value}`);
  t.deepEqual(addLiquidityTokenBalance, liquidityAmount); // Make sure the balance in the contract is as expected
  t.deepEqual(notificationAfterLPLock.phase, ALLOCATION_PHASE.ACTIVE);

  // remove Assets from AMM
  const removeLiquidityMessage = await E(creatorFacet).removeLiquidityFromAmm();
  t.deepEqual(removeLiquidityMessage, 'Liquidity successfully removed.')

  const [liquidityAmountAllocated, liquidityBrand, centralAmountAllocated, secondaryAmountAllocated, { value: notificationAfterRemoveLiquidity  }] = await Promise.all([
    E(publicFacet).getBalanceByBrand('Liquidity', liquidityIssuer),
    E(liquidityIssuer).getBrand(),
    E(publicFacet).getBalanceByBrand('Central', centralR.issuer),
    E(publicFacet).getBalanceByBrand('Secondary', secondaryR.issuer),
    E(notfierP).getUpdateSince(),
  ]);

  // Check Balances
  t.deepEqual(liquidityAmountAllocated, AmountMath.makeEmpty(liquidityBrand));

  // Check notifier
  t.deepEqual(notificationAfterRemoveLiquidity.phase, ALLOCATION_PHASE.LIQUIDATED);
  t.deepEqual(notificationAfterRemoveLiquidity.lpBalance, liquidityAmountAllocated);
  t.deepEqual(notificationAfterRemoveLiquidity.liquidityBalance.central, centralAmountAllocated);
  t.deepEqual(notificationAfterRemoveLiquidity.liquidityBalance.secondary, secondaryAmountAllocated);

  // test withdraw function
  const withdrawLiquidityInvitation = await E(creatorFacet).makeWithdrawLiquidityInvitation();
  const withdrawProposal = harden({
    want: {
      Central: AmountMath.makeEmpty(centralR.brand),
      Secondary: AmountMath.makeEmpty(secondaryR.brand),
    },
  });

  const withdrawSeat = E(zoe).offer(
    withdrawLiquidityInvitation,
    withdrawProposal,
  );

  const [withdrawLiquidityMessage, withdrawSeatAllocation,] = await Promise.all([
    E(withdrawSeat).getOfferResult(),
    E(withdrawSeat).getCurrentAllocation(),
  ]);

  // Check Offer result and CreatorSeat allocation
  t.deepEqual(withdrawLiquidityMessage, 'Liquidity withdraw to creator seat');
  t.deepEqual(withdrawSeatAllocation.Central, centralInUnit(30n));
  t.deepEqual(withdrawSeatAllocation.Secondary, secondaryInUnit(60n))

  const [withdrawCentralBalance, withdrawSecondaryBalance, withdrawLiquidityBalance,  { value: notificationAfterWithdraw }] = await Promise.all([
    E(publicFacet).getBalanceByBrand('Central', centralIssuer),
    E(publicFacet).getBalanceByBrand('Secondary', secondaryIssuer),
    E(publicFacet).getBalanceByBrand('Liquidity', liquidityIssuer),
    E(notfierP).getUpdateSince(),
  ]);

    // Check notifier
    t.deepEqual(notificationAfterWithdraw.phase, ALLOCATION_PHASE.CLOSED);
    t.deepEqual(notificationAfterWithdraw.lpBalance, withdrawLiquidityBalance);
    t.deepEqual(notificationAfterWithdraw.liquidityBalance.central, withdrawCentralBalance);
    t.deepEqual(notificationAfterWithdraw.liquidityBalance.secondary, withdrawSecondaryBalance);

    t.log(notificationAfterWithdraw);
});

test('boundryWatcher-failed', async (t) => {
  const { zoe, amm, centralR, secondaryR } = await startServices(t);
  const centralInitialValue = 10n;
  const secondaryInitialValue = 20n;

  /** @type XYKAMMPublicFacet */
  const ammPublicFacet = amm.ammPublicFacet;

  const { makeAmountBuilderInUnit } = t.context;

  const { makeAmount: centralInUnit } = makeAmountBuilderInUnit(centralR.brand, centralR.displayInfo);
  const { makeAmount: secondaryInUnit } = makeAmountBuilderInUnit(secondaryR.brand, secondaryR.displayInfo);

  const { /** @type Issuer */ liquidityIssuer } = await startAmmPool(
    zoe,
    ammPublicFacet,
    centralR,
    secondaryR,
    centralInitialValue,
    secondaryInitialValue,
  );

  // Add liquidity offer (secondary:central) 40_000:30_000.
  const centralValue = 30n;
  const secondaryValue = 60n;

  const payout = await addLiquidityToPool(
    zoe,
    ammPublicFacet,
    centralR,
    secondaryR,
    liquidityIssuer,
    centralValue,
    secondaryValue,
  );

  const { Liquidity } = payout;
  const [_, { fromCentral: fromCentralPA }] = await Promise.all([
    E(liquidityIssuer).getAmountOf(Liquidity),
    E(ammPublicFacet).getPriceAuthorities(secondaryR.brand)
  ]);

  const centralIssuer = centralR.issuer;
  const secondaryIssuer = secondaryR.issuer;

  const boundries = await getBoundries(fromCentralPA, centralInUnit(1n), secondaryR.brand);
  trace('Boundries', boundries);

  const devPriceAuthority = makeManualPriceAuthority({
    actualBrandIn: centralR.brand,
    actualBrandOut: secondaryR.brand,
    initialPrice: boundries.base,
    timer: buildManualTimer(console.log),
  });

  const terms = {
    undefined,
    centralIssuer,
    secondaryIssuer,
    liquidityIssuer,
    boundries,
    devPriceAuthority
  };

  const issuerKeywordRecord = harden({
    Central: centralIssuer,
    Secondary: secondaryIssuer,
    Liquidity: liquidityIssuer,
  });

  const { creatorFacet, publicFacet } = await startStopLoss(
    zoe,
    issuerKeywordRecord,
    terms,
  );

  const notifierP = E(creatorFacet).getNotifier();
  const { value: initialNotification } = await E(notifierP).getUpdateSince();

  t.deepEqual(initialNotification.phase, ALLOCATION_PHASE.SCHEDULED);

  E(devPriceAuthority).setPrice(undefined);
  await waitForPromisesToSettle();

  const [liquidityAmountAllocated, liquidityBrand, centralAmountAllocated, secondaryAmountAllocated, { value: notificationAfterBadPrice }] = await Promise.all([
    E(publicFacet).getBalanceByBrand('Liquidity', liquidityIssuer),
    E(liquidityIssuer).getBrand(),
    E(publicFacet).getBalanceByBrand('Central', centralR.issuer),
    E(publicFacet).getBalanceByBrand('Secondary', secondaryR.issuer),
    E(notifierP).getUpdateSince(),
  ]);

  trace('Balances from contract', {
    Liquidity: liquidityAmountAllocated,
    Central: centralAmountAllocated,
    Secondary: secondaryAmountAllocated
  });

  // Check balances
  t.deepEqual(liquidityAmountAllocated, AmountMath.makeEmpty(liquidityBrand));
  t.deepEqual(centralAmountAllocated, AmountMath.makeEmpty(centralR.brand));
  t.deepEqual(secondaryAmountAllocated, AmountMath.makeEmpty(secondaryR.brand));

  // Check notification
  t.deepEqual(notificationAfterBadPrice.phase, ALLOCATION_PHASE.ERROR);
  t.deepEqual(liquidityAmountAllocated, notificationAfterBadPrice.lpBalance);
  t.deepEqual(centralAmountAllocated, notificationAfterBadPrice.liquidityBalance.central);
  t.deepEqual(secondaryAmountAllocated, notificationAfterBadPrice.liquidityBalance.secondary);
});
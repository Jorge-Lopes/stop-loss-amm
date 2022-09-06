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
import { ALLOCATION_PHASE } from '../src/constants.js';

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

// TODO Integrate state checks like the tests 'trigger-lp-removal-price-moves-above-upper' and 'trigger-lp-removal-price-moves-below-lower'
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

  const [centralBalance, secondaryBalance, lpTokenBalance, liquidityBrand, { value: notificationAfterRemoveLiquidity }] = await Promise.all([
    E(publicFacet).getBalanceByBrand('Central', centralIssuer),
    E(publicFacet).getBalanceByBrand('Secondary', secondaryIssuer),
    E(publicFacet).getBalanceByBrand('Amm', liquidityIssuer),
    E(liquidityIssuer).getBrand(),
    E(notfierP).getUpdateSince(),
  ])

  // verify that balance holded in stopLoss seat was correctly updated
  t.deepEqual(centralBalance, centralInUnit(30n));
  t.deepEqual(secondaryBalance, secondaryInUnit(60n));
  t.deepEqual(lpTokenBalance, AmountMath.makeEmpty(liquidityBrand));
  t.deepEqual(notificationAfterRemoveLiquidity.phase, ALLOCATION_PHASE.LIQUIDATED);
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
  const { inputPriceAmountOut: inputPriceAfter, swapInterval }  =
    await moveFromCentralPriceUp(zoe, ammPublicFacet, secondaryR, centralR, liquidityIssuer, boundries.upper, 2n);
  console.log('Done.')

  trace('Input price after', inputPriceAfter);

  const { value: notificationAfterPricePushedToLimit } = await E(notifierP).getUpdateSince();
  t.deepEqual(notificationAfterPricePushedToLimit.phase, ALLOCATION_PHASE.ACTIVE);

  await swapSecondaryForCentral(zoe, ammPublicFacet, secondaryR, centralR, liquidityIssuer, swapInterval);
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
  console.log('BOUNDRIES', boundries);

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

  const { value: notificationAfterPricePushedToLimit } = await E(notfierP).getUpdateSince();
  t.deepEqual(notificationAfterPricePushedToLimit.phase, ALLOCATION_PHASE.ACTIVE);

  // Move the price below the lower boundry
  await swapSecondaryForCentral(zoe, ammPublicFacet, secondaryR, centralR, liquidityIssuer, swapInterval);
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
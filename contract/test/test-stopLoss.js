// @ts-check

import '@agoric/zoe/exported.js';
import '@agoric/zoe/tools/prepare-test-env.js';
import test from 'ava';
import { unsafeMakeBundleCache } from '@agoric/swingset-vat/tools/bundleTool.js';
import { makeTracer } from '@agoric/inter-protocol/src/makeTracer.js';
import {
  addLiquidityToPool,
  startAmmPool,
  startServices,
  startStopLoss,
  swapSecondaryForCentral,
  swapCentralForSecondary, getBoundaries, moveFromCentralPriceUp, moveFromCentralPriceDown,
} from './helper.js';
import { E } from '@endo/far';
import { floorMultiplyBy, makeRatio, makeRatioFromAmounts } from '@agoric/zoe/src/contractSupport/ratio.js';
import { eventLoopIteration } from '@agoric/zoe/tools/eventLoopIteration.js';
import { AmountMath } from '@agoric/ertp';
import { ALLOCATION_PHASE, UPDATED_BOUNDARY_MESSAGE } from '../src/constants.js';
import { makeManualPriceAuthority } from '@agoric/zoe/tools/manualPriceAuthority.js';
import buildManualTimer from '@agoric/zoe/tools/manualTimer.js';
import { getAmountOut } from '@agoric/zoe/src/contractSupport/priceQuote.js';

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

  const { /** @type Issuer */ lpTokenIssuer } = await startAmmPool(
    t,
    zoe,
    ammPublicFacet,
    centralR,
    secondaryR,
    'SCR',
    centralInitialValue,
    secondaryInitialValue,
  );

  const centralValue = 30n;
  const secondaryValue = 60n;

  const payout = await addLiquidityToPool(
    t,
    zoe,
    ammPublicFacet,
    centralR,
    secondaryR,
    lpTokenIssuer,
    centralValue,
    secondaryValue,
  );

  const { Liquidity } = payout;
  const [lpTokenAmount, { fromCentral: fromCentralPA }] = await Promise.all([
    E(lpTokenIssuer).getAmountOf(Liquidity),
    E(ammPublicFacet).getPriceAuthorities(secondaryR.brand)
  ]);

  const centralIssuer = centralR.issuer;
  const secondaryIssuer = secondaryR.issuer;

  const boundaries = await getBoundaries(fromCentralPA, centralInUnit(1n), secondaryR.brand);
  trace('Boundaries', boundaries);

  const terms = {
    ammPublicFacet,
    centralIssuer,
    secondaryIssuer,
    lpTokenIssuer,
    boundaries
  };

  const issuerKeywordRecord = harden({
    Central: centralIssuer,
    Secondary: secondaryIssuer,
    Liquidity: lpTokenIssuer,
  });

  const { creatorFacet, publicFacet } = await startStopLoss(
    zoe,
    issuerKeywordRecord,
    terms,
  );

  const notifierP = E(creatorFacet).getNotifier();
  const { value: initialNotification } = await E(notifierP).getUpdateSince();

  t.deepEqual(initialNotification.phase, ALLOCATION_PHASE.SCHEDULED);

  const lockLpTokensInvitation =
    E(creatorFacet).makeLockLPTokensInvitation();
  const proposal = harden({ give: { Liquidity: lpTokenAmount } });
  const paymentKeywordRecord = harden({ Liquidity: Liquidity });

  const lockLpTokenSeat = await E(zoe).offer(
    lockLpTokensInvitation,
    proposal,
    paymentKeywordRecord,
  );
  const [lockLpTokensMessage, lockLpTokenBalance, { value: notificationAfterLPLock }] = await Promise.all([
    E(lockLpTokenSeat).getOfferResult(),
    E(publicFacet).getBalanceByBrand('Liquidity', lpTokenIssuer),
    E(notifierP).getUpdateSince(),
  ]);

  t.deepEqual(lockLpTokensMessage, `LP Tokens locked in the value of ${lpTokenAmount.value}`);
  t.deepEqual(lockLpTokenBalance, lpTokenAmount); // Make sure the balance in the contract is as expected
  t.deepEqual(notificationAfterLPLock.phase, ALLOCATION_PHASE.ACTIVE);
});

test('Test lock additional LP Tokens to contract', async (t) => {
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

  const { /** @type Issuer */ lpTokenIssuer } = await startAmmPool(
    t,
    zoe,
    ammPublicFacet,
    centralR,
    secondaryR,
    'SCR',
    centralInitialValue,
    secondaryInitialValue,
  );

  const centralValue = 30n;
  const secondaryValue = 60n;

  const payout = await addLiquidityToPool(
    t,
    zoe,
    ammPublicFacet,
    centralR,
    secondaryR,
    lpTokenIssuer,
    centralValue,
    secondaryValue,
  );

  const { Liquidity } = payout;
  const [lpTokenAmount, { fromCentral: fromCentralPA }] = await Promise.all([
    E(lpTokenIssuer).getAmountOf(Liquidity),
    E(ammPublicFacet).getPriceAuthorities(secondaryR.brand)
  ]);

  const centralIssuer = centralR.issuer;
  const secondaryIssuer = secondaryR.issuer;

  const boundaries = await getBoundaries(fromCentralPA, centralInUnit(1n), secondaryR.brand);
  trace('Boundaries', boundaries);

  const terms = {
    ammPublicFacet,
    centralIssuer,
    secondaryIssuer,
    lpTokenIssuer,
    boundaries
  };

  const issuerKeywordRecord = harden({
    Central: centralIssuer,
    Secondary: secondaryIssuer,
    Liquidity: lpTokenIssuer,
  });

  const { creatorFacet, publicFacet } = await startStopLoss(
    zoe,
    issuerKeywordRecord,
    terms,
  );

  const notifierP = E(creatorFacet).getNotifier();
  const { value: initialNotification } = await E(notifierP).getUpdateSince();

  t.deepEqual(initialNotification.phase, ALLOCATION_PHASE.SCHEDULED);

  const lockLpTokensInvitation =
    E(creatorFacet).makeLockLPTokensInvitation();
  const proposal = harden({ give: { Liquidity: lpTokenAmount } });
  const paymentKeywordRecord = harden({ Liquidity: Liquidity });

  const lockLpTokenSeat = await E(zoe).offer(
    lockLpTokensInvitation,
    proposal,
    paymentKeywordRecord,
  );
  const [lockLpTokensMessage, lockLpTokenBalance, { value: notificationAfterLPLock }] = await Promise.all([
    E(lockLpTokenSeat).getOfferResult(),
    E(publicFacet).getBalanceByBrand('Liquidity', lpTokenIssuer),
    E(notifierP).getUpdateSince(),
  ]);

  t.deepEqual(lockLpTokensMessage, `LP Tokens locked in the value of ${lpTokenAmount.value}`);
  t.deepEqual(lockLpTokenBalance, lpTokenAmount); // Make sure the balance in the contract is as expected
  t.deepEqual(notificationAfterLPLock.phase, ALLOCATION_PHASE.ACTIVE);

  // lock additional LP Tokens
  const additionalCentralValue = 20n;
  const additionalSecondaryValue = 40n;

  const additionalPayout = await addLiquidityToPool(
    t,
    zoe,
    ammPublicFacet,
    centralR,
    secondaryR,
    lpTokenIssuer,
    additionalCentralValue,
    additionalSecondaryValue,
  );

  const { Liquidity: additionalLiquidityPayment } = additionalPayout;
  const additionalLpTokenAmount = await E(lpTokenIssuer).getAmountOf(additionalLiquidityPayment);

  const lockAdditionalLpTokensInvitation =
    E(creatorFacet).makeLockLPTokensInvitation();
  const additionalProposal = harden({ give: { Liquidity: additionalLpTokenAmount } });
  const additionalPaymentKeywordRecord = harden({ Liquidity: additionalLiquidityPayment });

  const lockAdditionalLpTokenSeat = await E(zoe).offer(
    lockAdditionalLpTokensInvitation,
    additionalProposal,
    additionalPaymentKeywordRecord,
  );
  const [lockAdditionalLpTokensMessage, lockTotalLpTokenBalance, { value: notificationAfterAdditionalLPLock }] = await Promise.all([
    E(lockAdditionalLpTokenSeat).getOfferResult(),
    E(publicFacet).getBalanceByBrand('Liquidity', lpTokenIssuer),
    E(notifierP).getUpdateSince(),
  ]);

  // The additional LP tokens locked should be equal to the total amount less the previously locked
  const lockAdditionalLpTokenBalance = lockTotalLpTokenBalance.value - lockLpTokenBalance.value;

  t.deepEqual(lockAdditionalLpTokensMessage, `LP Tokens locked in the value of ${additionalLpTokenAmount.value}`);
  t.deepEqual(lockAdditionalLpTokenBalance, additionalLpTokenAmount.value); // Make sure the balance in the contract is as expected
  t.deepEqual(notificationAfterAdditionalLPLock.phase, ALLOCATION_PHASE.ACTIVE);

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

  const { /** @type Issuer */ lpTokenIssuer } = await startAmmPool(
    t,
    zoe,
    ammPublicFacet,
    centralR,
    secondaryR,
    'SCR',
    centralInitialValue,
    secondaryInitialValue,
  );

  const centralValue = 30n;
  const secondaryValue = 60n;

  const payout = await addLiquidityToPool(
    t,
    zoe,
    ammPublicFacet,
    centralR,
    secondaryR,
    lpTokenIssuer,
    centralValue,
    secondaryValue,
  );

  const { Liquidity } = payout;
  const [lpTokenAmount, { fromCentral: fromCentralPA }] = await Promise.all([
    E(lpTokenIssuer).getAmountOf(Liquidity),
    E(ammPublicFacet).getPriceAuthorities(secondaryR.brand)
  ]);

  const centralIssuer = centralR.issuer;
  const secondaryIssuer = secondaryR.issuer;

  const boundaries = await getBoundaries(fromCentralPA, centralInUnit(1n), secondaryR.brand);
  trace('Boundaries', boundaries);

  const terms = {
    ammPublicFacet,
    centralIssuer,
    secondaryIssuer,
    lpTokenIssuer,
    boundaries
  };

  const issuerKeywordRecord = harden({
    Central: centralIssuer,
    Secondary: secondaryIssuer,
    Liquidity: lpTokenIssuer,
  });

  const { creatorFacet, publicFacet } = await startStopLoss(
    zoe,
    issuerKeywordRecord,
    terms,
  );

  const notifierP = E(creatorFacet).getNotifier();
  const { value: initialNotification } = await E(notifierP).getUpdateSince();

  t.deepEqual(initialNotification.phase, ALLOCATION_PHASE.SCHEDULED);

  const lockLpTokensInvitation =
    E(creatorFacet).makeLockLPTokensInvitation();
  const proposal = harden({ give: { Liquidity: lpTokenAmount } });
  const paymentKeywordRecord = harden({ Liquidity: Liquidity });

  const lockLpTokenSeat = await E(zoe).offer(
    lockLpTokensInvitation,
    proposal,
    paymentKeywordRecord,
  );
  const [lockLpTokensMessage, lockLpTokenBalance, { value: notificationAfterLPLock }] = await Promise.all([
    E(lockLpTokenSeat).getOfferResult(),
    E(publicFacet).getBalanceByBrand('Liquidity', lpTokenIssuer),
    E(notifierP).getUpdateSince(),
  ]);

  t.deepEqual(lockLpTokensMessage, `LP Tokens locked in the value of ${lpTokenAmount.value}`);
  t.deepEqual(lockLpTokenBalance, lpTokenAmount); // Make sure the balance in the contract is as expected
  t.deepEqual(notificationAfterLPLock.phase, ALLOCATION_PHASE.ACTIVE);

  console.log('Moving the price up...')
  const { inputPriceAmountOut: inputPriceAfter }  =
    await moveFromCentralPriceUp(zoe, ammPublicFacet, secondaryR, centralR, lpTokenIssuer, boundaries.upper, 2n);
  console.log('Done.')

  trace('Input price after', inputPriceAfter);

  await eventLoopIteration();

  const [lpTokenAmountAllocated, lpTokenBrand, centralAmountAllocated, secondaryAmountAllocated, { value: notificationAfterPriceAboveUpper }] = await Promise.all([
    E(publicFacet).getBalanceByBrand('Liquidity', lpTokenIssuer),
    E(lpTokenIssuer).getBrand(),
    E(publicFacet).getBalanceByBrand('Central', centralR.issuer),
    E(publicFacet).getBalanceByBrand('Secondary', secondaryR.issuer),
    E(notifierP).getUpdateSince(),
  ]);

  trace('Balances from contract', {
    Liquidity: lpTokenAmountAllocated,
    Central: centralAmountAllocated,
    Secondary: secondaryAmountAllocated
  });

  // Check balances
  t.deepEqual(lpTokenAmountAllocated, AmountMath.makeEmpty(lpTokenBrand));
  t.truthy(AmountMath.isGTE(centralInUnit(30n), centralAmountAllocated));
  t.truthy(AmountMath.isGTE(secondaryAmountAllocated, secondaryInUnit(60n)));

  // Check notification
  t.deepEqual(notificationAfterPriceAboveUpper.phase, ALLOCATION_PHASE.REMOVED);
  t.deepEqual(lpTokenAmountAllocated, notificationAfterPriceAboveUpper.lpBalance);
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

  const { /** @type Issuer */ lpTokenIssuer } = await startAmmPool(
    t,
    zoe,
    ammPublicFacet,
    centralR,
    secondaryR,
    'SCR',
    centralInitialValue,
    secondaryInitialValue,
  );

  const centralValue = 30n;
  const secondaryValue = 60n;

  const payout = await addLiquidityToPool(
    t,
    zoe,
    ammPublicFacet,
    centralR,
    secondaryR,
    lpTokenIssuer,
    centralValue,
    secondaryValue,
  );

  const { Liquidity } = payout;
  const [lpTokenAmount, { fromCentral: fromCentralPA }] = await Promise.all([
    E(lpTokenIssuer).getAmountOf(Liquidity),
    E(ammPublicFacet).getPriceAuthorities(secondaryR.brand)
  ]);

  const centralIssuer = centralR.issuer;
  const secondaryIssuer = secondaryR.issuer;

  const boundaries = await getBoundaries(fromCentralPA, centralInUnit(1n), secondaryR.brand);
  trace('Boundaries', boundaries);

  const terms = {
    ammPublicFacet,
    centralIssuer,
    secondaryIssuer,
    lpTokenIssuer,
    boundaries
  };

  const issuerKeywordRecord = harden({
    Central: centralIssuer,
    Secondary: secondaryIssuer,
    Liquidity: lpTokenIssuer,
  });

  const { creatorFacet, publicFacet } = await startStopLoss(
    zoe,
    issuerKeywordRecord,
    terms,
  );

  const notifierP = E(creatorFacet).getNotifier();
  const { value: initialNotification } = await E(notifierP).getUpdateSince();

  t.deepEqual(initialNotification.phase, ALLOCATION_PHASE.SCHEDULED);

  const lockLpTokensInvitation =
    E(creatorFacet).makeLockLPTokensInvitation();
  const proposal = harden({ give: { Liquidity: lpTokenAmount } });
  const paymentKeywordRecord = harden({ Liquidity: Liquidity });

  const lockLpTokenSeat = await E(zoe).offer(
    lockLpTokensInvitation,
    proposal,
    paymentKeywordRecord,
  );
  const [lockLpTokensMessage, lockLpTokenBalance, { value: notificationAfterLPLock }] = await Promise.all([
    E(lockLpTokenSeat).getOfferResult(),
    E(publicFacet).getBalanceByBrand('Liquidity', lpTokenIssuer),
    E(notifierP).getUpdateSince(),
  ]);

  t.deepEqual(lockLpTokensMessage, `LP Tokens locked in the value of ${lpTokenAmount.value}`);
  t.deepEqual(lockLpTokenBalance, lpTokenAmount); // Make sure the balance in the contract is as expected
  t.deepEqual(notificationAfterLPLock.phase, ALLOCATION_PHASE.ACTIVE);

  console.log('Moving the price up...');
  const { inputPriceAmountOut: inputPriceAfter, swapInterval } =
    await moveFromCentralPriceDown(zoe, ammPublicFacet, secondaryR, centralR, lpTokenIssuer, boundaries.lower, 1n);
  console.log('Done.');
  trace('InputPriceAfter', inputPriceAfter);

  await eventLoopIteration();

  const [lpTokenAmountAllocated, lpTokenBrand, centralAmountAllocated, secondaryAmountAllocated, { value: notificationAfterPriceExceedsLimit }] = await Promise.all([
    E(publicFacet).getBalanceByBrand('Liquidity', lpTokenIssuer),
    E(lpTokenIssuer).getBrand(),
    E(publicFacet).getBalanceByBrand('Central', centralR.issuer),
    E(publicFacet).getBalanceByBrand('Secondary', secondaryR.issuer),
    E(notifierP).getUpdateSince(),
  ]);

  trace('Balances from contract', {
    Liquidity: lpTokenAmountAllocated,
    Central: centralAmountAllocated,
    Secondary: secondaryAmountAllocated,
  });

  // Check Balances
  t.deepEqual(lpTokenAmountAllocated, AmountMath.makeEmpty(lpTokenBrand));
  t.truthy(AmountMath.isGTE(centralAmountAllocated, centralInUnit(30n)));
  t.truthy(AmountMath.isGTE(secondaryInUnit(60n), secondaryAmountAllocated));

  // Check notifier
  t.deepEqual(notificationAfterPriceExceedsLimit.phase, ALLOCATION_PHASE.REMOVED);
  t.deepEqual(notificationAfterPriceExceedsLimit.lpBalance, lpTokenAmountAllocated);
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

  const { /** @type Issuer */ lpTokenIssuer } = await startAmmPool(
    t,
    zoe,
    ammPublicFacet,
    centralR,
    secondaryR,
    'SCR',
    centralInitialValue,
    secondaryInitialValue,
  );

  const centralValue = 30n;
  const secondaryValue = 60n;

  const payout = await addLiquidityToPool(
    t,
    zoe,
    ammPublicFacet,
    centralR,
    secondaryR,
    lpTokenIssuer,
    centralValue,
    secondaryValue,
  );

  const { Liquidity } = payout;
  const [lpTokenAmount, { fromCentral: fromCentralPA }] = await Promise.all([
    E(lpTokenIssuer).getAmountOf(Liquidity),
    E(ammPublicFacet).getPriceAuthorities(secondaryR.brand)
  ]);

  const centralIssuer = centralR.issuer;
  const secondaryIssuer = secondaryR.issuer;

  const boundaries = await getBoundaries(fromCentralPA, centralInUnit(1n), secondaryR.brand);
  trace('Boundaries', boundaries);

  const terms = {
    ammPublicFacet,
    centralIssuer,
    secondaryIssuer,
    lpTokenIssuer,
    boundaries
  };

  const issuerKeywordRecord = harden({
    Central: centralIssuer,
    Secondary: secondaryIssuer,
    Liquidity: lpTokenIssuer,
  });

  const { creatorFacet, publicFacet } = await startStopLoss(
    zoe,
    issuerKeywordRecord,
    terms,
  );

  const notifierP = E(creatorFacet).getNotifier();
  const { value: initialNotification } = await E(notifierP).getUpdateSince();

  t.deepEqual(initialNotification.phase, ALLOCATION_PHASE.SCHEDULED);

  const lockLpTokensInvitation =
    E(creatorFacet).makeLockLPTokensInvitation();
  const proposal = harden({ give: { Liquidity: lpTokenAmount } });
  const paymentKeywordRecord = harden({ Liquidity: Liquidity });

  const lockLpTokenSeat = await E(zoe).offer(
    lockLpTokensInvitation,
    proposal,
    paymentKeywordRecord,
  );
  const [lockLpTokensMessage, lockLpTokenBalance, { value: notificationAfterLPLock }] = await Promise.all([
    E(lockLpTokenSeat).getOfferResult(),
    E(publicFacet).getBalanceByBrand('Liquidity', lpTokenIssuer),
    E(notifierP).getUpdateSince(),
  ]);

  t.deepEqual(lockLpTokensMessage, `LP Tokens locked in the value of ${lpTokenAmount.value}`);
  t.deepEqual(lockLpTokenBalance, lpTokenAmount); // Make sure the balance in the contract is as expected
  t.deepEqual(notificationAfterLPLock.phase, ALLOCATION_PHASE.ACTIVE);

  // Move upper boundary by 0,01 Secondary
  const updateMargin = AmountMath.make(
    secondaryR.brand,
    10n ** BigInt(secondaryR.displayInfo.decimalPlaces - 1)); // Update amount is 0,1 Secondary

  const newBoundaries = {
    lower: makeRatioFromAmounts(AmountMath.subtract(boundaries.lower.numerator, updateMargin), centralInUnit(1n)),
    upper: boundaries.upper,
  };

  const updateResult = await E(creatorFacet).updateConfiguration(newBoundaries  );
  t.deepEqual(updateResult, UPDATED_BOUNDARY_MESSAGE);

  console.log('Moving the price down...');
  const { inputPriceAmountOut: inputPriceAfter, swapInterval } =
    await moveFromCentralPriceDown(zoe, ammPublicFacet, secondaryR, centralR, lpTokenIssuer, boundaries.lower, 1n);
  console.log('Done.');
  trace('InputPriceAfter', inputPriceAfter);

  // Check price against boundaries
  t.truthy(AmountMath.isGTE(boundaries.lower.numerator, inputPriceAfter));
  t.truthy(AmountMath.isGTE(inputPriceAfter, newBoundaries.lower.numerator));

  await eventLoopIteration();

  const [lpTokenAmountAllocated, centralAmountAllocated, secondaryAmountAllocated, { value: notificationAfterPriceExceedsLimit }] = await Promise.all([
    E(publicFacet).getBalanceByBrand('Liquidity', lpTokenIssuer),
    E(publicFacet).getBalanceByBrand('Central', centralR.issuer),
    E(publicFacet).getBalanceByBrand('Secondary', secondaryR.issuer),
    E(notifierP).getUpdateSince(),
  ]);

  trace('Balances from contract', {
    Liquidity: lpTokenAmountAllocated,
    Central: centralAmountAllocated,
    Secondary: secondaryAmountAllocated,
  });

  // Check Balances
  t.deepEqual(lpTokenAmountAllocated, lpTokenAmount);
  t.truthy(AmountMath.isEmpty(centralAmountAllocated));
  t.truthy(AmountMath.isEmpty(secondaryAmountAllocated));

  // Check notifier
  t.deepEqual(notificationAfterPriceExceedsLimit.phase, ALLOCATION_PHASE.ACTIVE);
  t.deepEqual(notificationAfterPriceExceedsLimit.lpBalance, lpTokenAmountAllocated);
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

  const { /** @type Issuer */ lpTokenIssuer } = await startAmmPool(
    t,
    zoe,
    ammPublicFacet,
    centralR,
    secondaryR,
    'SCR',
    centralInitialValue,
    secondaryInitialValue,
  );

  const centralValue = 30n;
  const secondaryValue = 60n;

  const payout = await addLiquidityToPool(
    t,
    zoe,
    ammPublicFacet,
    centralR,
    secondaryR,
    lpTokenIssuer,
    centralValue,
    secondaryValue,
  );

  const { Liquidity } = payout;
  const [lpTokenAmount, { fromCentral: fromCentralPA }] = await Promise.all([
    E(lpTokenIssuer).getAmountOf(Liquidity),
    E(ammPublicFacet).getPriceAuthorities(secondaryR.brand)
  ]);

  const centralIssuer = centralR.issuer;
  const secondaryIssuer = secondaryR.issuer;

  const boundaries = await getBoundaries(fromCentralPA, centralInUnit(1n), secondaryR.brand);
  trace('Boundaries', boundaries);

  const terms = {
    ammPublicFacet,
    centralIssuer,
    secondaryIssuer,
    lpTokenIssuer,
    boundaries
  };

  const issuerKeywordRecord = harden({
    Central: centralIssuer,
    Secondary: secondaryIssuer,
    Liquidity: lpTokenIssuer,
  });

  const { creatorFacet, publicFacet } = await startStopLoss(
    zoe,
    issuerKeywordRecord,
    terms,
  );

  const notifierP = E(creatorFacet).getNotifier();
  const { value: initialNotification } = await E(notifierP).getUpdateSince();

  t.deepEqual(initialNotification.phase, ALLOCATION_PHASE.SCHEDULED);

  const lockLpTokensInvitation =
    E(creatorFacet).makeLockLPTokensInvitation();
  const proposal = harden({ give: { Liquidity: lpTokenAmount } });
  const paymentKeywordRecord = harden({ Liquidity: Liquidity });

  const lockLpTokenSeat = await E(zoe).offer(
    lockLpTokensInvitation,
    proposal,
    paymentKeywordRecord,
  );
  const [lockLpTokensMessage, lockLpTokenBalance, { value: notificationAfterLPLock }] = await Promise.all([
    E(lockLpTokenSeat).getOfferResult(),
    E(publicFacet).getBalanceByBrand('Liquidity', lpTokenIssuer),
    E(notifierP).getUpdateSince(),
  ]);

  t.deepEqual(lockLpTokensMessage, `LP Tokens locked in the value of ${lpTokenAmount.value}`);
  t.deepEqual(lockLpTokenBalance, lpTokenAmount); // Make sure the balance in the contract is as expected
  t.deepEqual(notificationAfterLPLock.phase, ALLOCATION_PHASE.ACTIVE);

  // Move upper boundary by 0,01 Secondary
  const updateMargin = AmountMath.make(
    secondaryR.brand,
    10n ** BigInt(secondaryR.displayInfo.decimalPlaces - 1)); // Update amount is 0,1 Secondary

  // newLower = (oldLower.numerator - 0,1 Secodary) / 1 Central
  // newUpper = (oldUpper.numerator + 0,1 Secodary) / 1 Central
  const newBoundaries = {
    lower: makeRatioFromAmounts(AmountMath.subtract(boundaries.lower.numerator, updateMargin), centralInUnit(1n)),
    upper: makeRatioFromAmounts(AmountMath.add(boundaries.upper.numerator, updateMargin), centralInUnit(1n)),
  };

  const updateResult = await E(creatorFacet).updateConfiguration(newBoundaries);
  t.deepEqual(updateResult, UPDATED_BOUNDARY_MESSAGE);

  console.log('Moving the price down...');
  const { inputPriceAmountOut: inputPriceAfter } =
    await moveFromCentralPriceUp(zoe, ammPublicFacet, secondaryR, centralR, lpTokenIssuer, boundaries.upper, 2n);
  console.log('Done.');
  trace('InputPriceAfter', inputPriceAfter);

  // Check price against boundaries
  t.truthy(AmountMath.isGTE(inputPriceAfter, boundaries.upper.numerator));
  t.truthy(AmountMath.isGTE(newBoundaries.upper.numerator, inputPriceAfter));

  await eventLoopIteration();

  const [lpTokenAmountAllocated, centralAmountAllocated, secondaryAmountAllocated, { value: notificationAfterPriceExceedsLimit }] = await Promise.all([
    E(publicFacet).getBalanceByBrand('Liquidity', lpTokenIssuer),
    E(publicFacet).getBalanceByBrand('Central', centralR.issuer),
    E(publicFacet).getBalanceByBrand('Secondary', secondaryR.issuer),
    E(notifierP).getUpdateSince(),
  ]);

  trace('Balances from contract', {
    Liquidity: lpTokenAmountAllocated,
    Central: centralAmountAllocated,
    Secondary: secondaryAmountAllocated,
  });

  // Check Balances
  t.deepEqual(lpTokenAmountAllocated, lpTokenAmount);
  t.truthy(AmountMath.isEmpty(centralAmountAllocated));
  t.truthy(AmountMath.isEmpty(secondaryAmountAllocated));

  // Check notifier
  t.deepEqual(notificationAfterPriceExceedsLimit.phase, ALLOCATION_PHASE.ACTIVE);
  t.deepEqual(notificationAfterPriceExceedsLimit.lpBalance, lpTokenAmountAllocated);
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

  const { /** @type Issuer */ lpTokenIssuer } = await startAmmPool(
    t,
    zoe,
    ammPublicFacet,
    centralR,
    secondaryR,
    'SCR',
    centralInitialValue,
    secondaryInitialValue,
  );

  const centralValue = 30n;
  const secondaryValue = 60n;

  const payout = await addLiquidityToPool(
    t,
    zoe,
    ammPublicFacet,
    centralR,
    secondaryR,
    lpTokenIssuer,
    centralValue,
    secondaryValue,
  );

  const { Liquidity } = payout;
  const [lpTokenAmount, { fromCentral: fromCentralPA }] = await Promise.all([
    E(lpTokenIssuer).getAmountOf(Liquidity),
    E(ammPublicFacet).getPriceAuthorities(secondaryR.brand)
  ]);

  const centralIssuer = centralR.issuer;
  const secondaryIssuer = secondaryR.issuer;

  const boundaries = await getBoundaries(fromCentralPA, centralInUnit(1n), secondaryR.brand);
  trace('Boundaries', boundaries);

  const terms = {
    ammPublicFacet,
    centralIssuer,
    secondaryIssuer,
    lpTokenIssuer,
    boundaries
  };

  const issuerKeywordRecord = harden({
    Central: centralIssuer,
    Secondary: secondaryIssuer,
    Liquidity: lpTokenIssuer,
  });

  const { creatorFacet, publicFacet } = await startStopLoss(
    zoe,
    issuerKeywordRecord,
    terms,
  );

  const notifierP = E(creatorFacet).getNotifier();
  const { value: initialNotification } = await E(notifierP).getUpdateSince();

  t.deepEqual(initialNotification.phase, ALLOCATION_PHASE.SCHEDULED);

  const lockLpTokensInvitation =
    E(creatorFacet).makeLockLPTokensInvitation();
  const proposal = harden({ give: { Liquidity: lpTokenAmount } });
  const paymentKeywordRecord = harden({ Liquidity: Liquidity });

  const lockLpTokenSeat = await E(zoe).offer(
    lockLpTokensInvitation,
    proposal,
    paymentKeywordRecord,
  );
  const [lockLpTokensMessage, lockLpTokenBalance, { value: notificationAfterLPLock }] = await Promise.all([
    E(lockLpTokenSeat).getOfferResult(),
    E(publicFacet).getBalanceByBrand('Liquidity', lpTokenIssuer),
    E(notifierP).getUpdateSince(),
  ]);

  t.deepEqual(lockLpTokensMessage, `LP Tokens locked in the value of ${lpTokenAmount.value}`);
  t.deepEqual(lockLpTokenBalance, lpTokenAmount); // Make sure the balance in the contract is as expected
  t.deepEqual(notificationAfterLPLock.phase, ALLOCATION_PHASE.ACTIVE);

  // Move upper boundary by 0,01 Secondary
  const updateMargin = AmountMath.make(
    secondaryR.brand,
    10n ** BigInt(secondaryR.displayInfo.decimalPlaces - 1)); // Update amount is 0,1 Secondary

  const newBoundaries = {
    lower: makeRatioFromAmounts(AmountMath.subtract(boundaries.lower.numerator, updateMargin), centralInUnit(1n)),
    upper: makeRatioFromAmounts(AmountMath.add(boundaries.upper.numerator, updateMargin), centralInUnit(1n)),
  };

  const updateResult = await E(creatorFacet).updateConfiguration(newBoundaries  );
  t.deepEqual(updateResult, UPDATED_BOUNDARY_MESSAGE);

  console.log('Moving the price up...');
  const { inputPriceAmountOut: inputPriceAfter } =
    await moveFromCentralPriceUp(zoe, ammPublicFacet, secondaryR, centralR, lpTokenIssuer, boundaries.upper, 1n);
  console.log('Done.');
  trace('InputPriceAfter', inputPriceAfter);

  // Check price against boundaries
  t.truthy(AmountMath.isGTE(newBoundaries.upper.numerator, inputPriceAfter));
  t.truthy(AmountMath.isGTE(inputPriceAfter, boundaries.upper.numerator));

  await eventLoopIteration();

  const [lpTokenAmountAllocated, centralAmountAllocated, secondaryAmountAllocated, { value: notificationAfterPriceExceedsOldLimit }] =
    await Promise.all([
      E(publicFacet).getBalanceByBrand('Liquidity', lpTokenIssuer),
      E(publicFacet).getBalanceByBrand('Central', centralR.issuer),
      E(publicFacet).getBalanceByBrand('Secondary', secondaryR.issuer),
      E(notifierP).getUpdateSince(),
    ]);

  trace('Balances from contract', {
    Liquidity: lpTokenAmountAllocated,
    Central: centralAmountAllocated,
    Secondary: secondaryAmountAllocated,
  });

  // Check Balances
  t.deepEqual(lpTokenAmountAllocated, lpTokenAmount);
  t.truthy(AmountMath.isEmpty(centralAmountAllocated));
  t.truthy(AmountMath.isEmpty(secondaryAmountAllocated));

  // Check notifier
  t.deepEqual(notificationAfterPriceExceedsOldLimit.phase, ALLOCATION_PHASE.ACTIVE);
  t.deepEqual(notificationAfterPriceExceedsOldLimit.lpBalance, lpTokenAmountAllocated);
  t.deepEqual(notificationAfterPriceExceedsOldLimit.liquidityBalance.central, centralAmountAllocated);
  t.deepEqual(notificationAfterPriceExceedsOldLimit.liquidityBalance.secondary, secondaryAmountAllocated);

  console.log('Moving the price up...');
  const { inputPriceAmountOut: inputPriceAfterBoundariesUpdated } =
    await moveFromCentralPriceUp(zoe, ammPublicFacet, secondaryR, centralR, lpTokenIssuer, newBoundaries.upper, 1n);
  console.log('Done.');
  trace('inputPriceAfterBoundariesUpdated', inputPriceAfterBoundariesUpdated);

  await eventLoopIteration();

  const [
    lpTokenAmountAllocatedAfterUpdate,
    centralAmountAllocatedAfterUpdate,
    secondaryAmountAllocatedAfterUpdate,
    { value: notificationAfterPriceExceedsLimit }] = await Promise.all([
    E(publicFacet).getBalanceByBrand('Liquidity', lpTokenIssuer),
    E(publicFacet).getBalanceByBrand('Central', centralR.issuer),
    E(publicFacet).getBalanceByBrand('Secondary', secondaryR.issuer),
    E(notifierP).getUpdateSince(),
  ]);

  trace('Balances from contract', {
    Liquidity: lpTokenAmountAllocatedAfterUpdate,
    Central: centralAmountAllocatedAfterUpdate,
    Secondary: secondaryAmountAllocatedAfterUpdate,
  });

  // Check Balances
  t.truthy(AmountMath.isEmpty(lpTokenAmountAllocatedAfterUpdate));
  t.truthy(AmountMath.isGTE(centralInUnit(30n), centralAmountAllocatedAfterUpdate));
  t.truthy(AmountMath.isGTE(secondaryAmountAllocatedAfterUpdate, secondaryInUnit(60n)));

  // Check notifier
  t.deepEqual(notificationAfterPriceExceedsLimit.phase, ALLOCATION_PHASE.REMOVED);
  t.deepEqual(notificationAfterPriceExceedsLimit.lpBalance, lpTokenAmountAllocatedAfterUpdate);
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

  const { /** @type Issuer */ lpTokenIssuer } = await startAmmPool(
    t,
    zoe,
    ammPublicFacet,
    centralR,
    secondaryR,
    'SCR',
    centralInitialValue,
    secondaryInitialValue,
  );

  const centralValue = 30n;
  const secondaryValue = 60n;

  const payout = await addLiquidityToPool(
    t,
    zoe,
    ammPublicFacet,
    centralR,
    secondaryR,
    lpTokenIssuer,
    centralValue,
    secondaryValue,
  );

  const { Liquidity } = payout;
  const [lpTokenAmount, { fromCentral: fromCentralPA }] = await Promise.all([
    E(lpTokenIssuer).getAmountOf(Liquidity),
    E(ammPublicFacet).getPriceAuthorities(secondaryR.brand)
  ]);

  const centralIssuer = centralR.issuer;
  const secondaryIssuer = secondaryR.issuer;

  const boundaries = await getBoundaries(fromCentralPA, centralInUnit(1n), secondaryR.brand);
  trace('Boundaries', boundaries);

  const terms = {
    ammPublicFacet,
    centralIssuer,
    secondaryIssuer,
    lpTokenIssuer,
    boundaries
  };

  const issuerKeywordRecord = harden({
    Central: centralIssuer,
    Secondary: secondaryIssuer,
    Liquidity: lpTokenIssuer,
  });

  const { creatorFacet, publicFacet } = await startStopLoss(
    zoe,
    issuerKeywordRecord,
    terms,
  );

  const notifierP = E(creatorFacet).getNotifier();
  const { value: initialNotification } = await E(notifierP).getUpdateSince();

  t.deepEqual(initialNotification.phase, ALLOCATION_PHASE.SCHEDULED);

  const lockLpTokensInvitation =
    E(creatorFacet).makeLockLPTokensInvitation();
  const proposal = harden({ give: { Liquidity: lpTokenAmount } });
  const paymentKeywordRecord = harden({ Liquidity: Liquidity });

  const lockLpTokenSeat = await E(zoe).offer(
    lockLpTokensInvitation,
    proposal,
    paymentKeywordRecord,
  );
  const [lockLpTokensMessage, lockLpTokenBalance, { value: notificationAfterLPLock }] = await Promise.all([
    E(lockLpTokenSeat).getOfferResult(),
    E(publicFacet).getBalanceByBrand('Liquidity', lpTokenIssuer),
    E(notifierP).getUpdateSince(),
  ]);

  t.deepEqual(lockLpTokensMessage, `LP Tokens locked in the value of ${lpTokenAmount.value}`);
  t.deepEqual(lockLpTokenBalance, lpTokenAmount); // Make sure the balance in the contract is as expected
  t.deepEqual(notificationAfterLPLock.phase, ALLOCATION_PHASE.ACTIVE);

  // Move upper boundary by 0,01 Secondary
  const updateMargin = AmountMath.make(
    secondaryR.brand,
    10n ** BigInt(secondaryR.displayInfo.decimalPlaces - 1)); // Update amount is 0,1 Secondary

  const newBoundaries = {
    lower: makeRatioFromAmounts(AmountMath.subtract(boundaries.lower.numerator, updateMargin), centralInUnit(1n)),
    upper: makeRatioFromAmounts(AmountMath.add(boundaries.upper.numerator, updateMargin), centralInUnit(1n)),
  };

  const updateResult = await E(creatorFacet).updateConfiguration(newBoundaries  );
  t.deepEqual(updateResult, UPDATED_BOUNDARY_MESSAGE);

  console.log('Moving the price down...');
  const { inputPriceAmountOut: inputPriceAfter } =
    await moveFromCentralPriceDown(zoe, ammPublicFacet, secondaryR, centralR, lpTokenIssuer, boundaries.lower, 1n);
  console.log('Done.');
  trace('InputPriceAfter', inputPriceAfter);

  // Check price against boundaries
  t.truthy(AmountMath.isGTE(boundaries.lower.numerator, inputPriceAfter));
  t.truthy(AmountMath.isGTE(inputPriceAfter, newBoundaries.lower.numerator));

  await eventLoopIteration();

  const [lpTokenAmountAllocated, centralAmountAllocated, secondaryAmountAllocated, { value: notificationAfterPriceExceedsOldLimit }] =
    await Promise.all([
      E(publicFacet).getBalanceByBrand('Liquidity', lpTokenIssuer),
      E(publicFacet).getBalanceByBrand('Central', centralR.issuer),
      E(publicFacet).getBalanceByBrand('Secondary', secondaryR.issuer),
      E(notifierP).getUpdateSince(),
    ]);

  trace('Balances from contract', {
    Liquidity: lpTokenAmountAllocated,
    Central: centralAmountAllocated,
    Secondary: secondaryAmountAllocated,
  });

  // Check Balances
  t.deepEqual(lpTokenAmountAllocated, lpTokenAmount);
  t.truthy(AmountMath.isEmpty(centralAmountAllocated));
  t.truthy(AmountMath.isEmpty(secondaryAmountAllocated));

  // Check notifier
  t.deepEqual(notificationAfterPriceExceedsOldLimit.phase, ALLOCATION_PHASE.ACTIVE);
  t.deepEqual(notificationAfterPriceExceedsOldLimit.lpBalance, lpTokenAmountAllocated);
  t.deepEqual(notificationAfterPriceExceedsOldLimit.liquidityBalance.central, centralAmountAllocated);
  t.deepEqual(notificationAfterPriceExceedsOldLimit.liquidityBalance.secondary, secondaryAmountAllocated);

  console.log('Moving the price down...');
  const { inputPriceAmountOut: inputPriceAfterBoundariesUpdated } =
    await moveFromCentralPriceDown(zoe, ammPublicFacet, secondaryR, centralR, lpTokenIssuer, newBoundaries.lower, 1n);
  console.log('Done.');
  trace('inputPriceAfterBoundariesUpdated', inputPriceAfterBoundariesUpdated);

  await eventLoopIteration();

  const [
    lpTokenAmountAllocatedAfterUpdate,
    centralAmountAllocatedAfterUpdate,
    secondaryAmountAllocatedAfterUpdate,
    { value: notificationAfterPriceExceedsLimit }] = await Promise.all([
    E(publicFacet).getBalanceByBrand('Liquidity', lpTokenIssuer),
    E(publicFacet).getBalanceByBrand('Central', centralR.issuer),
    E(publicFacet).getBalanceByBrand('Secondary', secondaryR.issuer),
    E(notifierP).getUpdateSince(),
  ]);

  trace('Balances from contract', {
    Liquidity: lpTokenAmountAllocatedAfterUpdate,
    Central: centralAmountAllocatedAfterUpdate,
    Secondary: secondaryAmountAllocatedAfterUpdate,
  });

  // Check Balances
  t.truthy(AmountMath.isEmpty(lpTokenAmountAllocatedAfterUpdate));
  t.truthy(AmountMath.isGTE(centralAmountAllocatedAfterUpdate, centralInUnit(30n)));
  t.truthy(AmountMath.isGTE(secondaryInUnit(60n), secondaryAmountAllocatedAfterUpdate));

  // Check notifier
  t.deepEqual(notificationAfterPriceExceedsLimit.phase, ALLOCATION_PHASE.REMOVED);
  t.deepEqual(notificationAfterPriceExceedsLimit.lpBalance, lpTokenAmountAllocatedAfterUpdate);
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

  const { /** @type Issuer */ lpTokenIssuer } = await startAmmPool(
    t,
    zoe,
    ammPublicFacet,
    centralR,
    secondaryR,
    'SCR',
    centralInitialValue,
    secondaryInitialValue,
  );

  const centralValue = 30n;
  const secondaryValue = 60n;

  const payout = await addLiquidityToPool(
    t,
    zoe,
    ammPublicFacet,
    centralR,
    secondaryR,
    lpTokenIssuer,
    centralValue,
    secondaryValue,
  );

  const { Liquidity } = payout;
  const [lpTokenAmount, { fromCentral: fromCentralPA }] = await Promise.all([
    E(lpTokenIssuer).getAmountOf(Liquidity),
    E(ammPublicFacet).getPriceAuthorities(secondaryR.brand)
  ]);

  const centralIssuer = centralR.issuer;
  const secondaryIssuer = secondaryR.issuer;

  const boundaries = await getBoundaries(fromCentralPA, centralInUnit(1n), secondaryR.brand);
  trace('Boundaries', boundaries);

  const terms = {
    ammPublicFacet,
    centralIssuer,
    secondaryIssuer,
    lpTokenIssuer,
    boundaries
  };

  const issuerKeywordRecord = harden({
    Central: centralIssuer,
    Secondary: secondaryIssuer,
    Liquidity: lpTokenIssuer,
  });

  const { creatorFacet, publicFacet } = await startStopLoss(
    zoe,
    issuerKeywordRecord,
    terms,
  );

  const notifierP = E(creatorFacet).getNotifier();
  const { value: initialNotification } = await E(notifierP).getUpdateSince();

  t.deepEqual(initialNotification.phase, ALLOCATION_PHASE.SCHEDULED);

  const lockLpTokensInvitation =
    E(creatorFacet).makeLockLPTokensInvitation();
  const proposal = harden({ give: { Liquidity: lpTokenAmount } });
  const paymentKeywordRecord = harden({ Liquidity: Liquidity });

  const lockLpTokenSeat = await E(zoe).offer(
    lockLpTokensInvitation,
    proposal,
    paymentKeywordRecord,
  );
  const [lockLpTokensMessage, lockLpTokenBalance, { value: notificationAfterLPLock }] = await Promise.all([
    E(lockLpTokenSeat).getOfferResult(),
    E(publicFacet).getBalanceByBrand('Liquidity', lpTokenIssuer),
    E(notifierP).getUpdateSince(),
  ]);

  t.deepEqual(lockLpTokensMessage, `LP Tokens locked in the value of ${lpTokenAmount.value}`);
  t.deepEqual(lockLpTokenBalance, lpTokenAmount); // Make sure the balance in the contract is as expected
  t.deepEqual(notificationAfterLPLock.phase, ALLOCATION_PHASE.ACTIVE);

  // Move upper boundary by 0,01 Secondary
  const updateMargin = AmountMath.make(
    secondaryR.brand,
    10n ** BigInt(secondaryR.displayInfo.decimalPlaces - 1)); // Update amount is 0,1 Secondary

  const newBoundaries = {
    lower: makeRatioFromAmounts(AmountMath.subtract(boundaries.lower.numerator, updateMargin), centralInUnit(1n)),
    upper: makeRatioFromAmounts(AmountMath.add(boundaries.upper.numerator, updateMargin), centralInUnit(1n)),
  };

  const updateResult = await E(creatorFacet).updateConfiguration(newBoundaries  );
  t.deepEqual(updateResult, UPDATED_BOUNDARY_MESSAGE);

  console.log('Moving the price down...');
  const { inputPriceAmountOut: inputPriceAfter } =
    await moveFromCentralPriceDown(zoe, ammPublicFacet, secondaryR, centralR, lpTokenIssuer, boundaries.lower, 1n);
  console.log('Done.');
  trace('InputPriceAfter', inputPriceAfter);

  // Check price against boundaries
  t.truthy(AmountMath.isGTE(boundaries.lower.numerator, inputPriceAfter));
  t.truthy(AmountMath.isGTE(inputPriceAfter, newBoundaries.lower.numerator));

  await eventLoopIteration();

  const [lpTokenAmountAllocated, centralAmountAllocated, secondaryAmountAllocated, { value: notificationAfterPriceExceedsOldLimit }] =
    await Promise.all([
      E(publicFacet).getBalanceByBrand('Liquidity', lpTokenIssuer),
      E(publicFacet).getBalanceByBrand('Central', centralR.issuer),
      E(publicFacet).getBalanceByBrand('Secondary', secondaryR.issuer),
      E(notifierP).getUpdateSince(),
    ]);

  trace('Balances from contract', {
    Liquidity: lpTokenAmountAllocated,
    Central: centralAmountAllocated,
    Secondary: secondaryAmountAllocated,
  });

  // Check Balances
  t.deepEqual(lpTokenAmountAllocated, lpTokenAmount);
  t.truthy(AmountMath.isEmpty(centralAmountAllocated));
  t.truthy(AmountMath.isEmpty(secondaryAmountAllocated));

  // Check notifier
  t.deepEqual(notificationAfterPriceExceedsOldLimit.phase, ALLOCATION_PHASE.ACTIVE);
  t.deepEqual(notificationAfterPriceExceedsOldLimit.lpBalance, lpTokenAmountAllocated);
  t.deepEqual(notificationAfterPriceExceedsOldLimit.liquidityBalance.central, centralAmountAllocated);
  t.deepEqual(notificationAfterPriceExceedsOldLimit.liquidityBalance.secondary, secondaryAmountAllocated);

  console.log('Moving the price up...');
  const { inputPriceAmountOut: inputPriceAfterBoundariesUpdated } =
    await moveFromCentralPriceUp(zoe, ammPublicFacet, secondaryR, centralR, lpTokenIssuer, newBoundaries.upper, 1n);
  console.log('Done.');
  trace('inputPriceAfterBoundariesUpdated', inputPriceAfterBoundariesUpdated);

  await eventLoopIteration();

  const [
    lpTokenAmountAllocatedAfterUpdate,
    centralAmountAllocatedAfterUpdate,
    secondaryAmountAllocatedAfterUpdate,
    { value: notificationAfterPriceExceedsLimit }] = await Promise.all([
    E(publicFacet).getBalanceByBrand('Liquidity', lpTokenIssuer),
    E(publicFacet).getBalanceByBrand('Central', centralR.issuer),
    E(publicFacet).getBalanceByBrand('Secondary', secondaryR.issuer),
    E(notifierP).getUpdateSince(),
  ]);

  trace('Balances from contract', {
    Liquidity: lpTokenAmountAllocatedAfterUpdate,
    Central: centralAmountAllocatedAfterUpdate,
    Secondary: secondaryAmountAllocatedAfterUpdate,
  });

  // Check Balances
  t.truthy(AmountMath.isEmpty(lpTokenAmountAllocatedAfterUpdate));
  t.truthy(AmountMath.isGTE(centralInUnit(30n), centralAmountAllocatedAfterUpdate));
  t.truthy(AmountMath.isGTE(secondaryAmountAllocatedAfterUpdate, secondaryInUnit(60n)));

  // Check notifier
  t.deepEqual(notificationAfterPriceExceedsLimit.phase, ALLOCATION_PHASE.REMOVED);
  t.deepEqual(notificationAfterPriceExceedsLimit.lpBalance, lpTokenAmountAllocatedAfterUpdate);
  t.deepEqual(notificationAfterPriceExceedsLimit.liquidityBalance.central, centralAmountAllocatedAfterUpdate);
  t.deepEqual(notificationAfterPriceExceedsLimit.liquidityBalance.secondary, secondaryAmountAllocatedAfterUpdate);
});

test('boundaryWatcher-failed-no-tokens-locked', async (t) => {
  const { zoe, amm, centralR, secondaryR } = await startServices(t);
  const centralInitialValue = 10n;
  const secondaryInitialValue = 20n;

  /** @type XYKAMMPublicFacet */
  const ammPublicFacet = amm.ammPublicFacet;

  const { makeAmountBuilderInUnit } = t.context;

  const { makeAmount: centralInUnit } = makeAmountBuilderInUnit(centralR.brand, centralR.displayInfo);
  const { makeAmount: secondaryInUnit } = makeAmountBuilderInUnit(secondaryR.brand, secondaryR.displayInfo);

  const { /** @type Issuer */ lpTokenIssuer } = await startAmmPool(
    t,
    zoe,
    ammPublicFacet,
    centralR,
    secondaryR,
    'SCR',
    centralInitialValue,
    secondaryInitialValue,
  );

  const centralValue = 30n;
  const secondaryValue = 60n;

  const payout = await addLiquidityToPool(
    t,
    zoe,
    ammPublicFacet,
    centralR,
    secondaryR,
    lpTokenIssuer,
    centralValue,
    secondaryValue,
  );

  const { Liquidity } = payout;
  const [_, { fromCentral: fromCentralPA }] = await Promise.all([
    E(lpTokenIssuer).getAmountOf(Liquidity),
    E(ammPublicFacet).getPriceAuthorities(secondaryR.brand)
  ]);

  const centralIssuer = centralR.issuer;
  const secondaryIssuer = secondaryR.issuer;

  const boundaries = await getBoundaries(fromCentralPA, centralInUnit(1n), secondaryR.brand);
  trace('Boundaries', boundaries);

  const devPriceAuthority = makeManualPriceAuthority({
    actualBrandIn: centralR.brand,
    actualBrandOut: secondaryR.brand,
    initialPrice: boundaries.base,
    timer: buildManualTimer(console.log),
  });

  const terms = {
    undefined,
    centralIssuer,
    secondaryIssuer,
    lpTokenIssuer,
    boundaries,
    devPriceAuthority
  };

  const issuerKeywordRecord = harden({
    Central: centralIssuer,
    Secondary: secondaryIssuer,
    Liquidity: lpTokenIssuer,
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
  await eventLoopIteration();

  const [lpTokenAmountAllocated, lpTokenBrand, centralAmountAllocated, secondaryAmountAllocated, { value: notificationAfterBadPrice }] = await Promise.all([
    E(publicFacet).getBalanceByBrand('Liquidity', lpTokenIssuer),
    E(lpTokenIssuer).getBrand(),
    E(publicFacet).getBalanceByBrand('Central', centralR.issuer),
    E(publicFacet).getBalanceByBrand('Secondary', secondaryR.issuer),
    E(notifierP).getUpdateSince(),
  ]);

  trace('Balances from contract', {
    Liquidity: lpTokenAmountAllocated,
    Central: centralAmountAllocated,
    Secondary: secondaryAmountAllocated
  });

  // Check balances
  t.deepEqual(lpTokenAmountAllocated, AmountMath.makeEmpty(lpTokenBrand));
  t.deepEqual(centralAmountAllocated, AmountMath.makeEmpty(centralR.brand));
  t.deepEqual(secondaryAmountAllocated, AmountMath.makeEmpty(secondaryR.brand));

  // Check notification
  t.deepEqual(notificationAfterBadPrice.phase, ALLOCATION_PHASE.ERROR);
  t.deepEqual(lpTokenAmountAllocated, notificationAfterBadPrice.lpBalance);
  t.deepEqual(centralAmountAllocated, notificationAfterBadPrice.liquidityBalance.central);
  t.deepEqual(secondaryAmountAllocated, notificationAfterBadPrice.liquidityBalance.secondary);
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

  const { /** @type Issuer */ lpTokenIssuer } = await startAmmPool(
    t,
    zoe,
    ammPublicFacet,
    centralR,
    secondaryR,
    'SCR',
    centralInitialValue,
    secondaryInitialValue,
  );

  const centralValue = 30n;
  const secondaryValue = 60n;

  const payout = await addLiquidityToPool(
    t,
    zoe,
    ammPublicFacet,
    centralR,
    secondaryR,
    lpTokenIssuer,
    centralValue,
    secondaryValue,
  );

  const { Liquidity } = payout;
  const [lpTokenAmount, { fromCentral: fromCentralPA }] = await Promise.all([
    E(lpTokenIssuer).getAmountOf(Liquidity),
    E(ammPublicFacet).getPriceAuthorities(secondaryR.brand)
  ]);

  const centralIssuer = centralR.issuer;
  const secondaryIssuer = secondaryR.issuer;

  const boundaries = await getBoundaries(fromCentralPA, centralInUnit(1n), secondaryR.brand);

  const terms = {
    ammPublicFacet,
    centralIssuer,
    secondaryIssuer,
    lpTokenIssuer,
    boundaries
  };

  const issuerKeywordRecord = harden({
    Central: centralIssuer,
    Secondary: secondaryIssuer,
    Liquidity: lpTokenIssuer,
  });

  const { creatorFacet, publicFacet } = await startStopLoss(
    zoe,
    issuerKeywordRecord,
    terms,
  );

  const notifierP = E(creatorFacet).getNotifier();
  const { value: initialNotification } = await E(notifierP).getUpdateSince();

  t.deepEqual(initialNotification.phase, ALLOCATION_PHASE.SCHEDULED);

  const lockLpTokensInvitation =
    E(creatorFacet).makeLockLPTokensInvitation();
  const proposal = harden({ give: { Liquidity: lpTokenAmount } });
  const paymentKeywordRecord = harden({ Liquidity: Liquidity });

  const lockLpTokenSeat = await E(zoe).offer(
    lockLpTokensInvitation,
    proposal,
    paymentKeywordRecord,
  );
  const [lockLpTokensMessage, lockLpTokenBalance, { value: notificationAfterLPLock }] = await Promise.all([
    E(lockLpTokenSeat).getOfferResult(),
    E(publicFacet).getBalanceByBrand('Liquidity', lpTokenIssuer),
    E(notifierP).getUpdateSince(),
  ]);

  t.deepEqual(lockLpTokensMessage, `LP Tokens locked in the value of ${lpTokenAmount.value}`);
  t.deepEqual(lockLpTokenBalance, lpTokenAmount); // Make sure the balance in the contract is as expected
  t.deepEqual(notificationAfterLPLock.phase, ALLOCATION_PHASE.ACTIVE);

  // test withdraw function
  const withdrawLiquidityInvitation = await E(creatorFacet).makeWithdrawLiquidityInvitation();
  const withdrawProposal = harden({
    want: {
      Central: AmountMath.makeEmpty(centralR.brand),
      Secondary: AmountMath.makeEmpty(secondaryR.brand),
    },
  });

  /** @type UserSeat */
  const withdrawSeat = E(zoe).offer(
    withdrawLiquidityInvitation,
    withdrawProposal,
  );

  // Check Offer result and creator seat allocation
  const withdrawLiquidityMessage = await E(withdrawSeat).getOfferResult();
  t.deepEqual(withdrawLiquidityMessage, 'Liquidity withdraw to creator seat');

  const withdrawSeatAllocation = await E(withdrawSeat).getCurrentAllocationJig();
  t.deepEqual(withdrawSeatAllocation.Central, centralInUnit(30n));
  t.deepEqual(withdrawSeatAllocation.Secondary, secondaryInUnit(60n))

  const [withdrawCentralBalance, withdrawSecondaryBalance, withdrawLiquidityBalance,  { value: notificationAfterWithdraw }] = await Promise.all([
    E(publicFacet).getBalanceByBrand('Central', centralIssuer),
    E(publicFacet).getBalanceByBrand('Secondary', secondaryIssuer),
    E(publicFacet).getBalanceByBrand('Liquidity', lpTokenIssuer),
    E(notifierP).getUpdateSince(),
  ]);

    // Check notifier
    t.deepEqual(notificationAfterWithdraw.phase, ALLOCATION_PHASE.WITHDRAWN);
    t.deepEqual(notificationAfterWithdraw.lpBalance, withdrawLiquidityBalance);
    t.deepEqual(notificationAfterWithdraw.liquidityBalance.central, withdrawCentralBalance);
    t.deepEqual(notificationAfterWithdraw.liquidityBalance.secondary, withdrawSecondaryBalance);
});

test('Test withdraw LP Tokens while locked', async (t) => {
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
  const { makeAmount: liquidityInUnit } = makeAmountBuilderInUnit(secondaryR.brand, secondaryR.displayInfo);

  const { /** @type Issuer */ lpTokenIssuer } = await startAmmPool(
    t,
    zoe,
    ammPublicFacet,
    centralR,
    secondaryR,
    'SCR',
    centralInitialValue,
    secondaryInitialValue,
  );

  const centralValue = 30n;
  const secondaryValue = 60n;

  const payout = await addLiquidityToPool(
    t,
    zoe,
    ammPublicFacet,
    centralR,
    secondaryR,
    lpTokenIssuer,
    centralValue,
    secondaryValue,
  );

  const { Liquidity } = payout;
  const [lpTokenAmount, { fromCentral: fromCentralPA }] = await Promise.all([
    E(lpTokenIssuer).getAmountOf(Liquidity),
    E(ammPublicFacet).getPriceAuthorities(secondaryR.brand)
  ]);

  const centralIssuer = centralR.issuer;
  const secondaryIssuer = secondaryR.issuer;

  const boundaries = await getBoundaries(fromCentralPA, centralInUnit(1n), secondaryR.brand);

  const terms = {
    ammPublicFacet,
    centralIssuer,
    secondaryIssuer,
    lpTokenIssuer,
    boundaries
  };

  const issuerKeywordRecord = harden({
    Central: centralIssuer,
    Secondary: secondaryIssuer,
    Liquidity: lpTokenIssuer,
  });

  const { creatorFacet, publicFacet } = await startStopLoss(
    zoe,
    issuerKeywordRecord,
    terms,
  );

  const notifierP = E(creatorFacet).getNotifier();
  const { value: initialNotification } = await E(notifierP).getUpdateSince();

  t.deepEqual(initialNotification.phase, ALLOCATION_PHASE.SCHEDULED);

  const lockLpTokensInvitation =
    E(creatorFacet).makeLockLPTokensInvitation();
  const proposal = harden({ give: { Liquidity: lpTokenAmount } });
  const paymentKeywordRecord = harden({ Liquidity: Liquidity });

  const lockLpTokenSeat = await E(zoe).offer(
    lockLpTokensInvitation,
    proposal,
    paymentKeywordRecord,
  );
  const [lockLpTokensMessage, lockLpTokenBalance, { value: notificationAfterLPLock }] = await Promise.all([
    E(lockLpTokenSeat).getOfferResult(),
    E(publicFacet).getBalanceByBrand('Liquidity', lpTokenIssuer),
    E(notifierP).getUpdateSince(),
  ]);

  t.deepEqual(lockLpTokensMessage, `LP Tokens locked in the value of ${lpTokenAmount.value}`);
  t.deepEqual(lockLpTokenBalance, lpTokenAmount); // Make sure the balance in the contract is as expected
  t.deepEqual(notificationAfterLPLock.phase, ALLOCATION_PHASE.ACTIVE);

  const lpTokenBrand = await E(lpTokenIssuer).getBrand();

  const withdrawLpTokensInvitation = await E(creatorFacet).makeWithdrawLpTokensInvitation();
  const withdrawProposal = harden({want: { Liquidity: AmountMath.makeEmpty(lpTokenBrand)}});

  /** @type UserSeat */
  const withdrawLpSeat = E(zoe).offer(
    withdrawLpTokensInvitation,
    withdrawProposal,
  );

  const [withdrawLpTokenMessage, withdrawLpSeatAllocation] = await Promise.all([
    E(withdrawLpSeat).getOfferResult(),
    E(withdrawLpSeat).getCurrentAllocationJig(),
  ]);

  // Check Offer result and creator seat allocation
  t.deepEqual(withdrawLpTokenMessage, 'LP Tokens withdraw to creator seat');
  t.deepEqual(withdrawLpSeatAllocation.Liquidity.value, 3000000000n);

  const [ withdrawLiquidityBalance,  { value: notificationAfterWithdraw }] = await Promise.all([
    E(publicFacet).getBalanceByBrand('Liquidity', lpTokenIssuer),
    E(notifierP).getUpdateSince(),
  ]);

  // Check notifier
  t.deepEqual(notificationAfterWithdraw.phase, ALLOCATION_PHASE.WITHDRAWN);
  t.deepEqual(notificationAfterWithdraw.lpBalance, withdrawLiquidityBalance);





});

test('update-boundaries-outside-of-price-ratio', async (t) => {
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

  const { /** @type Issuer */ lpTokenIssuer } = await startAmmPool(
    t,
    zoe,
    ammPublicFacet,
    centralR,
    secondaryR,
    'SCR',
    centralInitialValue,
    secondaryInitialValue,
  );

  const centralValue = 30n;
  const secondaryValue = 60n;

  const payout = await addLiquidityToPool(
    t,
    zoe,
    ammPublicFacet,
    centralR,
    secondaryR,
    lpTokenIssuer,
    centralValue,
    secondaryValue,
  );

  const { Liquidity } = payout;
  const [lpTokenAmount, { fromCentral: fromCentralPA }] = await Promise.all([
    E(lpTokenIssuer).getAmountOf(Liquidity),
    E(ammPublicFacet).getPriceAuthorities(secondaryR.brand)
  ]);

  const centralIssuer = centralR.issuer;
  const secondaryIssuer = secondaryR.issuer;

  const boundaries = await getBoundaries(fromCentralPA, centralInUnit(1n), secondaryR.brand);
  trace('Boundaries', boundaries);

  const terms = {
    ammPublicFacet,
    centralIssuer,
    secondaryIssuer,
    lpTokenIssuer,
    boundaries
  };

  const issuerKeywordRecord = harden({
    Central: centralIssuer,
    Secondary: secondaryIssuer,
    Liquidity: lpTokenIssuer,
  });

  const { creatorFacet, publicFacet } = await startStopLoss(
    zoe,
    issuerKeywordRecord,
    terms,
  );

  const notifierP = E(creatorFacet).getNotifier();
  const { value: initialNotification } = await E(notifierP).getUpdateSince();

  t.deepEqual(initialNotification.phase, ALLOCATION_PHASE.SCHEDULED);

  const lockLpTokensInvitation =
    E(creatorFacet).makeLockLPTokensInvitation();
  const proposal = harden({ give: { Liquidity: lpTokenAmount } });
  const paymentKeywordRecord = harden({ Liquidity: Liquidity });

  const lockLpTokenSeat = await E(zoe).offer(
    lockLpTokensInvitation,
    proposal,
    paymentKeywordRecord,
  );
  const [lockLpTokensMessage, lockLpTokenBalance, { value: notificationAfterLPLock }] = await Promise.all([
    E(lockLpTokenSeat).getOfferResult(),
    E(publicFacet).getBalanceByBrand('Liquidity', lpTokenIssuer),
    E(notifierP).getUpdateSince(),
  ]);

  t.deepEqual(lockLpTokensMessage, `LP Tokens locked in the value of ${lpTokenAmount.value}`);
  t.deepEqual(lockLpTokenBalance, lpTokenAmount); // Make sure the balance in the contract is as expected
  t.deepEqual(notificationAfterLPLock.phase, ALLOCATION_PHASE.ACTIVE);


  // Increase both bandaries so its range is higher than current price ratio
  const updateMargin = AmountMath.make(
    secondaryR.brand,
    10n ** BigInt(secondaryR.displayInfo.decimalPlaces));

  const newBoundaries = {
    lower: makeRatioFromAmounts(AmountMath.add(boundaries.lower.numerator, updateMargin), centralInUnit(1n)),
    upper: makeRatioFromAmounts(AmountMath.add(boundaries.upper.numerator, updateMargin), centralInUnit(1n)),
  };

  const updateResult = await E(creatorFacet).updateConfiguration(newBoundaries  );
  t.deepEqual(updateResult, UPDATED_BOUNDARY_MESSAGE);

  await eventLoopIteration();

  const [lpTokenAmountAllocated, centralAmountAllocated, secondaryAmountAllocated, { value: notificationAfterPriceExceedsLimit }] = await Promise.all([
    E(publicFacet).getBalanceByBrand('Liquidity', lpTokenIssuer),
    E(publicFacet).getBalanceByBrand('Central', centralR.issuer),
    E(publicFacet).getBalanceByBrand('Secondary', secondaryR.issuer),
    E(notifierP).getUpdateSince(),
  ]);

  trace('Balances from contract', {
    Liquidity: lpTokenAmountAllocated,
    Central: centralAmountAllocated,
    Secondary: secondaryAmountAllocated,
  });

  // Check Balances
  t.truthy(AmountMath.isEmpty(lpTokenAmountAllocated));
  t.deepEqual(centralAmountAllocated, centralInUnit(30n));
  t.deepEqual(secondaryAmountAllocated, secondaryInUnit(60n))

  // Check notifier
  t.deepEqual(notificationAfterPriceExceedsLimit.phase, ALLOCATION_PHASE.REMOVED);
  t.deepEqual(notificationAfterPriceExceedsLimit.lpBalance, lpTokenAmountAllocated);
  t.deepEqual(notificationAfterPriceExceedsLimit.liquidityBalance.central, centralAmountAllocated);
  t.deepEqual(notificationAfterPriceExceedsLimit.liquidityBalance.secondary, secondaryAmountAllocated);
});

test('initiate-stoploss-with-boundaries-outside-of-price-ratio', async (t) => {
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

  const { /** @type Issuer */ lpTokenIssuer } = await startAmmPool(
    t,
    zoe,
    ammPublicFacet,
    centralR,
    secondaryR,
    'SCR',
    centralInitialValue,
    secondaryInitialValue,
  );

  const centralValue = 30n;
  const secondaryValue = 60n;

  const payout = await addLiquidityToPool(
    t,
    zoe,
    ammPublicFacet,
    centralR,
    secondaryR,
    lpTokenIssuer,
    centralValue,
    secondaryValue,
  );

  const { Liquidity } = payout;
  const [lpTokenAmount, { fromCentral: fromCentralPA }] = await Promise.all([
    E(lpTokenIssuer).getAmountOf(Liquidity),
    E(ammPublicFacet).getPriceAuthorities(secondaryR.brand)
  ]);

  const centralIssuer = centralR.issuer;
  const secondaryIssuer = secondaryR.issuer;

  const getBoundaries = async (
    fromCentralPA,
    centralAmountIn,
    secondaryBrand,
    boundaryMarginValue = 20n,
  ) => {
    const quote = await E(fromCentralPA).quoteGiven(
      centralAmountIn,
      secondaryBrand,
    );
  
    const boundaryMarginRatio = makeRatio(boundaryMarginValue, secondaryBrand);
    const baseAmountOut = getAmountOut(quote);
    const marginAmount = floorMultiplyBy(baseAmountOut, boundaryMarginRatio);
  
    return {
      lower: makeRatioFromAmounts(
        AmountMath.add(baseAmountOut, marginAmount),
        centralAmountIn,
      ),
      upper: makeRatioFromAmounts(
        AmountMath.add(baseAmountOut, AmountMath.add(marginAmount, marginAmount)),
        centralAmountIn,
      ),
      base: makeRatioFromAmounts(baseAmountOut, centralAmountIn),
      marginAmount,
    };
  };

  const boundaries = await getBoundaries(fromCentralPA, centralInUnit(1n), secondaryR.brand);
  trace('Boundaries', boundaries);

  const terms = {
    ammPublicFacet,
    centralIssuer,
    secondaryIssuer,
    lpTokenIssuer,
    boundaries
  };

  const issuerKeywordRecord = harden({
    Central: centralIssuer,
    Secondary: secondaryIssuer,
    Liquidity: lpTokenIssuer,
  });

  const testingPromise = startStopLoss(
    zoe,
    issuerKeywordRecord,
    terms,
  );

  await t.throwsAsync(() => testingPromise, {message: 'Lower boundary should be lower or equal to current price: "[194539438n]"'});
});

test('remove-liquidity-failed', async (t) => {
  const { zoe, amm, centralR, secondaryR } = await startServices(t);
  const centralInitialValue = 10n;
  const secondaryInitialValue = 20n;

  /** @type XYKAMMPublicFacet */
  const ammPublicFacet = amm.ammPublicFacet;

  const { makeAmountBuilderInUnit } = t.context;

  const { makeAmount: centralInUnit } = makeAmountBuilderInUnit(centralR.brand, centralR.displayInfo);
  const { makeAmount: secondaryInUnit } = makeAmountBuilderInUnit(secondaryR.brand, secondaryR.displayInfo);

  const { /** @type Issuer */ lpTokenIssuer } = await startAmmPool(
    t,
    zoe,
    ammPublicFacet,
    centralR,
    secondaryR,
    'SCR',
    centralInitialValue,
    secondaryInitialValue,
  );

  const centralValue = 30n;
  const secondaryValue = 60n;

  const payout = await addLiquidityToPool(
    t,
    zoe,
    ammPublicFacet,
    centralR,
    secondaryR,
    lpTokenIssuer,
    centralValue,
    secondaryValue,
  );

  const { Liquidity } = payout;
  const [lpTokenAmount, { fromCentral: fromCentralPA }] = await Promise.all([
    E(lpTokenIssuer).getAmountOf(Liquidity),
    E(ammPublicFacet).getPriceAuthorities(secondaryR.brand)
  ]);

  const centralIssuer = centralR.issuer;
  const secondaryIssuer = secondaryR.issuer;

  const boundaries = await getBoundaries(fromCentralPA, centralInUnit(1n), secondaryR.brand);
  trace('Boundaries', boundaries);

  const devPriceAuthority = makeManualPriceAuthority({
    actualBrandIn: centralR.brand,
    actualBrandOut: secondaryR.brand,
    initialPrice: boundaries.base,
    timer: buildManualTimer(console.log),
  });

  const terms = {
    undefined,
    centralIssuer,
    secondaryIssuer,
    lpTokenIssuer,
    boundaries,
    devPriceAuthority
  };

  const issuerKeywordRecord = harden({
    Central: centralIssuer,
    Secondary: secondaryIssuer,
    Liquidity: lpTokenIssuer,
  });

  const { creatorFacet, publicFacet } = await startStopLoss(
    zoe,
    issuerKeywordRecord,
    terms,
  );

  const notifierP = E(creatorFacet).getNotifier();
  const { value: initialNotification } = await E(notifierP).getUpdateSince();
  t.log("notifier 1 ", initialNotification)

  t.deepEqual(initialNotification.phase, ALLOCATION_PHASE.SCHEDULED);

  const lockLpTokensInvitation =
    E(creatorFacet).makeLockLPTokensInvitation();
  const proposal = harden({ give: { Liquidity: lpTokenAmount } });
  const paymentKeywordRecord = harden({ Liquidity: Liquidity });

  const lockLpTokenSeat = await E(zoe).offer(
    lockLpTokensInvitation,
    proposal,
    paymentKeywordRecord,
  );
  const [lockLpTokensMessage, lockLpTokenBalance, { value: notificationAfterLPLock }] = await Promise.all([
    E(lockLpTokenSeat).getOfferResult(),
    E(publicFacet).getBalanceByBrand('Liquidity', lpTokenIssuer),
    E(notifierP).getUpdateSince(),
  ]);
  t.log("notifier 2 ", notificationAfterLPLock)

  t.deepEqual(lockLpTokensMessage, `LP Tokens locked in the value of ${lpTokenAmount.value}`);
  t.deepEqual(lockLpTokenBalance, lpTokenAmount); // Make sure the balance in the contract is as expected
  t.deepEqual(notificationAfterLPLock.phase, ALLOCATION_PHASE.ACTIVE);

  // update price to move above upper boundary
  const updatedPrice = makeRatioFromAmounts(secondaryInUnit(50n), boundaries.base.denominator);
  E(devPriceAuthority).setPrice(updatedPrice);
  await eventLoopIteration();

  const [lpTokenAmountAllocated, lpTokenBrand, centralAmountAllocated, secondaryAmountAllocated, { value: notificationAfterPriceAboveUpper }] = await Promise.all([
    E(publicFacet).getBalanceByBrand('Liquidity', lpTokenIssuer),
    E(lpTokenIssuer).getBrand(),
    E(publicFacet).getBalanceByBrand('Central', centralR.issuer),
    E(publicFacet).getBalanceByBrand('Secondary', secondaryR.issuer),
    E(notifierP).getUpdateSince(),
  ]);
  t.log("notifier 3 ", notificationAfterPriceAboveUpper)

  trace('Balances from contract', {
    Liquidity: lpTokenAmountAllocated,
    Central: centralAmountAllocated,
    Secondary: secondaryAmountAllocated
  });

  // Check balances
  t.deepEqual(lpTokenAmountAllocated, lockLpTokenBalance);

  // Check notification
  t.deepEqual(notificationAfterPriceAboveUpper.phase, ALLOCATION_PHASE.ERROR);
  t.deepEqual(lpTokenAmountAllocated, notificationAfterPriceAboveUpper.lpBalance);
  t.deepEqual(centralAmountAllocated, notificationAfterPriceAboveUpper.liquidityBalance.central);
  t.deepEqual(secondaryAmountAllocated, notificationAfterPriceAboveUpper.liquidityBalance.secondary);
});
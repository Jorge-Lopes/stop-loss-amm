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
  swapCentralForSecondary,
  getBoundaries,
  updateBoundariesAndCheckResult, differenceInPercent, moveFromCentralPriceDownOneTrade, moveFromCentralPriceUpOneTrade,
} from './helper.js';
import { E } from '@endo/far';
import {
  floorDivideBy,
  floorMultiplyBy,
  makeRatio,
  makeRatioFromAmounts,
  quantize,
} from '@agoric/zoe/src/contractSupport/ratio.js';
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

test('lock-lpTokens', async (t) => {
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

  const { Liquidity: lpTokenPayment } = payout;
  const [lpTokenAmount, { fromCentral: fromCentralPA }] = await Promise.all([
    E(lpTokenIssuer).getAmountOf(lpTokenPayment),
    E(ammPublicFacet).getPriceAuthorities(secondaryR.brand),
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
    boundaries,
  };

  const issuerKeywordRecord = harden({
    Central: centralIssuer,
    Secondary: secondaryIssuer,
    LpToken: lpTokenIssuer,
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
  const proposal = harden({ give: { LpToken: lpTokenAmount } });
  const paymentKeywordRecord = harden({ LpToken: lpTokenPayment });

  const lockLpTokenSeat = await E(zoe).offer(
    lockLpTokensInvitation,
    proposal,
    paymentKeywordRecord,
  );
  const [lockLpTokensMessage, lockLpTokenBalance, { value: notificationAfterLPLock }] = await Promise.all([
    E(lockLpTokenSeat).getOfferResult(),
    E(publicFacet).getBalanceByBrand('LpToken', lpTokenIssuer),
    E(notifierP).getUpdateSince(),
  ]);

  t.deepEqual(lockLpTokensMessage, `LP Tokens locked in the value of ${lpTokenAmount.value}`);
  t.deepEqual(lockLpTokenBalance, lpTokenAmount); // Make sure the balance in the contract is as expected
  t.deepEqual(notificationAfterLPLock.phase, ALLOCATION_PHASE.ACTIVE);
});

test('lock-additional-lpTokens', async (t) => {
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

  const { Liquidity: lpTokenPayment } = payout;
  const [lpTokenAmount, { fromCentral: fromCentralPA }] = await Promise.all([
    E(lpTokenIssuer).getAmountOf(lpTokenPayment),
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
    boundaries,
  };

  const issuerKeywordRecord = harden({
    Central: centralIssuer,
    Secondary: secondaryIssuer,
    LpToken: lpTokenIssuer,
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
  const proposal = harden({ give: { LpToken: lpTokenAmount } });
  const paymentKeywordRecord = harden({ LpToken: lpTokenPayment });

  const lockLpTokenSeat = await E(zoe).offer(
    lockLpTokensInvitation,
    proposal,
    paymentKeywordRecord,
  );
  const [lockLpTokensMessage, lockLpTokenBalance, { value: notificationAfterLPLock }] = await Promise.all([
    E(lockLpTokenSeat).getOfferResult(),
    E(publicFacet).getBalanceByBrand('LpToken', lpTokenIssuer),
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

  const { Liquidity: additionalLpTokenPayment } = additionalPayout;
  const additionalLpTokenAmount = await E(lpTokenIssuer).getAmountOf(additionalLpTokenPayment);

  const lockAdditionalLpTokensInvitation =
    E(creatorFacet).makeLockLPTokensInvitation();
  const additionalProposal = harden({ give: { LpToken: additionalLpTokenAmount } });
  const additionalPaymentKeywordRecord = harden({ LpToken: additionalLpTokenPayment });

  const lockAdditionalLpTokenSeat = await E(zoe).offer(
    lockAdditionalLpTokensInvitation,
    additionalProposal,
    additionalPaymentKeywordRecord,
  );
  const [lockAdditionalLpTokensMessage, lockTotalLpTokenBalance, { value: notificationAfterAdditionalLPLock }] = await Promise.all([
    E(lockAdditionalLpTokenSeat).getOfferResult(),
    E(publicFacet).getBalanceByBrand('LpToken', lpTokenIssuer),
    E(notifierP).getUpdateSince(),
  ]);

  // The additional LP tokens locked should be equal to the total amount less the previously locked
  const lockAdditionalLpTokenBalance = lockTotalLpTokenBalance.value - lockLpTokenBalance.value;

  t.deepEqual(lockAdditionalLpTokensMessage, `LP Tokens locked in the value of ${additionalLpTokenAmount.value}`);
  t.deepEqual(lockAdditionalLpTokenBalance, additionalLpTokenAmount.value); // Make sure the balance in the contract is as expected
  t.deepEqual(notificationAfterAdditionalLPLock.phase, ALLOCATION_PHASE.ACTIVE);

});

test('withdraw-locked-LpTokens ', async (t) => {
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

  const { Liquidity: lpTokenPayment } = payout;
  const [lpTokenAmount, { fromCentral: fromCentralPA }] = await Promise.all([
    E(lpTokenIssuer).getAmountOf(lpTokenPayment),
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
    LpToken: lpTokenIssuer,
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
  const proposal = harden({ give: { LpToken: lpTokenAmount } });
  const paymentKeywordRecord = harden({ LpToken: lpTokenPayment });

  const lockLpTokenSeat = await E(zoe).offer(
    lockLpTokensInvitation,
    proposal,
    paymentKeywordRecord,
  );
  const [lockLpTokensMessage, lockLpTokenBalance, { value: notificationAfterLPLock }] = await Promise.all([
    E(lockLpTokenSeat).getOfferResult(),
    E(publicFacet).getBalanceByBrand('LpToken', lpTokenIssuer),
    E(notifierP).getUpdateSince(),
  ]);

  t.deepEqual(lockLpTokensMessage, `LP Tokens locked in the value of ${lpTokenAmount.value}`);
  t.deepEqual(lockLpTokenBalance, lpTokenAmount); // Make sure the balance in the contract is as expected
  t.deepEqual(notificationAfterLPLock.phase, ALLOCATION_PHASE.ACTIVE);

  const lpTokenBrand = await E(lpTokenIssuer).getBrand();

  const withdrawLpTokensInvitation = await E(creatorFacet).makeWithdrawLpTokensInvitation();
  const withdrawProposal = harden({want: { LpToken: AmountMath.makeEmpty(lpTokenBrand)}});

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
  t.deepEqual(withdrawLpSeatAllocation.LpToken, lpTokenAmount);

  const [ withdrawLiquidityBalance,  { value: notificationAfterWithdraw }] = await Promise.all([
    E(publicFacet).getBalanceByBrand('LpToken', lpTokenIssuer),
    E(notifierP).getUpdateSince(),
  ]);

  // Check notifier
  t.deepEqual(notificationAfterWithdraw.phase, ALLOCATION_PHASE.WITHDRAWN);
  t.deepEqual(notificationAfterWithdraw.lpBalance, withdrawLiquidityBalance);

});

test('withdraw-liquidity', async (t) => {
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

  const { Liquidity: lpTokenPayment } = payout;
  const [lpTokenAmount, { fromCentral: fromCentralPA }] = await Promise.all([
    E(lpTokenIssuer).getAmountOf(lpTokenPayment),
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
    LpToken: lpTokenIssuer,
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
  const proposal = harden({ give: { LpToken: lpTokenAmount } });
  const paymentKeywordRecord = harden({ LpToken: lpTokenPayment });

  const lockLpTokenSeat = await E(zoe).offer(
    lockLpTokensInvitation,
    proposal,
    paymentKeywordRecord,
  );
  const [lockLpTokensMessage, lockLpTokenBalance, { value: notificationAfterLPLock }] = await Promise.all([
    E(lockLpTokenSeat).getOfferResult(),
    E(publicFacet).getBalanceByBrand('LpToken', lpTokenIssuer),
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
    E(publicFacet).getBalanceByBrand('LpToken', lpTokenIssuer),
    E(notifierP).getUpdateSince(),
  ]);

    // Check notifier
    t.deepEqual(notificationAfterWithdraw.phase, ALLOCATION_PHASE.WITHDRAWN);
    t.deepEqual(notificationAfterWithdraw.lpBalance, withdrawLiquidityBalance);
    t.deepEqual(notificationAfterWithdraw.liquidityBalance.central, withdrawCentralBalance);
    t.deepEqual(notificationAfterWithdraw.liquidityBalance.secondary, withdrawSecondaryBalance);
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

  const { Liquidity: lpTokenPayment } = payout;
  const [lpTokenAmount, { fromCentral: fromCentralPA }] = await Promise.all([
    E(lpTokenIssuer).getAmountOf(lpTokenPayment),
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
    boundaries,
  };

  const issuerKeywordRecord = harden({
    Central: centralIssuer,
    Secondary: secondaryIssuer,
    LpToken: lpTokenIssuer,
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
  const proposal = harden({ give: { LpToken: lpTokenAmount } });
  const paymentKeywordRecord = harden({ LpToken: lpTokenPayment });

  const lockLpTokenSeat = await E(zoe).offer(
    lockLpTokensInvitation,
    proposal,
    paymentKeywordRecord,
  );
  const [lockLpTokensMessage, lockLpTokenBalance, { value: notificationAfterLPLock }] = await Promise.all([
    E(lockLpTokenSeat).getOfferResult(),
    E(publicFacet).getBalanceByBrand('LpToken', lpTokenIssuer),
    E(notifierP).getUpdateSince(),
  ]);

  t.deepEqual(lockLpTokensMessage, `LP Tokens locked in the value of ${lpTokenAmount.value}`);
  t.deepEqual(lockLpTokenBalance, lpTokenAmount); // Make sure the balance in the contract is as expected
  t.deepEqual(notificationAfterLPLock.phase, ALLOCATION_PHASE.ACTIVE);

  console.log('Moving the price up...');
  await moveFromCentralPriceUpOneTrade(zoe, ammPublicFacet, secondaryR, centralR, lpTokenIssuer, makeRatio(boundaries.boundaryMarginValue, secondaryR.brand));
  console.log('Done.');

  await eventLoopIteration();

  const [lpTokenAmountAllocated, lpTokenBrand, centralAmountAllocated, secondaryAmountAllocated, { value: notificationAfterPriceAboveUpper }] = await Promise.all([
    E(publicFacet).getBalanceByBrand('LpToken', lpTokenIssuer),
    E(lpTokenIssuer).getBrand(),
    E(publicFacet).getBalanceByBrand('Central', centralR.issuer),
    E(publicFacet).getBalanceByBrand('Secondary', secondaryR.issuer),
    E(notifierP).getUpdateSince(),
  ]);

  trace('Balances from contract', {
    LpToken: lpTokenAmountAllocated,
    Central: centralAmountAllocated,
    Secondary: secondaryAmountAllocated,
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

  const { Liquidity: lpTokenPayment } = payout;
  const [lpTokenAmount, { fromCentral: fromCentralPA }] = await Promise.all([
    E(lpTokenIssuer).getAmountOf(lpTokenPayment),
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
    boundaries,
  };

  const issuerKeywordRecord = harden({
    Central: centralIssuer,
    Secondary: secondaryIssuer,
    LpToken: lpTokenIssuer,
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
  const proposal = harden({ give: { LpToken: lpTokenAmount } });
  const paymentKeywordRecord = harden({ LpToken: lpTokenPayment });

  const lockLpTokenSeat = await E(zoe).offer(
    lockLpTokensInvitation,
    proposal,
    paymentKeywordRecord,
  );
  const [lockLpTokensMessage, lockLpTokenBalance, { value: notificationAfterLPLock }] = await Promise.all([
    E(lockLpTokenSeat).getOfferResult(),
    E(publicFacet).getBalanceByBrand('LpToken', lpTokenIssuer),
    E(notifierP).getUpdateSince(),
  ]);

  t.deepEqual(lockLpTokensMessage, `LP Tokens locked in the value of ${lpTokenAmount.value}`);
  t.deepEqual(lockLpTokenBalance, lpTokenAmount); // Make sure the balance in the contract is as expected
  t.deepEqual(notificationAfterLPLock.phase, ALLOCATION_PHASE.ACTIVE);

  console.log('Moving the price up...');
  await moveFromCentralPriceDownOneTrade(zoe, ammPublicFacet, secondaryR, centralR, lpTokenIssuer, makeRatio(boundaries.boundaryMarginValue, centralR.brand));
  console.log('Done.');
  trace('InputPriceAfter', inputPriceAfter);

  await eventLoopIteration();

  const [lpTokenAmountAllocated, lpTokenBrand, centralAmountAllocated, secondaryAmountAllocated, { value: notificationAfterPriceExceedsLimit }] = await Promise.all([
    E(publicFacet).getBalanceByBrand('LpToken', lpTokenIssuer),
    E(lpTokenIssuer).getBrand(),
    E(publicFacet).getBalanceByBrand('Central', centralR.issuer),
    E(publicFacet).getBalanceByBrand('Secondary', secondaryR.issuer),
    E(notifierP).getUpdateSince(),
  ]);

  trace('Balances from contract', {
    LpToken: lpTokenAmountAllocated,
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

  const { Liquidity: lpTokenPayment } = payout;
  const [lpTokenAmount, { fromCentral: fromCentralPA }] = await Promise.all([
    E(lpTokenIssuer).getAmountOf(lpTokenPayment),
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
    boundaries,
  };

  const issuerKeywordRecord = harden({
    Central: centralIssuer,
    Secondary: secondaryIssuer,
    LpToken: lpTokenIssuer,
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
  const proposal = harden({ give: { LpToken: lpTokenAmount } });
  const paymentKeywordRecord = harden({ LpToken: lpTokenPayment });

  const lockLpTokenSeat = await E(zoe).offer(
    lockLpTokensInvitation,
    proposal,
    paymentKeywordRecord,
  );
  const [lockLpTokensMessage, lockLpTokenBalance, { value: notificationAfterLPLock }] = await Promise.all([
    E(lockLpTokenSeat).getOfferResult(),
    E(publicFacet).getBalanceByBrand('LpToken', lpTokenIssuer),
    E(notifierP).getUpdateSince(),
  ]);

  t.deepEqual(lockLpTokensMessage, `LP Tokens locked in the value of ${lpTokenAmount.value}`);
  t.deepEqual(lockLpTokenBalance, lpTokenAmount); // Make sure the balance in the contract is as expected
  t.deepEqual(notificationAfterLPLock.phase, ALLOCATION_PHASE.ACTIVE);

  const widerBoundaries = await getBoundaries(fromCentralPA, centralInUnit(1n), secondaryR.brand, 35n);

  const newBoundaries = {
    lower: widerBoundaries.lower,
    upper: boundaries.upper,
  };

  await updateBoundariesAndCheckResult(t, zoe, creatorFacet, newBoundaries);

  console.log('Moving the price down...');
  await moveFromCentralPriceDownOneTrade(zoe, ammPublicFacet, secondaryR, centralR, lpTokenIssuer, makeRatio(boundaries.boundaryMarginValue, centralR.brand));
  console.log('Done.');

  const quote = await E(fromCentralPA).quoteGiven(centralInUnit(1n), secondaryR.brand);
  const priceAfter = getAmountOut(quote);
  trace('PriceAfter', priceAfter);

  // Check price against boundaries
  t.truthy(AmountMath.isGTE(boundaries.lower.numerator, priceAfter));
  t.truthy(AmountMath.isGTE(priceAfter, newBoundaries.lower.numerator));

  await eventLoopIteration();

  const [lpTokenAmountAllocated, centralAmountAllocated, secondaryAmountAllocated, { value: notificationAfterPriceExceedsLimit }] = await Promise.all([
    E(publicFacet).getBalanceByBrand('LpToken', lpTokenIssuer),
    E(publicFacet).getBalanceByBrand('Central', centralR.issuer),
    E(publicFacet).getBalanceByBrand('Secondary', secondaryR.issuer),
    E(notifierP).getUpdateSince(),
  ]);

  trace('Balances from contract', {
    LpToken: lpTokenAmountAllocated,
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
  t.deepEqual(notificationAfterPriceExceedsLimit.boundaries, newBoundaries);
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

  const { Liquidity: lpTokenPayment } = payout;
  const [lpTokenAmount, { fromCentral: fromCentralPA }] = await Promise.all([
    E(lpTokenIssuer).getAmountOf(lpTokenPayment),
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
    boundaries,
  };

  const issuerKeywordRecord = harden({
    Central: centralIssuer,
    Secondary: secondaryIssuer,
    LpToken: lpTokenIssuer,
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
  const proposal = harden({ give: { LpToken: lpTokenAmount } });
  const paymentKeywordRecord = harden({ LpToken: lpTokenPayment });

  const lockLpTokenSeat = await E(zoe).offer(
    lockLpTokensInvitation,
    proposal,
    paymentKeywordRecord,
  );
  const [lockLpTokensMessage, lockLpTokenBalance, { value: notificationAfterLPLock }] = await Promise.all([
    E(lockLpTokenSeat).getOfferResult(),
    E(publicFacet).getBalanceByBrand('LpToken', lpTokenIssuer),
    E(notifierP).getUpdateSince(),
  ]);

  t.deepEqual(lockLpTokensMessage, `LP Tokens locked in the value of ${lpTokenAmount.value}`);
  t.deepEqual(lockLpTokenBalance, lpTokenAmount); // Make sure the balance in the contract is as expected
  t.deepEqual(notificationAfterLPLock.phase, ALLOCATION_PHASE.ACTIVE);

  const widerBoundaries = await getBoundaries(fromCentralPA, centralInUnit(1n), secondaryR.brand, 45n);
  trace('widerBoundaries', widerBoundaries);
  const newBoundaries = {
    lower: boundaries.lower,
    upper: widerBoundaries.upper,
  };

  await updateBoundariesAndCheckResult(t, zoe, creatorFacet, newBoundaries);

  console.log('Moving the price down...');
  await moveFromCentralPriceUpOneTrade(zoe, ammPublicFacet, secondaryR, centralR,
    lpTokenIssuer, makeRatio(boundaries.boundaryMarginValue, secondaryR.brand));
  console.log('Done.');

  const quoteAfter = await E(fromCentralPA).quoteGiven(centralInUnit(1n), secondaryR.brand);
  const priceAfter = getAmountOut(quoteAfter);
  trace('InputPriceAfter', priceAfter);

  // Check price against boundaries
  t.truthy(AmountMath.isGTE(priceAfter, boundaries.upper.numerator));
  t.truthy(AmountMath.isGTE(newBoundaries.upper.numerator, priceAfter));

  await eventLoopIteration();

  const [lpTokenAmountAllocated, centralAmountAllocated, secondaryAmountAllocated, { value: notificationAfterPriceExceedsLimit }] = await Promise.all([
    E(publicFacet).getBalanceByBrand('LpToken', lpTokenIssuer),
    E(publicFacet).getBalanceByBrand('Central', centralR.issuer),
    E(publicFacet).getBalanceByBrand('Secondary', secondaryR.issuer),
    E(notifierP).getUpdateSince(),
  ]);

  trace('Balances from contract', {
    LpToken: lpTokenAmountAllocated,
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
  t.deepEqual(notificationAfterPriceExceedsLimit.boundaries, newBoundaries);
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

  const { Liquidity: lpTokenPayment } = payout;
  const [lpTokenAmount, { fromCentral: fromCentralPA }] = await Promise.all([
    E(lpTokenIssuer).getAmountOf(lpTokenPayment),
    E(ammPublicFacet).getPriceAuthorities(secondaryR.brand)
  ]);

  const centralIssuer = centralR.issuer;
  const secondaryIssuer = secondaryR.issuer;

  const boundaries = await getBoundaries(fromCentralPA, centralInUnit(1n), secondaryR.brand, 10n);
  trace('Boundaries', boundaries);

  const terms = {
    ammPublicFacet,
    centralIssuer,
    secondaryIssuer,
    lpTokenIssuer,
    boundaries,
  };

  const issuerKeywordRecord = harden({
    Central: centralIssuer,
    Secondary: secondaryIssuer,
    LpToken: lpTokenIssuer,
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
  const proposal = harden({ give: { LpToken: lpTokenAmount } });
  const paymentKeywordRecord = harden({ LpToken: lpTokenPayment });

  const lockLpTokenSeat = await E(zoe).offer(
    lockLpTokensInvitation,
    proposal,
    paymentKeywordRecord,
  );
  const [lockLpTokensMessage, lockLpTokenBalance, { value: notificationAfterLPLock }] = await Promise.all([
    E(lockLpTokenSeat).getOfferResult(),
    E(publicFacet).getBalanceByBrand('LpToken', lpTokenIssuer),
    E(notifierP).getUpdateSince(),
  ]);

  t.deepEqual(lockLpTokensMessage, `LP Tokens locked in the value of ${lpTokenAmount.value}`);
  t.deepEqual(lockLpTokenBalance, lpTokenAmount); // Make sure the balance in the contract is as expected
  t.deepEqual(notificationAfterLPLock.phase, ALLOCATION_PHASE.ACTIVE);

  const widerBoundaries = await getBoundaries(fromCentralPA, centralInUnit(1n), secondaryR.brand, 20n);
  trace('widerBoundaries', widerBoundaries);

  const newBoundaries = {
    lower: widerBoundaries.lower,
    upper: widerBoundaries.upper,
  };

  await updateBoundariesAndCheckResult(t, zoe, creatorFacet, newBoundaries);

  console.log('Moving the price up...');
  await moveFromCentralPriceUpOneTrade(zoe, ammPublicFacet, secondaryR, centralR, lpTokenIssuer, makeRatio(8n, secondaryR.brand));
  console.log('Done.');

  const quoteAfterFirstTrade = await E(fromCentralPA).quoteGiven(centralInUnit(1n), secondaryR.brand);
  const priceAfterFirstTrade = getAmountOut(quoteAfterFirstTrade);
  trace('InputPriceAfter', priceAfterFirstTrade);

  // Check price against boundaries
  t.truthy(AmountMath.isGTE(newBoundaries.upper.numerator, priceAfterFirstTrade));
  t.truthy(AmountMath.isGTE(priceAfterFirstTrade, boundaries.upper.numerator));

  await eventLoopIteration();

  const [lpTokenAmountAllocated, centralAmountAllocated, secondaryAmountAllocated, { value: notificationAfterPriceExceedsOldLimit }] =
    await Promise.all([
      E(publicFacet).getBalanceByBrand('LpToken', lpTokenIssuer),
      E(publicFacet).getBalanceByBrand('Central', centralR.issuer),
      E(publicFacet).getBalanceByBrand('Secondary', secondaryR.issuer),
      E(notifierP).getUpdateSince(),
    ]);

  trace('Balances from contract', {
    LpToken: lpTokenAmountAllocated,
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
  t.deepEqual(notificationAfterPriceExceedsOldLimit.boundaries, newBoundaries);

  console.log('Moving the price up...');
  await moveFromCentralPriceUpOneTrade(zoe, ammPublicFacet, secondaryR, centralR, lpTokenIssuer, makeRatio(10n, secondaryR.brand));
  console.log('Done.');

  const quoteAfterSecondTrade = await E(fromCentralPA).quoteGiven(centralInUnit(1n), secondaryR.brand);
  const priceAfterSecondTrade = getAmountOut(quoteAfterSecondTrade);
  trace('inputPriceAfterBoundariesUpdated', priceAfterSecondTrade);

  await eventLoopIteration();

  const [
    lpTokenAmountAllocatedAfterUpdate,
    centralAmountAllocatedAfterUpdate,
    secondaryAmountAllocatedAfterUpdate,
    { value: notificationAfterPriceExceedsLimit }] = await Promise.all([
    E(publicFacet).getBalanceByBrand('LpToken', lpTokenIssuer),
    E(publicFacet).getBalanceByBrand('Central', centralR.issuer),
    E(publicFacet).getBalanceByBrand('Secondary', secondaryR.issuer),
    E(notifierP).getUpdateSince(),
  ]);

  trace('Balances from contract', {
    LpToken: lpTokenAmountAllocatedAfterUpdate,
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

  const { Liquidity: lpTokenPayment } = payout;
  const [lpTokenAmount, { fromCentral: fromCentralPA }] = await Promise.all([
    E(lpTokenIssuer).getAmountOf(lpTokenPayment),
    E(ammPublicFacet).getPriceAuthorities(secondaryR.brand)
  ]);

  const centralIssuer = centralR.issuer;
  const secondaryIssuer = secondaryR.issuer;

  const boundaries = await getBoundaries(fromCentralPA, centralInUnit(1n), secondaryR.brand, 10n);
  trace('Boundaries', boundaries);

  const terms = {
    ammPublicFacet,
    centralIssuer,
    secondaryIssuer,
    lpTokenIssuer,
    boundaries,
  };

  const issuerKeywordRecord = harden({
    Central: centralIssuer,
    Secondary: secondaryIssuer,
    LpToken: lpTokenIssuer,
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
  const proposal = harden({ give: { LpToken: lpTokenAmount } });
  const paymentKeywordRecord = harden({ LpToken: lpTokenPayment });

  const lockLpTokenSeat = await E(zoe).offer(
    lockLpTokensInvitation,
    proposal,
    paymentKeywordRecord,
  );
  const [lockLpTokensMessage, lockLpTokenBalance, { value: notificationAfterLPLock }] = await Promise.all([
    E(lockLpTokenSeat).getOfferResult(),
    E(publicFacet).getBalanceByBrand('LpToken', lpTokenIssuer),
    E(notifierP).getUpdateSince(),
  ]);

  t.deepEqual(lockLpTokensMessage, `LP Tokens locked in the value of ${lpTokenAmount.value}`);
  t.deepEqual(lockLpTokenBalance, lpTokenAmount); // Make sure the balance in the contract is as expected
  t.deepEqual(notificationAfterLPLock.phase, ALLOCATION_PHASE.ACTIVE);

  const widerBoundaries = await getBoundaries(fromCentralPA, centralInUnit(1n), secondaryR.brand, 20n);
  trace('widerBoundaries', widerBoundaries);

  const newBoundaries = {
    lower: widerBoundaries.lower,
    upper: widerBoundaries.upper,
  };

  await updateBoundariesAndCheckResult(t, zoe, creatorFacet, newBoundaries);

  console.log('Moving the price down...');
  await moveFromCentralPriceDownOneTrade(zoe, ammPublicFacet, secondaryR, centralR, lpTokenIssuer, makeRatio(10n, centralR.brand));
  console.log('Done.');

  const quoteAfterFirstTrade = await E(fromCentralPA).quoteGiven(centralInUnit(1n), secondaryR.brand);
  const priceAfterFirstTrade = getAmountOut(quoteAfterFirstTrade);
  trace('priceAfterFirstTrade', priceAfterFirstTrade);

  // Check price against boundaries
  t.truthy(AmountMath.isGTE(boundaries.lower.numerator, priceAfterFirstTrade));
  t.truthy(AmountMath.isGTE(priceAfterFirstTrade, newBoundaries.lower.numerator));

  await eventLoopIteration();

  const [lpTokenAmountAllocated, centralAmountAllocated, secondaryAmountAllocated, { value: notificationAfterPriceExceedsOldLimit }] =
    await Promise.all([
      E(publicFacet).getBalanceByBrand('LpToken', lpTokenIssuer),
      E(publicFacet).getBalanceByBrand('Central', centralR.issuer),
      E(publicFacet).getBalanceByBrand('Secondary', secondaryR.issuer),
      E(notifierP).getUpdateSince(),
    ]);

  trace('Balances from contract', {
    LpToken: lpTokenAmountAllocated,
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
  t.deepEqual(notificationAfterPriceExceedsOldLimit.boundaries, newBoundaries);

  console.log('Moving the price down...');
  await moveFromCentralPriceDownOneTrade(zoe, ammPublicFacet, secondaryR, centralR, lpTokenIssuer, makeRatio(15n, centralR.brand));
  console.log('Done.');

  const quoteAfterSecondTrade = await E(fromCentralPA).quoteGiven(centralInUnit(1n), secondaryR.brand);
  const priceAfterSecondTrade = getAmountOut(quoteAfterSecondTrade);
  trace('priceAfterSecondTrade', priceAfterSecondTrade);

  await eventLoopIteration();

  const [
    lpTokenAmountAllocatedAfterUpdate,
    centralAmountAllocatedAfterUpdate,
    secondaryAmountAllocatedAfterUpdate,
    { value: notificationAfterPriceExceedsLimit }] = await Promise.all([
    E(publicFacet).getBalanceByBrand('LpToken', lpTokenIssuer),
    E(publicFacet).getBalanceByBrand('Central', centralR.issuer),
    E(publicFacet).getBalanceByBrand('Secondary', secondaryR.issuer),
    E(notifierP).getUpdateSince(),
  ]);

  trace('Balances from contract', {
    LpToken: lpTokenAmountAllocatedAfterUpdate,
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

  const { Liquidity: lpTokenPayment } = payout;
  const [lpTokenAmount, { fromCentral: fromCentralPA }] = await Promise.all([
    E(lpTokenIssuer).getAmountOf(lpTokenPayment),
    E(ammPublicFacet).getPriceAuthorities(secondaryR.brand)
  ]);

  const centralIssuer = centralR.issuer;
  const secondaryIssuer = secondaryR.issuer;

  const boundaries = await getBoundaries(fromCentralPA, centralInUnit(1n), secondaryR.brand, 15n);
  trace('Boundaries', boundaries);

  const terms = {
    ammPublicFacet,
    centralIssuer,
    secondaryIssuer,
    lpTokenIssuer,
    boundaries,
  };

  const issuerKeywordRecord = harden({
    Central: centralIssuer,
    Secondary: secondaryIssuer,
    LpToken: lpTokenIssuer,
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
  const proposal = harden({ give: { LpToken: lpTokenAmount } });
  const paymentKeywordRecord = harden({ LpToken: lpTokenPayment });

  const lockLpTokenSeat = await E(zoe).offer(
    lockLpTokensInvitation,
    proposal,
    paymentKeywordRecord,
  );
  const [lockLpTokensMessage, lockLpTokenBalance, { value: notificationAfterLPLock }] = await Promise.all([
    E(lockLpTokenSeat).getOfferResult(),
    E(publicFacet).getBalanceByBrand('LpToken', lpTokenIssuer),
    E(notifierP).getUpdateSince(),
  ]);

  t.deepEqual(lockLpTokensMessage, `LP Tokens locked in the value of ${lpTokenAmount.value}`);
  t.deepEqual(lockLpTokenBalance, lpTokenAmount); // Make sure the balance in the contract is as expected
  t.deepEqual(notificationAfterLPLock.phase, ALLOCATION_PHASE.ACTIVE);

  const widerBoundaries = await getBoundaries(fromCentralPA, centralInUnit(1n), secondaryR.brand, 40n);
  trace('widerBoundaries', widerBoundaries);

  const newBoundaries = {
    lower: widerBoundaries.lower,
    upper: widerBoundaries.upper,
  };

  await updateBoundariesAndCheckResult(t, zoe, creatorFacet, newBoundaries);

  console.log('Moving the price down...');
  await moveFromCentralPriceDownOneTrade(zoe, ammPublicFacet, secondaryR, centralR, lpTokenIssuer, makeRatio(10n, centralR.brand));
  console.log('Done.');

  const quoteAfterFirstTrade = await E(fromCentralPA).quoteGiven(centralInUnit(1n), secondaryR.brand);
  const priceAfterFirstTrade = getAmountOut(quoteAfterFirstTrade);
  trace('priceAfterFirstTrade', priceAfterFirstTrade);

  // Check price against boundaries
  t.truthy(AmountMath.isGTE(boundaries.lower.numerator, priceAfterFirstTrade));
  t.truthy(AmountMath.isGTE(priceAfterFirstTrade, newBoundaries.lower.numerator));

  await eventLoopIteration();

  const [lpTokenAmountAllocated, centralAmountAllocated, secondaryAmountAllocated, { value: notificationAfterPriceExceedsOldLimit }] =
    await Promise.all([
      E(publicFacet).getBalanceByBrand('LpToken', lpTokenIssuer),
      E(publicFacet).getBalanceByBrand('Central', centralR.issuer),
      E(publicFacet).getBalanceByBrand('Secondary', secondaryR.issuer),
      E(notifierP).getUpdateSince(),
    ]);

  trace('Balances from contract', {
    LpToken: lpTokenAmountAllocated,
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
  t.deepEqual(notificationAfterPriceExceedsOldLimit.boundaries, newBoundaries);

  console.log('Moving the price up...');
  await moveFromCentralPriceUpOneTrade(zoe, ammPublicFacet, secondaryR, centralR, lpTokenIssuer, makeRatio(35n, secondaryR.brand));
  console.log('Done.');

  const quoteAfterSecondTrade = await E(fromCentralPA).quoteGiven(centralInUnit(1n), secondaryR.brand);
  const priceAfterSecondTrade = getAmountOut(quoteAfterSecondTrade);
  trace('priceAfterSecondTrade', priceAfterSecondTrade);

  await eventLoopIteration();

  const [
    lpTokenAmountAllocatedAfterUpdate,
    centralAmountAllocatedAfterUpdate,
    secondaryAmountAllocatedAfterUpdate,
    { value: notificationAfterPriceExceedsLimit }] = await Promise.all([
    E(publicFacet).getBalanceByBrand('LpToken', lpTokenIssuer),
    E(publicFacet).getBalanceByBrand('Central', centralR.issuer),
    E(publicFacet).getBalanceByBrand('Secondary', secondaryR.issuer),
    E(notifierP).getUpdateSince(),
  ]);

  trace('Balances from contract', {
    LpToken: lpTokenAmountAllocatedAfterUpdate,
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

  const { Liquidity: lpTokenPayment } = payout;
  const [_, { fromCentral: fromCentralPA }] = await Promise.all([
    E(lpTokenIssuer).getAmountOf(lpTokenPayment),
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
    devPriceAuthority,
  };

  const issuerKeywordRecord = harden({
    Central: centralIssuer,
    Secondary: secondaryIssuer,
    LpToken: lpTokenIssuer,
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
    E(publicFacet).getBalanceByBrand('LpToken', lpTokenIssuer),
    E(lpTokenIssuer).getBrand(),
    E(publicFacet).getBalanceByBrand('Central', centralR.issuer),
    E(publicFacet).getBalanceByBrand('Secondary', secondaryR.issuer),
    E(notifierP).getUpdateSince(),
  ]);

  trace('Balances from contract', {
    LpToken: lpTokenAmountAllocated,
    Central: centralAmountAllocated,
    Secondary: secondaryAmountAllocated,
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

test('boundaryWatcher-failed-then-remove-tokens-locked', async (t) => {
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

  const { Liquidity: lpTokenPayment } = payout;
  const [lpTokenAmount, { fromCentral: fromCentralPA }] = await Promise.all([
    E(lpTokenIssuer).getAmountOf(lpTokenPayment),
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
    LpToken: lpTokenIssuer,
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
  const proposal = harden({ give: { LpToken: lpTokenAmount } });
  const paymentKeywordRecord = harden({ LpToken: lpTokenPayment });

  const lockLpTokenSeat = await E(zoe).offer(
    lockLpTokensInvitation,
    proposal,
    paymentKeywordRecord,
  );

  const [lockLpTokensMessage, lockLpTokenBalance, { value: notificationAfterLPLock }] = await Promise.all([
    E(lockLpTokenSeat).getOfferResult(),
    E(publicFacet).getBalanceByBrand('LpToken', lpTokenIssuer),
    E(notifierP).getUpdateSince(),
  ]);

  t.deepEqual(lockLpTokensMessage, `LP Tokens locked in the value of ${lpTokenAmount.value}`);
  t.deepEqual(lockLpTokenBalance, lpTokenAmount); // Make sure the balance in the contract is as expected
  t.deepEqual(notificationAfterLPLock.phase, ALLOCATION_PHASE.ACTIVE);

  E(devPriceAuthority).setPrice(undefined);
  await eventLoopIteration();

  const [lpTokenAmountAllocated, lpTokenBrand, centralAmountAllocated, secondaryAmountAllocated, { value: notificationAfterBadPrice }] = await Promise.all([
    E(publicFacet).getBalanceByBrand('LpToken', lpTokenIssuer),
    E(lpTokenIssuer).getBrand(),
    E(publicFacet).getBalanceByBrand('Central', centralR.issuer),
    E(publicFacet).getBalanceByBrand('Secondary', secondaryR.issuer),
    E(notifierP).getUpdateSince(),
  ]);

  trace('Balances from contract', {
    LpToken: lpTokenAmountAllocated,
    Central: centralAmountAllocated,
    Secondary: secondaryAmountAllocated
  });

  // Check balances
  t.deepEqual(lpTokenAmountAllocated, lpTokenAmount);
  t.deepEqual(centralAmountAllocated, AmountMath.makeEmpty(centralR.brand));
  t.deepEqual(secondaryAmountAllocated, AmountMath.makeEmpty(secondaryR.brand));

  // Check notification
  t.deepEqual(notificationAfterBadPrice.phase, ALLOCATION_PHASE.ERROR);
  t.deepEqual(lpTokenAmountAllocated, notificationAfterBadPrice.lpBalance);
  t.deepEqual(centralAmountAllocated, notificationAfterBadPrice.liquidityBalance.central);
  t.deepEqual(secondaryAmountAllocated, notificationAfterBadPrice.liquidityBalance.secondary);

  // Withdraw LP Tokens
  const withdrawLpTokensInvitation = await E(creatorFacet).makeWithdrawLpTokensInvitation();
  const withdrawProposal = harden({want: { LpToken: AmountMath.makeEmpty(lpTokenBrand)}});

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
  t.deepEqual(withdrawLpSeatAllocation.LpToken, lpTokenAmount);

  const [ withdrawLiquidityBalance,  { value: notificationAfterWithdraw }] = await Promise.all([
    E(publicFacet).getBalanceByBrand('LpToken', lpTokenIssuer),
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

  const { Liquidity: lpTokenPayment } = payout;
  const [lpTokenAmount, { fromCentral: fromCentralPA }] = await Promise.all([
    E(lpTokenIssuer).getAmountOf(lpTokenPayment),
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
    boundaries,
  };

  const issuerKeywordRecord = harden({
    Central: centralIssuer,
    Secondary: secondaryIssuer,
    LpToken: lpTokenIssuer,
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
  const proposal = harden({ give: { LpToken: lpTokenAmount } });
  const paymentKeywordRecord = harden({ LpToken: lpTokenPayment });

  const lockLpTokenSeat = await E(zoe).offer(
    lockLpTokensInvitation,
    proposal,
    paymentKeywordRecord,
  );
  const [lockLpTokensMessage, lockLpTokenBalance, { value: notificationAfterLPLock }] = await Promise.all([
    E(lockLpTokenSeat).getOfferResult(),
    E(publicFacet).getBalanceByBrand('LpToken', lpTokenIssuer),
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
    E(publicFacet).getBalanceByBrand('LpToken', lpTokenIssuer),
    E(publicFacet).getBalanceByBrand('Central', centralR.issuer),
    E(publicFacet).getBalanceByBrand('Secondary', secondaryR.issuer),
    E(notifierP).getUpdateSince(),
  ]);

  trace('Balances from contract', {
    LpToken: lpTokenAmountAllocated,
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

  const { Liquidity: lpTokenPayment } = payout;
  const [lpTokenAmount, { fromCentral: fromCentralPA }] = await Promise.all([
    E(lpTokenIssuer).getAmountOf(lpTokenPayment),
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
    boundaries,
  };

  const issuerKeywordRecord = harden({
    Central: centralIssuer,
    Secondary: secondaryIssuer,
    LpToken: lpTokenIssuer,
  });

  const testingPromise = startStopLoss(
    zoe,
    issuerKeywordRecord,
    terms,
  );

  await t.throwsAsync(() => testingPromise, {message: 'Lower boundary should be lower or equal to current price: "[194539438n]"'});
});

test('remove-liquidity-failed-keep-tokens-locked', async (t) => {
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

  const { Liquidity: lpTokenPayment } = payout;
  const [lpTokenAmount, { fromCentral: fromCentralPA }] = await Promise.all([
    E(lpTokenIssuer).getAmountOf(lpTokenPayment),
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
    LpToken: lpTokenIssuer,
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
  const proposal = harden({ give: { LpToken: lpTokenAmount } });
  const paymentKeywordRecord = harden({ LpToken: lpTokenPayment });

  const lockLpTokenSeat = await E(zoe).offer(
    lockLpTokensInvitation,
    proposal,
    paymentKeywordRecord,
  );

  const [lockLpTokensMessage, lockLpTokenBalance, { value: notificationAfterLPLock }] = await Promise.all([
    E(lockLpTokenSeat).getOfferResult(),
    E(publicFacet).getBalanceByBrand('LpToken', lpTokenIssuer),
    E(notifierP).getUpdateSince(),
  ]);

  t.deepEqual(lockLpTokensMessage, `LP Tokens locked in the value of ${lpTokenAmount.value}`);
  t.deepEqual(lockLpTokenBalance, lpTokenAmount); // Make sure the balance in the contract is as expected
  t.deepEqual(notificationAfterLPLock.phase, ALLOCATION_PHASE.ACTIVE);

  // update price to move above upper boundary
  const updatedPrice = makeRatioFromAmounts(secondaryInUnit(50n), boundaries.base.denominator);
  E(devPriceAuthority).setPrice(updatedPrice);
  await eventLoopIteration();

  const [lpTokenAmountAllocated, centralAmountAllocated, secondaryAmountAllocated, { value: notificationAfterPriceAboveUpper }] = await Promise.all([
    E(publicFacet).getBalanceByBrand('LpToken', lpTokenIssuer),
    E(publicFacet).getBalanceByBrand('Central', centralR.issuer),
    E(publicFacet).getBalanceByBrand('Secondary', secondaryR.issuer),
    E(notifierP).getUpdateSince(),
  ]);

  trace('Balances from contract', {
    LpToken: lpTokenAmountAllocated,
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

test('amm-playaround-secondary-price-down', async (t) => {
  const { zoe, amm, centralR, secondaryR } = await startServices(t);
  const centralInitialValue = 40n;
  const secondaryInitialValue = 80n;

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

  /** @type {{fromCentral: PriceAuthority}} */
  const { fromCentral } = await E(ammPublicFacet).getPriceAuthorities(secondaryR.brand);

  const quoteBefore = await E(fromCentral).quoteGiven(centralInUnit(1n), secondaryR.brand);
  trace('Price Before', getAmountOut(quoteBefore));

  console.log('Swapping Central For Secondary...');
  await moveFromCentralPriceDownOneTrade(zoe, ammPublicFacet, secondaryR, centralR, lpTokenIssuer, makeRatio(15n, centralR.brand));
  console.log('Done.');

  const quoteAfter = await E(fromCentral).quoteGiven(centralInUnit(1n), secondaryR.brand);
  trace('Price After First Trade', getAmountOut(quoteAfter));

  const firstDifference = differenceInPercent(getAmountOut(quoteAfter), getAmountOut(quoteBefore));
  trace('Quantized After First Trade', firstDifference);

  t.is('test', 'test');
});

test('amm-playaround-secondary-price-up', async (t) => {
  const { zoe, amm, centralR, secondaryR } = await startServices(t);
  const centralInitialValue = 40n;
  const secondaryInitialValue = 80n;

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

  /** @type {{fromCentral: PriceAuthority}} */
  const { fromCentral } = await E(ammPublicFacet).getPriceAuthorities(secondaryR.brand);

  const quoteBefore = await E(fromCentral).quoteGiven(centralInUnit(1n), secondaryR.brand);
  trace('Price Before', getAmountOut(quoteBefore));

  console.log('Swapping Central For Secondary...');
  await moveFromCentralPriceUpOneTrade(zoe, ammPublicFacet, secondaryR, centralR, lpTokenIssuer, makeRatio(20n, secondaryR.brand));
  console.log('Done.');

  const quoteAfter = await E(fromCentral).quoteGiven(centralInUnit(1n), secondaryR.brand);
  trace('Price After First Trade', getAmountOut(quoteAfter));

  const firstDifference = differenceInPercent(getAmountOut(quoteAfter), getAmountOut(quoteBefore));
  trace('Quantized After First Trade', firstDifference);

  t.is('test', 'test');
});

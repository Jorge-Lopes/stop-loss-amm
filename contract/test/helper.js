// @ts-check

import { AmountMath, makeIssuerKit, AssetKind } from '@agoric/ertp';
import { assertPayoutAmount } from '@agoric/zoe/test/zoeTestHelpers.js';
import buildManualTimer from '@agoric/zoe/tools/manualTimer.js';
import { E } from '@endo/far';
import { makeLiquidityInvitations } from './ammLiquidity.js';
import { setupStopLoss, setupAmmServices } from './setup.js';
import { getAmountOut } from '@agoric/zoe/src/contractSupport/priceQuote.js';
import {
  floorMultiplyBy,
  makeRatio,
  makeRatioFromAmounts, quantize,
} from '@agoric/zoe/src/contractSupport/ratio.js';
import { UPDATED_BOUNDARY_MESSAGE } from '../src/constants.js';

/*
  This file act as a bridge beetween the tests and the functions exported by ./ammLiquidity.js,
  the function makeAssertPayouts allow us to confirm if a payout returns what is expected;
*/

export const makeAssets = () => {
  const centralR = makeIssuerKit(
    'Central',
    AssetKind.NAT,
    harden({ decimalPlaces: 8 }),
  );
  const secondaryR = makeIssuerKit(
    'Secondary',
    AssetKind.NAT,
    harden({ decimalPlaces: 8 }),
  );

  return { centralR, secondaryR };
};

export async function startServices(t) {
  const electorateTerms = { committeeName: 'EnBancPanel', committeeSize: 3 };
  const timer = buildManualTimer(console.log);

  const { centralR, secondaryR } = makeAssets();

  const { zoe, amm } = await setupAmmServices(
    t,
    electorateTerms,
    centralR,
    timer,
  );

  return {
    zoe,
    amm,
    centralR,
    secondaryR,
  };
}

/**
 * @param t
 * @param zoe
 * @param {XYKAMMPublicFacet} ammPublicFacet
 * @param centralR
 * @param secondaryR
 * @param kwd
 * @param centralInitialValue
 * @param secondaryInitialValue
 * @returns {Promise<{zoe, secondaryR, payout: *, ammPublicFacet, centralR, liquidityIssuer: *}>}
 */
export async function startAmmPool(
  t,
  zoe,
  ammPublicFacet,
  centralR,
  secondaryR,
  kwd,
  centralInitialValue,
  secondaryInitialValue,
) {
  // Here we are creating a pool with (central - secondary)
  const lpTokenIssuer = await E(ammPublicFacet).addIssuer(
    secondaryR.issuer,
    kwd,
  );

  const { initPool } = await makeLiquidityInvitations(
    t,
    zoe,
    ammPublicFacet,
    secondaryR,
    centralR,
    lpTokenIssuer,
  );

  await initPool(secondaryInitialValue, centralInitialValue);

  return {
    zoe,
    ammPublicFacet,
    secondaryR,
    centralR,
    lpTokenIssuer,
  };
}

export async function addLiquidityToPool(
  t,
  zoe,
  ammPublicFacet,
  centralR,
  secondaryR,
  lpTokenIssuer,
  centralValue,
  secondaryValue,
) {
  const { addLiquidity } = await makeLiquidityInvitations(
    t,
    zoe,
    ammPublicFacet,
    secondaryR,
    centralR,
    lpTokenIssuer,
  );

  return addLiquidity(secondaryValue, centralValue);
}

export async function removeLiquidityFromPool(
  t,
  zoe,
  ammPublicFacet,
  centralR,
  secondaryR,
  lpTokenIssuer,
  lpTokenPayment,
  lpTokenValue,
) {
  const { removeLiquidity } = await makeLiquidityInvitations(
    t,
    zoe,
    ammPublicFacet,
    secondaryR,
    centralR,
    lpTokenIssuer,
  );

  const payoutRemove = await removeLiquidity(lpTokenPayment, lpTokenValue);
  return payoutRemove;
}

export async function swapSecondaryForCentral(
  t,
  zoe,
  ammPublicFacet,
  secondaryR,
  centralR,
  lpTokenIssuer,
  secondaryValueIn,
) {
  const { swapSecondaryForCentral } = await makeLiquidityInvitations(
    t,
    zoe,
    ammPublicFacet,
    secondaryR,
    centralR,
    lpTokenIssuer,
  );

  const swapSeat = await swapSecondaryForCentral(secondaryValueIn);
  return swapSeat;
}

export async function swapCentralForSecondary(
  t,
  zoe,
  ammPublicFacet,
  secondaryR,
  centralR,
  lpTokenIssuer,
  centralValueIn,
) {
  const { swapCentralForSecondary } = await makeLiquidityInvitations(
    t,
    zoe,
    ammPublicFacet,
    secondaryR,
    centralR,
    lpTokenIssuer,
  );

  const swapSeat = await swapCentralForSecondary(centralValueIn);
  return swapSeat;
}

export const makeAssertPayouts = (
  t,
  lpTokenIssuer,
  lpTokenBrand,
  centralR,
  secondaryR,
) => {
  return async (
    lPayment,
    lExpected,
    cPayment,
    cExpected,
    sPayment,
    sExpected,
  ) => {
    const lAmount = AmountMath.make(lpTokenBrand, lExpected);
    await assertPayoutAmount(
      t,
      lpTokenIssuer,
      lPayment,
      lAmount,
      'LpToken payout',
    );
    const cAmount = AmountMath.make(centralR.brand, cExpected);
    await assertPayoutAmount(
      t,
      centralR.issuer,
      cPayment,
      cAmount,
      'central payout',
    );
    const sAmount = AmountMath.make(secondaryR.brand, sExpected);
    await assertPayoutAmount(
      t,
      secondaryR.issuer,
      sPayment,
      sAmount,
      'secondary Payout',
    );
  };
};

export async function startStopLoss(zoe, issuerKeywordRecord, terms) {
  const { publicFacet, creatorFacet } = await setupStopLoss(
    zoe,
    issuerKeywordRecord,
    terms,
  );

  return { publicFacet, creatorFacet };
}

/**
 * This function gets the current price for a pair from the AMM and calculates
 * an upper and a lower boundary for stopLoss contract.
 *
 * We do the calculation by asking the current price to `fromCentral` priceAuthority
 * we get from the pool. Then we add and substract an amount we calculated from a ratio
 * called `boundaryMarginRatio`.
 *
 * @param {PriceAuthority} fromCentralPA
 * @param {Amount} centralAmountIn
 * @param {Brand} secondaryBrand
 * @param {BigInt} boundaryMarginValue
 */
export const getBoundaries = async (
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
      AmountMath.subtract(baseAmountOut, marginAmount),
      centralAmountIn,
    ),
    upper: makeRatioFromAmounts(
      AmountMath.add(baseAmountOut, marginAmount),
      centralAmountIn,
    ),
    base: makeRatioFromAmounts(baseAmountOut, centralAmountIn),
    marginAmount,
    boundaryMarginValue,
  };
};

/**
 *
 * @param {ZoeService} zoe
 * @param {XYKAMMPublicFacet} ammPublicFacet
 * @param {IssuerKit} secondaryR
 * @param {IssuerKit} centralR
 * @param {Issuer} lpTokenIssuer
 * @param {Ratio} boundaryMargin
 * @returns {Promise<string>}
 */
export const moveFromCentralPriceUpOneTrade = async (zoe,
                                             ammPublicFacet,
                                             secondaryR,
                                             centralR,
                                             lpTokenIssuer,
                                             boundaryMargin) => {
  const {
    swapSecondaryForCentral,
  } = await makeLiquidityInvitations(undefined, zoe, ammPublicFacet, secondaryR, centralR, lpTokenIssuer);

  const { Secondary: secondaryAmount } = await E(ammPublicFacet).getPoolAllocation(secondaryR.brand);

  const tradeAmount = floorMultiplyBy(secondaryAmount, boundaryMargin);
  const valueInUnit = tradeAmount.value / (10n ** BigInt(secondaryR.displayInfo.decimalPlaces));

  await swapSecondaryForCentral(valueInUnit);

  return 'Success';
};


/**
 *
 * @param {ZoeService} zoe
 * @param {XYKAMMPublicFacet} ammPublicFacet
 * @param {IssuerKit} secondaryR
 * @param {IssuerKit} centralR
 * @param {Issuer} lpTokenIssuer
 * @param {Ratio} boundaryMargin
 * @returns {Promise<void>}
 */
export const moveFromCentralPriceDownOneTrade = async (zoe,
                                               ammPublicFacet,
                                               secondaryR,
                                               centralR,
                                               lpTokenIssuer,
                                               boundaryMargin) => {

  const {
    swapCentralForSecondary,
  } = await makeLiquidityInvitations(undefined, zoe, ammPublicFacet, secondaryR, centralR, lpTokenIssuer);

  const { Central: centralAmount } = await E(ammPublicFacet).getPoolAllocation(secondaryR.brand);

  const tradeAmount = floorMultiplyBy(centralAmount, boundaryMargin);

  const valueToTrade = tradeAmount.value / (10n ** BigInt(centralR.displayInfo.decimalPlaces));

  await swapCentralForSecondary(valueToTrade);

  return 'Success';
};

export const updateBoundariesAndCheckResult = async (t, zoe, stopLossCreatorFacet, newBoundaries) => {
  const userSeat = await E(zoe).offer(
    E(stopLossCreatorFacet).makeUpdateConfigurationInvitation(),
    undefined,
    undefined,
    harden({ boundaries: newBoundaries }));
  console.log('zaaaa')
  const offerResult = await E(userSeat).getOfferResult();
  t.deepEqual(offerResult, UPDATED_BOUNDARY_MESSAGE);
};

/**
 *
 * @param {Amount} newPrice
 * @param {Amount} oldPrice
 * @returns {Ratio}
 */
export const differenceInPercent = (newPrice, oldPrice) => {
  let subtractInVal = newPrice.value - oldPrice.value;
  if (subtractInVal < 0n) subtractInVal = -1n * subtractInVal;
  const subtractedAmount = AmountMath.make(newPrice.brand, subtractInVal);
  console.log('difference', subtractedAmount)
  const ratio = makeRatioFromAmounts(subtractedAmount, oldPrice);
  return quantize(ratio, 100n);
}

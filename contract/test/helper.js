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
  makeRatioFromAmounts,
} from '@agoric/zoe/src/contractSupport/ratio.js';
import { UPDATED_BOUNDARY_MESSAGE } from '../src/constants.js';

/*
  This file act as a bridge beetween the tests and the functions exported by ./ammLiquidity.js,
  the function makeAssertPayouts allow us to confirm if a payout returns what is expected;
*/

export const makeAssets = () => {
  const centralR = makeIssuerKit('Central', AssetKind.NAT, harden({ decimalPlaces: 8 }));
  const secondaryR = makeIssuerKit('Secondary', AssetKind.NAT, harden({ decimalPlaces: 8 }));

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

export async function removeLiquidityToPool(
  t,
  zoe,
  ammPublicFacet,
  centralR,
  secondaryR,
  lpTokenIssuer,
  liquidityPayment,
  liquidityValue,
) {
  const { removeLiquidity } = await makeLiquidityInvitations(
    t,
    zoe,
    ammPublicFacet,
    secondaryR,
    centralR,
    lpTokenIssuer,
  );

  const payoutRemove = await removeLiquidity(liquidityPayment, liquidityValue);
  return payoutRemove;
}

export async function swapSecondaryForCentral(
  zoe,
  ammPublicFacet,
  secondaryR,
  centralR,
  lpTokenIssuer,
  secondaryValueIn,
) {
  const { swapSecondaryForCentral } = await makeLiquidityInvitations(
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
  zoe,
  ammPublicFacet,
  secondaryR,
  centralR,
  lpTokenIssuer,
  centralValueIn,
) {
  const { swapCentralForSecondary } = await makeLiquidityInvitations(
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
  liquidityBrand,
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
    const lAmount = AmountMath.make(liquidityBrand, lExpected);
    await assertPayoutAmount(
      t,
      lpTokenIssuer,
      lPayment,
      lAmount,
      'Liquidity payout',
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
  };
};

/**
 *
 * @param {ZoeService} zoe
 * @param {XYKAMMPublicFacet} ammPublicFacet
 * @param {IssuerKit} secondaryR
 * @param {IssuerKit} centralR
 * @param {Issuer} lpTokenIssuer
 * @param {Ratio} upperBoundary
 * @param {BigInt} swapInterval
 * @returns {Promise<void>}
 */
export const moveFromCentralPriceUp = async (zoe,
                                             ammPublicFacet,
                                             secondaryR,
                                             centralR,
                                             lpTokenIssuer,
                                             upperBoundary,
                                             swapInterval = 1n) => {
  const {
    swapSecondaryForCentral,
    makeCentral,
    makeSecondary,
  } = await makeLiquidityInvitations(undefined, zoe, ammPublicFacet, secondaryR, centralR, lpTokenIssuer);

  const { amountOut } = await E(ammPublicFacet).getInputPrice(
    makeCentral(1n),
    makeSecondary(0n),
  );
  let inputPriceAmountOut = amountOut;

  while (AmountMath.isGTE(upperBoundary.numerator, inputPriceAmountOut)) {
    await swapSecondaryForCentral(swapInterval);

    const { amountOut } = await E(ammPublicFacet).getInputPrice(
      makeCentral(1n),
      makeSecondary(0n),
    );
    inputPriceAmountOut = amountOut;
    // console.log('INTER_INPUT_PRICE', inputPriceAmountOut);
  }

  return harden({ inputPriceAmountOut, swapInterval });
};

/**
 *
 * @param {ZoeService} zoe
 * @param {XYKAMMPublicFacet} ammPublicFacet
 * @param {IssuerKit} secondaryR
 * @param {IssuerKit} centralR
 * @param {Issuer} lpTokenIssuer
 * @param {Ratio} lowerBoundary
 * @param {BigInt} swapInterval
 * @returns {Promise<void>}
 */
export const moveFromCentralPriceDown = async (zoe,
                                               ammPublicFacet,
                                               secondaryR,
                                               centralR,
                                               lpTokenIssuer,
                                               lowerBoundary,
                                               swapInterval = 1n) => {

  const {
    swapCentralForSecondary,
    makeCentral,
    makeSecondary,
  } = await makeLiquidityInvitations(undefined, zoe, ammPublicFacet, secondaryR, centralR, lpTokenIssuer);

  const { amountOut } = await E(ammPublicFacet).getInputPrice(makeCentral(1n), makeSecondary(0n));
  let inputPriceAmountOut = amountOut;

  while (AmountMath.isGTE(inputPriceAmountOut, lowerBoundary.numerator)) {
    await swapCentralForSecondary(swapInterval);

    const { amountOut } = await E(ammPublicFacet).getInputPrice(
      makeCentral(1n),
      makeSecondary(0n),
    );
    inputPriceAmountOut = amountOut;
    // console.log('INTER_INPUT_PRICE', inputPriceAmountOut);
  }

  return harden({ inputPriceAmountOut, swapInterval });
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

// @ts-check

import { AmountMath, makeIssuerKit, AssetKind } from '@agoric/ertp';
import { assertPayoutAmount } from '@agoric/zoe/test/zoeTestHelpers.js';
import buildManualTimer from '@agoric/zoe/tools/manualTimer.js';
import { E } from '@endo/far';
import { makeLiquidityInvitations } from './ammLiquidity.js';
import { setupAmmServices, setupStopLoss } from './setup.js';
import { getAmountOut } from '@agoric/zoe/src/contractSupport/priceQuote.js';
import { floorMultiplyBy, makeRatio, makeRatioFromAmounts } from '@agoric/zoe/src/contractSupport/ratio.js';

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

export async function startAmmPool(
  zoe,
  ammPublicFacet,
  centralR,
  secondaryR,
  centralInitialValue,
  secondaryInitialValue,
) {
  // Here we are creating a pool with (central - secondary)
  const liquidityIssuer = await E(ammPublicFacet).addPool(
    secondaryR.issuer,
    'Amm',
  );

  const { addLiquidity } = await makeLiquidityInvitations(
    zoe,
    ammPublicFacet,
    secondaryR,
    centralR,
    liquidityIssuer,
  );

  const payout = await addLiquidity(secondaryInitialValue, centralInitialValue);

  return {
    zoe,
    ammPublicFacet,
    secondaryR,
    centralR,
    liquidityIssuer,
    payout,
  };
}

export async function addLiquidityToPool(
  zoe,
  ammPublicFacet,
  centralR,
  secondaryR,
  liquidityIssuer,
  centralValue,
  secondaryValue,
) {
  const { addLiquidity } = await makeLiquidityInvitations(
    zoe,
    ammPublicFacet,
    secondaryR,
    centralR,
    liquidityIssuer,
  );

  return addLiquidity(secondaryValue, centralValue);
}

export async function removeLiquidityToPool(
  zoe,
  ammPublicFacet,
  centralR,
  secondaryR,
  liquidityIssuer,
  liquidityPayment,
  liquidityValue,
) {
  const { removeLiquidity } = await makeLiquidityInvitations(
    zoe,
    ammPublicFacet,
    secondaryR,
    centralR,
    liquidityIssuer,
  );

  const payoutRemove = await removeLiquidity(liquidityPayment, liquidityValue);
  return payoutRemove;
}

export async function swapSecondaryForCentral(
  zoe,
  ammPublicFacet,
  secondaryR,
  centralR,
  liquidityIssuer,
  secondaryValueIn,
) {
  const { swapSecondaryForCentral } = await makeLiquidityInvitations(
    zoe,
    ammPublicFacet,
    secondaryR,
    centralR,
    liquidityIssuer,
  );

  const swapSeat = await swapSecondaryForCentral(secondaryValueIn);
  return swapSeat;
}

export async function swapCentralForSecondary(
  zoe,
  ammPublicFacet,
  secondaryR,
  centralR,
  liquidityIssuer,
  centralValueIn,
) {
  const { swapCentralForSecondary } = await makeLiquidityInvitations(
    zoe,
    ammPublicFacet,
    secondaryR,
    centralR,
    liquidityIssuer,
  );

  const swapSeat = await swapCentralForSecondary(centralValueIn);
  return swapSeat;
}

export const makeAssertPayouts = (
  t,
  liquidityIssuer,
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
      liquidityIssuer,
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
 * an upper and a lower boundry for stopLoss contract.
 *
 * We do the calculation by asking the current price to `fromCentral` priceAuthority
 * we get from the pool. Then we add and substract an amount we calculated from a ratio
 * called `boundryMarginRatio`.
 *
 * @param {PriceAuthority} fromCentralPA
 * @param {Amount} centralAmountIn
 * @param {Brand} secondaryBrand
 * @param {BigInt} boundryMarginValue
 */
export const getBoundries =
  async (fromCentralPA, centralAmountIn,
         secondaryBrand, boundryMarginValue = 20n) => {

    const quote = await E(fromCentralPA).quoteGiven(
      centralAmountIn,
      secondaryBrand,
    );

    const boundryMarginRatio = makeRatio(boundryMarginValue, secondaryBrand);
    const baseAmountOut = getAmountOut(quote);
    const marginAmount = floorMultiplyBy(baseAmountOut, boundryMarginRatio);

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
      marginAmount
    };
  };

/**
 *
 * @param {ZoeService} zoe
 * @param {XYKAMMPublicFacet} ammPublicFacet
 * @param {IssuerKit} secondaryR
 * @param {IssuerKit} centralR
 * @param {Issuer} liquidityIssuer
 * @param {Ratio} upperBoundry
 * @param {BigInt} swapInterval
 * @returns {Promise<void>}
 */
export const moveFromCentralPriceUp = async (zoe,
                                             ammPublicFacet,
                                             secondaryR,
                                             centralR,
                                             liquidityIssuer,
                                             upperBoundry,
                                             swapInterval = 1n) => {
  const { swapSecondaryForCentral, makeCentral, makeSecondary } = await makeLiquidityInvitations(zoe, ammPublicFacet, secondaryR, centralR, liquidityIssuer);

  const { amountOut } = await E(ammPublicFacet).getInputPrice(makeCentral(1n), makeSecondary(0n));
  let inputPriceAmountOut = amountOut

  while (AmountMath.isGTE(upperBoundry.numerator, inputPriceAmountOut)){
    await swapSecondaryForCentral(swapInterval);

    const { amountOut } = await E(ammPublicFacet).getInputPrice(makeCentral(1n), makeSecondary(0n));
    inputPriceAmountOut = amountOut;
    // console.log('INTER_INPUT_PRICE', inputPriceAmountOut);
  }

  return { inputPriceAmountOut, swapInterval };
}

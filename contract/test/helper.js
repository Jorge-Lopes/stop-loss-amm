// @ts-check

import { AmountMath, makeIssuerKit } from '@agoric/ertp';
import { assertPayoutAmount } from '@agoric/zoe/test/zoeTestHelpers.js';
import buildManualTimer from '@agoric/zoe/tools/manualTimer.js';
import { E } from '@endo/far';
import { makeLiquidityInvitations } from './ammLiquidity.js';
import { setupAmmServices, setupStopLoss } from './setup.js';

/*
  This file act as a bridge beetween the tests and the functions exported by ./ammLiquidity.js,
  the function makeAssertPayouts allow us to confirm if a payout returns what is expected;
*/

export async function startServices(t) {
  const electorateTerms = { committeeName: 'EnBancPanel', committeeSize: 3 };
  const timer = buildManualTimer(console.log);

  const centralR = makeIssuerKit('Central');
  const secondaryR = makeIssuerKit('Secondary');

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

  const payout = await addLiquidity(secondaryValue, centralValue);

  return payout;
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

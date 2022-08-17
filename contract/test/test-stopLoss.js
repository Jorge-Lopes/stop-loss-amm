// @ts-check

import { test } from '@agoric/zoe/tools/prepare-test-env-ava.js';
import { unsafeMakeBundleCache } from '@agoric/run-protocol/test/bundleTool.js';
import {
  addLiquidityToPool,
  startAmmPool,
  startServices,
  startStopLoss,
} from './helper.js';
import { AmountMath, makeIssuerKit } from '@agoric/ertp';
import { E } from '@endo/eventual-send';

test.before(async (t) => {
  const bundleCache = await unsafeMakeBundleCache('bundles/');
  t.context = { bundleCache };
});

test('start stop loss contract', async (t) => {
  const { zoe, amm, centralR, secondaryR } = await startServices(t);

  const centralInitialValue = 10_000n;
  const secondaryInitialValue = 20_000n;

  await startAmmPool(
    zoe,
    amm,
    centralR,
    secondaryR,
    centralInitialValue,
    secondaryInitialValue,
  );

  // start stop loss contract
  const { publicFacet } = await startStopLoss(zoe, amm, secondaryR);

  const poolAlocation = await E(publicFacet).getAlocation();

  t.deepEqual(
    await E(amm.ammPublicFacet).getPoolAllocation(secondaryR.brand),
    poolAlocation,
    `poolAllocation after initialization`,
  );
});

test('Test add LP tokens', async (t) => {
  const { zoe, amm, centralR, secondaryR } = await startServices(t);
  const centralInitialValue = 10_000n;
  const secondaryInitialValue = 20_000n;

  const { secondaryLiquidityIssuer } = await startAmmPool(
    zoe,
    amm,
    centralR,
    secondaryR,
    centralInitialValue,
    secondaryInitialValue,
  );

  // Add liquidity offer (secondary:central) 40_000:30_000.
  const centralValue = 30_000n;
  const secondaryValue = 70_000n;

  const payout = await addLiquidityToPool(
    zoe,
    amm,
    centralR,
    secondaryR,
    secondaryLiquidityIssuer,
    centralValue,
    secondaryValue,
  );

  const { Liquidity } = payout
  const { creatorFacet } = await startStopLoss(zoe, amm, secondaryR);

  // instead of creating a new LP token, I need to get the token from the payout!!!
  // const secondaryLiquidityBrand = await E(secondaryLiquidityIssuer).getBrand();
  // const secondaryLiquidity = (value) => AmountMath.make(secondaryLiquidityBrand, value);
  // const liquidityValue = secondaryLiquidity(30_000n)


  const lpKit = makeIssuerKit('lpToken');
  const makeLP = (value) => AmountMath.make(lpKit.brand, value);
  const lpToken = makeLP(10n)
  const lpPayment = lpKit.mint.mintPayment(lpToken)

  const invitation = await E(creatorFacet).makeAddLPTokensInvitation();
  const proposal = harden({ give: { LPTokens: lpToken } });
  const paymentKeywordRecord = harden({ LPTokens: lpPayment });

  const seat = E(zoe).offer(invitation, proposal, paymentKeywordRecord);

  const message = await E(seat).getOfferResult();

  t.deepEqual(message, 'LP Tokens locked in the amount of 10');
});

/*
Next steps:
    Define what sould be on .before func
    Interact with stopLoss Contract
*/

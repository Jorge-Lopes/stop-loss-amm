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


test('Test add Liquidity without amm', async (t) => {
  const lpKit = makeIssuerKit('Liquidity');
  const makeLP = (value) => AmountMath.make(lpKit.brand, value);
  const lpToken = makeLP(10n);
  const lpPayment = lpKit.mint.mintPayment(lpToken);

  const { zoe, amm, secondaryR } = await startServices(t);

  const secondaryBrand = secondaryR.brand;
  const terms = {
    amm,
    secondaryBrand,
  };

  const issuerKeywordRecord = harden({ Liquidity: lpKit.issuer });

  const { creatorFacet } = await startStopLoss(zoe, issuerKeywordRecord, terms);

  const invitation = await E(creatorFacet).makeAddLiquidityInvitation();
  const proposal = harden({ give: { Liquidity: lpToken } });
  const paymentKeywordRecord = harden({ Liquidity: lpPayment });

  const seat = await E(zoe).offer(invitation, proposal, paymentKeywordRecord);

  const message = await E(seat).getOfferResult();

  t.deepEqual(message, 'Liquidity locked in the amount of 10');
});

test('Test add Liquidity with amm', async (t) => {
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

  const { Liquidity } = payout;
  const liquidityAmount = await E(secondaryLiquidityIssuer).getAmountOf(
    Liquidity,
  );

  const secondaryBrand = secondaryR.brand;
  const terms = {
    amm,
    secondaryBrand,
  };
  const issuerKeywordRecord = harden({ Liquidity: secondaryLiquidityIssuer });

  const { creatorFacet } = await startStopLoss(zoe, issuerKeywordRecord, terms);

  const invitation = await E(creatorFacet).makeAddLiquidityInvitation();
  const proposal = harden({ give: { Liquidity: liquidityAmount } });
  const paymentKeywordRecord = harden({ Liquidity: Liquidity });

  const seat = await E(zoe).offer(invitation, proposal, paymentKeywordRecord);

  const message = await E(seat).getOfferResult();

  t.deepEqual(message, 'Liquidity locked in the amount of 30000');
});


test('Test remove Liquidity with amm', async (t) => {
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

  const { Liquidity } = payout;
  const liquidityAmount = await E(secondaryLiquidityIssuer).getAmountOf(
    Liquidity,
  );

  const centralBrand = centralR.brand;
  const secondaryBrand = secondaryR.brand;
  const liquidityBrand = await E(secondaryLiquidityIssuer).getBrand();

  const terms = {
    zoe,
    amm,
    centralBrand,
    secondaryBrand,
    liquidityBrand,
    secondaryLiquidityIssuer
  };
  const issuerKeywordRecord = harden({ Liquidity: secondaryLiquidityIssuer });

  const { creatorFacet } = await startStopLoss(zoe, issuerKeywordRecord, terms);

  const invitation = await E(creatorFacet).makeAddLiquidityInvitation();
  const proposal = harden({ give: { Liquidity: liquidityAmount } });
  const paymentKeywordRecord = harden({ Liquidity: Liquidity });

  const seat = await E(zoe).offer(invitation, proposal, paymentKeywordRecord);

  const message = await E(seat).getOfferResult();

  t.deepEqual(message, 'Liquidity locked in the amount of 30000');

  const message2 = await E(creatorFacet).removeLiquidity();
  t.log(message2);
});


/*
Next steps:
    Define what sould be on .before func
    Interact with stopLoss Contract
*/

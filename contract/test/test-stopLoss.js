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

  const ammPublicFacet = amm.ammPublicFacet;

  const { liquidityIssuer } = await startAmmPool(
    zoe,
    ammPublicFacet,
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
    ammPublicFacet,
    centralR,
    secondaryR,
    liquidityIssuer,
    centralValue,
    secondaryValue,
  );

  const { Liquidity } = payout;
  const liquidityAmount = await E(liquidityIssuer).getAmountOf(
    Liquidity,
  );

  const centralIssuer = centralR.issuer;
  const secondaryIssuer = secondaryR.issuer;

  const terms = {
    ammPublicFacet,
    centralIssuer,
    secondaryIssuer,
    liquidityIssuer,
  };
  const issuerKeywordRecord = {};

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

  const ammPublicFacet = amm.ammPublicFacet;

  const { liquidityIssuer } = await startAmmPool(
    zoe,
    ammPublicFacet,
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
    ammPublicFacet,
    centralR,
    secondaryR,
    liquidityIssuer,
    centralValue,
    secondaryValue,
  );

  const { Liquidity } = payout;
  const liquidityAmount = await E(liquidityIssuer).getAmountOf(
    Liquidity,
  );

  const centralIssuer = centralR.issuer;
  const secondaryIssuer = secondaryR.issuer;
  
  const terms = {
    ammPublicFacet,
    centralIssuer,
    secondaryIssuer,
    liquidityIssuer,
  };
  const issuerKeywordRecord = {};

  const { creatorFacet } = await startStopLoss(zoe, issuerKeywordRecord, terms);

  const invitation = await E(creatorFacet).makeAddLiquidityInvitation();
  const proposal = harden({ give: { Liquidity: liquidityAmount } });
  const paymentKeywordRecord = harden({ Liquidity: Liquidity });

  const seat = await E(zoe).offer(invitation, proposal, paymentKeywordRecord);

  const addLiquidityMessage = await E(seat).getOfferResult();

  t.deepEqual(addLiquidityMessage, 'Liquidity locked in the amount of 30000');

  const removeLiquidityMessage = await E(creatorFacet).removeLiquidity();
  t.log(removeLiquidityMessage);
});


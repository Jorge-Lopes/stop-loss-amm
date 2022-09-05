// @ts-check

import { test } from '@agoric/zoe/tools/prepare-test-env-ava.js';
import { unsafeMakeBundleCache } from '@agoric/run-protocol/test/bundleTool.js';
import {
  addLiquidityToPool,
  startAmmPool,
  startServices,
  startStopLoss,
} from './helper.js';
import { E } from '@endo/far';
import { AmountMath } from '@agoric/ertp';

test.before(async (t) => {
  const bundleCache = await unsafeMakeBundleCache('./bundles/');
  t.context = { bundleCache };
});

test('Test lock LP Tokens to contract', async (t) => {
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
  const liquidityAmount = await E(liquidityIssuer).getAmountOf(Liquidity);

  const centralIssuer = centralR.issuer;
  const secondaryIssuer = secondaryR.issuer;

  const terms = {
    ammPublicFacet,
    centralIssuer,
    secondaryIssuer,
    liquidityIssuer,
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

  const invitation = E(creatorFacet).makeLockLPTokensInvitation();
  const proposal = harden({ give: { Liquidity: liquidityAmount } });
  const paymentKeywordRecord = harden({ Liquidity: Liquidity });

  const seat = await E(zoe).offer(invitation, proposal, paymentKeywordRecord);

  const [addLiquidityMessage, liquidityBalance] = await Promise.all([
    E(seat).getOfferResult(),
    E(publicFacet).getBalanceByBrand('Liquidity', liquidityIssuer),
  ]);

  t.deepEqual(addLiquidityMessage, 'Liquidity locked in the value of 30000');
  t.deepEqual(liquidityBalance, liquidityAmount); // Make sure the balance in the contract is as expected
});

test('Test remove Liquidity from AMM', async (t) => {
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
  const liquidityAmount = await E(liquidityIssuer).getAmountOf(Liquidity);

  const centralIssuer = centralR.issuer;
  const secondaryIssuer = secondaryR.issuer;

  const terms = {
    ammPublicFacet,
    centralIssuer,
    secondaryIssuer,
    liquidityIssuer,
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

  const addLiquidityInvitation =
    E(creatorFacet).makeLockLPTokensInvitation();
  const proposal = harden({ give: { Liquidity: liquidityAmount } });
  const paymentKeywordRecord = harden({ Liquidity: Liquidity });

  const addLiquiditSeat = await E(zoe).offer(
    addLiquidityInvitation,
    proposal,
    paymentKeywordRecord,
  );
  const [addLiquidityMessage, addLiquidityTokenBalance] = await Promise.all([
    E(addLiquiditSeat).getOfferResult(),
    E(publicFacet).getBalanceByBrand('Liquidity', liquidityIssuer),
  ]);

  t.deepEqual(addLiquidityMessage, 'Liquidity locked in the value of 30000');
  t.deepEqual(addLiquidityTokenBalance, liquidityAmount); // Make sure the balance in the contract is as expected

  // remove Assets from AMM
  const removeLiquidityMessage = await E(creatorFacet).removeLiquidityFromAmm();
  t.deepEqual(removeLiquidityMessage, 'Liquidity successfully removed.')
  
  const [centralBalance, secondaryBalance, lpTokenBalance] = await Promise.all([
    E(publicFacet).getBalanceByBrand('Central', centralIssuer),
    E(publicFacet).getBalanceByBrand('Secondary', secondaryIssuer),
    E(publicFacet).getBalanceByBrand('Amm', liquidityIssuer),
  ])

  // verify that balance holded in stopLoss seat was correctly updated
  // TODO: verify with the amounts instead of values
  t.deepEqual(centralBalance.value, 30_000n);
  t.deepEqual(secondaryBalance.value, 60_000n);
  t.deepEqual(lpTokenBalance.value, 0n);

});

test('Test notifier', async (t) => {
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
  const liquidityAmount = await E(liquidityIssuer).getAmountOf(Liquidity);

  const centralIssuer = centralR.issuer;
  const secondaryIssuer = secondaryR.issuer;

  const terms = {
    ammPublicFacet,
    centralIssuer,
    secondaryIssuer,
    liquidityIssuer,
  };

  const issuerKeywordRecord = harden({
    Central: centralIssuer,
    Secondary: secondaryIssuer,
    Liquidity: liquidityIssuer,
  });

  const { creatorFacet } = await startStopLoss(
    zoe,
    issuerKeywordRecord,
    terms,
  );

  const addLiquidityInvitation =
    E(creatorFacet).makeLockLPTokensInvitation();
  const proposal = harden({ give: { Liquidity: liquidityAmount } });
  const paymentKeywordRecord = harden({ Liquidity: Liquidity });

  await E(zoe).offer(
    addLiquidityInvitation,
    proposal,
    paymentKeywordRecord,
  );

  await E(creatorFacet).removeLiquidityFromAmm();

  const allocationStateNotifier = await E(creatorFacet).getNotifier();
  const {value: allocationState} = await E(allocationStateNotifier).getUpdateSince();

  t.deepEqual(allocationState.phase, 'liquidated');

  const centralBalance = allocationState.liquidityBalance.central;
  const secondaryBalance = allocationState.liquidityBalance.secondary;
  const lpTokenBalance = allocationState.lpBalance;

  const centralBrand = centralR.brand;
  const secondaryBrand = secondaryR.brand;
  const liquidityBrand = await E(liquidityIssuer).getBrand();
  const centralAmount = (value) => AmountMath.make(centralBrand, value);
  const secondaryAmount = (value) => AmountMath.make(secondaryBrand, value);
  const liquidityAmountTest = (value) => AmountMath.make(liquidityBrand, value);

  // verify that balance holded in stopLoss seat was correctly updated
  t.deepEqual(centralBalance, centralAmount(30_000n));
  t.deepEqual(secondaryBalance, secondaryAmount(60_000n));
  t.deepEqual(lpTokenBalance, liquidityAmountTest(0n));
});
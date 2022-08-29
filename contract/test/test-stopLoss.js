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

test.before(async (t) => {
  const bundleCache = await unsafeMakeBundleCache('./bundles/');
  t.context = { bundleCache };
});

test('Test add Liquidity to contract', async (t) => {
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

  const invitation = E(creatorFacet).makeAddLiquidityToContractInvitation();
  const proposal = harden({ give: { Liquidity: liquidityAmount } });
  const paymentKeywordRecord = harden({ Liquidity: Liquidity });

  const seat = await E(zoe).offer(invitation, proposal, paymentKeywordRecord);

  const [addLiquidityMessage, liquidityTokenBalance] = await Promise.all([
    E(seat).getOfferResult(),
    E(publicFacet).getLiquidityBalance(),
  ]);

  t.deepEqual(addLiquidityMessage, 'Liquidity locked in the amount of 30000');
  t.deepEqual(liquidityTokenBalance, liquidityAmount); // Make sure the balance in the contract is as expected
});

test('Test remove Assets from AMM', async (t) => {
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
    E(creatorFacet).makeAddLiquidityToContractInvitation();
  const proposal = harden({ give: { Liquidity: liquidityAmount } });
  const paymentKeywordRecord = harden({ Liquidity: Liquidity });

  const addLiquiditSeat = await E(zoe).offer(
    addLiquidityInvitation,
    proposal,
    paymentKeywordRecord,
  );
  const [addLiquidityMessage, addLiquidityTokenBalance] = await Promise.all([
    E(addLiquiditSeat).getOfferResult(),
    E(publicFacet).getLiquidityBalance(),
  ]);

  t.deepEqual(addLiquidityMessage, 'Liquidity locked in the amount of 30000');
  t.deepEqual(addLiquidityTokenBalance, liquidityAmount); // Make sure the balance in the contract is as expected

  // remove Assets from AMM
  const removeLiquiditySeat = await E(creatorFacet).removeAssetsFromAmm();
  const [removeLiquidityMessage, removeLiquidityTokenBalance] = await Promise.all([
    E(removeLiquiditySeat).getOfferResult(),
    E(publicFacet).getLiquidityBalance(),
  ]);

  t.deepEqual(removeLiquidityMessage, 'Liquidity successfully removed.');
  t.deepEqual(removeLiquidityTokenBalance.value, 0n)

  const print = await E(removeLiquiditySeat).getCurrentAllocation();
  t.log(print);

});

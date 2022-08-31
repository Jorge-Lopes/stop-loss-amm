// @ts-check

import { test } from '@agoric/zoe/tools/prepare-test-env-ava.js';
import { unsafeMakeBundleCache } from '@agoric/run-protocol/test/bundleTool.js';
import {
  addLiquidityToPool,
  startAmmPool,
  startServices,
  startStopLoss,
  swapSecondaryForCentral, 
  swapCentralForSecondary,
} from './helper.js';
import { E } from '@endo/far';

test.before(async (t) => {
  const bundleCache = await unsafeMakeBundleCache('./bundles/');
  t.context = { bundleCache };
});

test('Test lock LP tokens in contract', async (t) => {
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
  const removeLiquiditySeat = await E(creatorFacet).removeLiquidityFromAmm();
  const [removeLiquidityMessage, removeLiquidityTokenBalance] = await Promise.all([
    E(removeLiquiditySeat).getOfferResult(),
    E(publicFacet).getBalanceByBrand('Liquidity', liquidityIssuer),
  ]);

  t.deepEqual(removeLiquidityMessage, 'Liquidity successfully removed.');
  t.deepEqual(removeLiquidityTokenBalance.value, 0n);

  const {Central: centralTokenBalance, Secondary: secondaryTokenBalance} = await E(removeLiquiditySeat).getCurrentAllocation();

  t.deepEqual(centralTokenBalance.value, 30_000n);
  t.deepEqual(secondaryTokenBalance.value, 60_000n);

});


test('Test get Quote Given from Central', async (t) => {
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

  const quote = await E(publicFacet).getQuotefromCentral(10_000n);
  t.deepEqual(quote.value, 15_953n)

});

test('Test get Quote When GTE from Central', async (t) => {
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

  const quote = await E(publicFacet).getQuotefromCentral(10_000n);
  t.truthy(quote.value <= 16_000n); // verify that quote is under the valueOut defined next
  
  // make a swap to change the quote and triger the quoteWhen promise
  const secondaryValueIn = 2_000n;
  const swapSeat = swapSecondaryForCentral(
    zoe,
    ammPublicFacet,
    secondaryR,
    centralR,
    liquidityIssuer,
    secondaryValueIn,
  );
  t.is(await E(swapSeat).getOfferResult(), 'Swap successfully completed.');

  const quoteWhenGTE = await E(publicFacet).getQuoteWhenGreaterFromCentral(10_000n, 16_000n);
  t.truthy(quoteWhenGTE); // verify that the promise was resolved and a quote was returned

  const updatedQuote = await E(publicFacet).getQuotefromCentral(10_000n);
  t.truthy(updatedQuote.value >= 16_000n)// verify that quote is above the valueOut defined above

});

test('Test get Quote When LTE from Central', async (t) => {
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

  const quote = await E(publicFacet).getQuotefromCentral(10_000n);
  t.truthy(quote.value>= 15_000n); // verify that quote is above the valueOut defined next
  
  // make a swap to change the quote and triger the quoteWhen promise
  const centralValueIn = 2_000n;
  const swapSeat = swapCentralForSecondary(
    zoe,
    ammPublicFacet,
    secondaryR,
    centralR,
    liquidityIssuer,
    centralValueIn,
  );
  t.is(await E(swapSeat).getOfferResult(), 'Swap successfully completed.');

  const quoteWhenLTE = await E(publicFacet).getQuoteWhenLowerFromCentral(10_000n, 15_000n);
  t.truthy(quoteWhenLTE); // verify that the promise was resolved and a quote was returned

  const updatedQuote = await E(publicFacet).getQuotefromCentral(10_000n);
  t.truthy(updatedQuote.value <= 15_000n)// verify that quote is under the valueOut defined above

});
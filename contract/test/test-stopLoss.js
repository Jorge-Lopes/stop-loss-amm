// @ts-check

import { test } from '@agoric/zoe/tools/prepare-test-env-ava.js';
import { unsafeMakeBundleCache } from '@agoric/run-protocol/test/bundleTool.js';
import {
  addLiquidityToPool,
  startAmmPool,
  startServices,
  startStopLoss,
  swapSecondaryForCentral,
  swapCentralForSecondary, getBoundries, moveFromCentralPriceUp,
} from './helper.js';
import { E } from '@endo/far';
import { AmountMath } from '@agoric/ertp/src/amountMath.js';
import { makeRatioFromAmounts } from '@agoric/zoe/src/contractSupport/ratio.js';
import { waitForPromisesToSettle } from '@agoric/run-protocol/test/supports.js';

test.before(async (t) => {
  const bundleCache = await unsafeMakeBundleCache('./bundles/');

  const makeAmountBuilderInUnit = (brand, displayInfo) => {

    const { decimalPlaces } = displayInfo;

    /**
     * @param {BigInt} value
     * @returns {Amount<K>}
     */
    const makeAmount = value => {
      return AmountMath.make(brand, value * 10n ** BigInt(decimalPlaces));
    };

    return { makeAmount };
  };

  t.context = { bundleCache, makeAmountBuilderInUnit };
});

test('Test lock LP tokens in contract', async (t) => {
  const { zoe, amm, centralR, secondaryR } = await startServices(t);
  const centralInitialValue = 10_000n;
  const secondaryInitialValue = 20_000n;

  const { makeAmountBuilderInUnit } = t.context;

  const { makeAmount: centralInUnit } = makeAmountBuilderInUnit(centralR.brand, centralR.displayInfo);
  const { makeAmount: secondaryInUnit } = makeAmountBuilderInUnit(secondaryR.brand, secondaryR.displayInfo);

  /** @type XYKAMMPublicFacet */
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
  const centralValue = 30n;
  const secondaryValue = 70n;

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
  const [liquidityAmount, { fromCentral: fromCentralPA }] = await Promise.all([
    E(liquidityIssuer).getAmountOf(Liquidity),
    E(ammPublicFacet).getPriceAuthorities(secondaryR.brand)
  ]);

  const centralIssuer = centralR.issuer;
  const secondaryIssuer = secondaryR.issuer;

  const boundries = await getBoundries(fromCentralPA, centralInUnit(1n), secondaryR.brand);

  const terms = {
    ammPublicFacet,
    centralIssuer,
    secondaryIssuer,
    liquidityIssuer,
    boundries
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

  /** @type XYKAMMPublicFacet */
  const ammPublicFacet = amm.ammPublicFacet;

  const { makeAmountBuilderInUnit } = t.context;

  const { makeAmount: centralInUnit } = makeAmountBuilderInUnit(centralR.brand, centralR.displayInfo);
  const { makeAmount: secondaryInUnit } = makeAmountBuilderInUnit(secondaryR.brand, secondaryR.displayInfo);

  const { liquidityIssuer } = await startAmmPool(
    zoe,
    ammPublicFacet,
    centralR,
    secondaryR,
    centralInitialValue,
    secondaryInitialValue,
  );

  // Add liquidity offer (secondary:central) 40_000:30_000.
  const centralValue = 30n;
  const secondaryValue = 70n;

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
  const [liquidityAmount, { fromCentral: fromCentralPA }] = await Promise.all([
    E(liquidityIssuer).getAmountOf(Liquidity),
    E(ammPublicFacet).getPriceAuthorities(secondaryR.brand)
  ]);

  const centralIssuer = centralR.issuer;
  const secondaryIssuer = secondaryR.issuer;

  const boundries = await getBoundries(fromCentralPA, centralInUnit(1n), secondaryR.brand);

  const terms = {
    ammPublicFacet,
    centralIssuer,
    secondaryIssuer,
    liquidityIssuer,
    boundries
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

  /** @type XYKAMMPublicFacet */
  const ammPublicFacet = amm.ammPublicFacet;

  const { makeAmountBuilderInUnit } = t.context;

  const { makeAmount: centralInUnit } = makeAmountBuilderInUnit(centralR.brand, centralR.displayInfo);
  const { makeAmount: secondaryInUnit } = makeAmountBuilderInUnit(secondaryR.brand, secondaryR.displayInfo);


  const { liquidityIssuer } = await startAmmPool(
    zoe,
    ammPublicFacet,
    centralR,
    secondaryR,
    centralInitialValue,
    secondaryInitialValue,
  );

  // Add liquidity offer (secondary:central) 40_000:30_000.
  const centralValue = 30n;
  const secondaryValue = 70n;

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
  const [liquidityAmount, { fromCentral: fromCentralPA }] = await Promise.all([
    E(liquidityIssuer).getAmountOf(Liquidity),
    E(ammPublicFacet).getPriceAuthorities(secondaryR.brand)
  ]);

  const centralIssuer = centralR.issuer;
  const secondaryIssuer = secondaryR.issuer;

  const boundries = await getBoundries(fromCentralPA, centralInUnit(1n), secondaryR.brand);

  const terms = {
    ammPublicFacet,
    centralIssuer,
    secondaryIssuer,
    liquidityIssuer,
    boundries
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

  /** @type XYKAMMPublicFacet */
  const ammPublicFacet = amm.ammPublicFacet;

  const { makeAmountBuilderInUnit } = t.context;

  const { makeAmount: centralInUnit } = makeAmountBuilderInUnit(centralR.brand, centralR.displayInfo);
  const { makeAmount: secondaryInUnit } = makeAmountBuilderInUnit(secondaryR.brand, secondaryR.displayInfo);


  const { liquidityIssuer } = await startAmmPool(
    zoe,
    ammPublicFacet,
    centralR,
    secondaryR,
    centralInitialValue,
    secondaryInitialValue,
  );

  // Add liquidity offer (secondary:central) 40_000:30_000.
  const centralValue = 30n;
  const secondaryValue = 70n;

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
  const [liquidityAmount, { fromCentral: fromCentralPA }] = await Promise.all([
    E(liquidityIssuer).getAmountOf(Liquidity),
    E(ammPublicFacet).getPriceAuthorities(secondaryR.brand)
  ]);

  const centralIssuer = centralR.issuer;
  const secondaryIssuer = secondaryR.issuer;

  const boundries = await getBoundries(fromCentralPA, centralInUnit(1n), secondaryR.brand);

  const terms = {
    ammPublicFacet,
    centralIssuer,
    secondaryIssuer,
    liquidityIssuer,
    boundries
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

  /** @type XYKAMMPublicFacet */
  const ammPublicFacet = amm.ammPublicFacet;

  const { makeAmountBuilderInUnit } = t.context;

  const { makeAmount: centralInUnit } = makeAmountBuilderInUnit(centralR.brand, centralR.displayInfo);
  const { makeAmount: secondaryInUnit } = makeAmountBuilderInUnit(secondaryR.brand, secondaryR.displayInfo);

  const { liquidityIssuer } = await startAmmPool(
    zoe,
    ammPublicFacet,
    centralR,
    secondaryR,
    centralInitialValue,
    secondaryInitialValue,
  );

  // Add liquidity offer (secondary:central) 40_000:30_000.
  const centralValue = 30n;
  const secondaryValue = 70n;

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
  const [liquidityAmount, { fromCentral: fromCentralPA }] = await Promise.all([
    E(liquidityIssuer).getAmountOf(Liquidity),
    E(ammPublicFacet).getPriceAuthorities(secondaryR.brand)
  ]);

  const centralIssuer = centralR.issuer;
  const secondaryIssuer = secondaryR.issuer;

  const boundries = await getBoundries(fromCentralPA, centralInUnit(1n), secondaryR.brand);

  const terms = {
    ammPublicFacet,
    centralIssuer,
    secondaryIssuer,
    liquidityIssuer,
    boundries
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

test('trigger-lp-removal', async (t) => {
  const { zoe, amm, centralR, secondaryR } = await startServices(t);
  const centralInitialValue = 10_000n;
  const secondaryInitialValue = 20_000n;

  /** @type XYKAMMPublicFacet */
  const ammPublicFacet = amm.ammPublicFacet;

  const { makeAmountBuilderInUnit } = t.context;

  const { makeAmount: centralInUnit } = makeAmountBuilderInUnit(centralR.brand, centralR.displayInfo);
  const { makeAmount: secondaryInUnit } = makeAmountBuilderInUnit(secondaryR.brand, secondaryR.displayInfo);

  const { /** @type Issuer */ liquidityIssuer } = await startAmmPool(
    zoe,
    ammPublicFacet,
    centralR,
    secondaryR,
    centralInitialValue,
    secondaryInitialValue,
  );

  // Add liquidity offer (secondary:central) 40_000:30_000.
  const centralValue = 30n;
  const secondaryValue = 60n;

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
  const [liquidityAmount, { fromCentral: fromCentralPA }] = await Promise.all([
    E(liquidityIssuer).getAmountOf(Liquidity),
    E(ammPublicFacet).getPriceAuthorities(secondaryR.brand)
  ]);

  const centralIssuer = centralR.issuer;
  const secondaryIssuer = secondaryR.issuer;

  const boundries = await getBoundries(fromCentralPA, centralInUnit(1n), secondaryR.brand);
  console.log('BOUNDRIES', boundries);

  const terms = {
    ammPublicFacet,
    centralIssuer,
    secondaryIssuer,
    liquidityIssuer,
    boundries
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

  t.deepEqual(addLiquidityMessage, `Liquidity locked in the value of ${liquidityAmount.value}`);
  t.deepEqual(addLiquidityTokenBalance, liquidityAmount); // Make sure the balance in the contract is as expected

  console.log('Moving the price up...')
  const { inputPriceAmountOut: inputPriceAfter, swapInterval } = await moveFromCentralPriceUp(zoe, ammPublicFacet, secondaryR, centralR, liquidityIssuer, boundries.upper, 10n);
  console.log('Done')
  console.log("INPUT_PRICE_AFTER", inputPriceAfter);

  await swapSecondaryForCentral(zoe, ammPublicFacet, secondaryR, centralR, liquidityIssuer, swapInterval);
  await waitForPromisesToSettle();

  const [liquidityAmountAllocated, centralAmountAllocated, secondaryAmountAllocated] = await Promise.all([
    E(publicFacet).getBalanceByBrand('Liquidity', liquidityIssuer),
    E(publicFacet).getBalanceByBrand('Central', centralR.issuer),
    E(publicFacet).getBalanceByBrand('Secondary', secondaryR.issuer),
  ]);

  console.log('Liquidity', liquidityAmountAllocated);
  console.log('Central', centralAmountAllocated);
  console.log('Secondary', secondaryAmountAllocated);

});
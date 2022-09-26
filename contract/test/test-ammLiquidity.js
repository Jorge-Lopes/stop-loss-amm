// @ts-check

import '@agoric/zoe/tools/prepare-test-env.js';
import test from 'ava';
import { E } from '@endo/far';
import { AmountMath } from '@agoric/ertp';
import { unsafeMakeBundleCache } from '@agoric/swingset-vat/tools/bundleTool.js';
import {
  addLiquidityToPool,
  makeAssertPayouts,
  removeLiquidityFromPool,
  startAmmPool,
  startServices,
  swapSecondaryForCentral,
} from './helper.js';

/*
  This test will execute all functions exported by ./ammLiquidity.js
  Confirming that the amm instance created by ./setup.js is working properly
  as well as the functions to interact with this environment.
*/

test.before(async (t) => {
  const bundleCache = await unsafeMakeBundleCache('bundles/');

  const makeAllocations = (centralR, lpTokenR, secondaryR) => {
    const allocations = (c, l, s) => ({
      Central: AmountMath.make(centralR.brand, c * 10n ** BigInt(centralR.displayInfo.decimalPlaces)),
      Liquidity: AmountMath.make(lpTokenR.brand, l * 10n ** BigInt(lpTokenR.displayInfo.decimalPlaces)),
      Secondary: AmountMath.make(secondaryR.brand, s * 10n ** BigInt(secondaryR.displayInfo.decimalPlaces)),
    });

    return harden(allocations);
  }


  t.context = { bundleCache, makeAllocations };
});

test('start amm pool', async (t) => {
  const { makeAllocations } = t.context;
  const { zoe, amm, centralR, secondaryR } = await startServices(t);

  const centralInitialValue = 10n;
  const secondaryInitialValue = 20n;

  const { lpTokenIssuer } = await startAmmPool(
    t,
    zoe,
    amm.ammPublicFacet,
    centralR,
    secondaryR,
    'SCR',
    centralInitialValue,
    secondaryInitialValue,
  );

  const [lpTokenBrand, lpTokenDisplayInfo] = await Promise.all([
    E(lpTokenIssuer).getBrand(),
    E(E(lpTokenIssuer).getBrand()).getDisplayInfo()
  ]);

  const lpTokenR = { brand: lpTokenBrand, displayInfo: lpTokenDisplayInfo };

  const allocations  = makeAllocations(centralR, lpTokenR, secondaryR);

  t.deepEqual(
    await E(amm.ammPublicFacet).getPoolAllocation(secondaryR.brand),
    allocations(10n, 0n, 20n),
    `poolAllocation after initialization`,
  );
});

test('amm add liquidity', async (t) => {
  const { makeAllocations } = t.context;
  const { zoe, amm, centralR, secondaryR } = await startServices(t);

  const centralInitialValue = 10n;
  const secondaryInitialValue = 20n;

  const { lpTokenIssuer } = await startAmmPool(
    t,
    zoe,
    amm.ammPublicFacet,
    centralR,
    secondaryR,
    'SCR',
    centralInitialValue,
    secondaryInitialValue,
  );

  const [lpTokenBrand, lpTokenDisplayInfo] = await Promise.all([
    E(lpTokenIssuer).getBrand(),
    E(E(lpTokenIssuer).getBrand()).getDisplayInfo()
  ]);

  const lpTokenR = { brand: lpTokenBrand, displayInfo: lpTokenDisplayInfo };

  const allocations  = makeAllocations(centralR, lpTokenR, secondaryR);

  t.deepEqual(
    await E(amm.ammPublicFacet).getPoolAllocation(secondaryR.brand),
    allocations(10n, 0n, 20n),
    `poolAllocation after initialization`,
  );

  // Add Liquidity to pool
  const centralValue = 30n;
  const secondaryValue = 70n;

  const assertPayouts = makeAssertPayouts(
    t,
    lpTokenIssuer,
    lpTokenBrand,
    centralR,
    secondaryR,
  );

  const payout = await addLiquidityToPool(
    t,
    zoe,
    amm.ammPublicFacet,
    centralR,
    secondaryR,
    lpTokenIssuer,
    centralValue,
    secondaryValue,
  );

  const { Central: c1, Liquidity: l1, Secondary: s1 } = payout;

  // value is multiplied by 100000000n to be consistent with (value * 10n ** BigInt(secondaryR.displayInfo.decimalPlaces)
  await assertPayouts(l1, (30n * 100000000n), c1, 0n, s1, (10n * 100000000n));

  t.deepEqual(
    await E(amm.ammPublicFacet).getPoolAllocation(secondaryR.brand),
    allocations(40n, 0n, 80n),
    `poolAllocation after add liquidity`,
  );
});

test('amm add and remove liquidity', async (t) => {
  const { makeAllocations } = t.context;
  const { zoe, amm, centralR, secondaryR } = await startServices(t);

  const centralInitialValue = 10n;
  const secondaryInitialValue = 20n;

  const { lpTokenIssuer } = await startAmmPool(
    t,
    zoe,
    amm.ammPublicFacet,
    centralR,
    secondaryR,
    'SCR',
    centralInitialValue,
    secondaryInitialValue,
  );

  const [lpTokenBrand, lpTokenDisplayInfo] = await Promise.all([
    E(lpTokenIssuer).getBrand(),
    E(E(lpTokenIssuer).getBrand()).getDisplayInfo()
  ]);

  const lpTokenR = { brand: lpTokenBrand, displayInfo: lpTokenDisplayInfo };

  const allocations  = makeAllocations(centralR, lpTokenR, secondaryR);

  t.deepEqual(
    await E(amm.ammPublicFacet).getPoolAllocation(secondaryR.brand),
    allocations(10n, 0n, 20n),
    `poolAllocation after initialization`,
  );

  const centralValue = 30n;
  const secondaryValue = 70n;

  const assertPayouts = makeAssertPayouts(
    t,
    lpTokenIssuer,
    lpTokenBrand,
    centralR,
    secondaryR,
  );

  const payout = await addLiquidityToPool(
    t,
    zoe,
    amm.ammPublicFacet,
    centralR,
    secondaryR,
    lpTokenIssuer,
    centralValue,
    secondaryValue,
  );

  const { Central: c1, Liquidity: l1, Secondary: s1 } = payout;

  // value is multiplied by 100000000n to be consistent with (value * 10n ** BigInt(secondaryR.displayInfo.decimalPlaces)
  await assertPayouts(l1, (30n * 100000000n), c1, 0n, s1, (10n * 100000000n));

  t.deepEqual(
    await E(amm.ammPublicFacet).getPoolAllocation(secondaryR.brand),
    allocations(40n, 0n, 80n),
    `poolAllocation after add liquidity`,
  );

  const liquidityPayment = l1;
  const liquidityAmount = await E(lpTokenIssuer).getAmountOf(liquidityPayment);
  const liquidityValue = liquidityAmount.value

  const payoutRemove = removeLiquidityFromPool(
    t,
    zoe,
    amm.ammPublicFacet,
    centralR,
    secondaryR,
    lpTokenIssuer,
    liquidityPayment,
    liquidityValue,
  );

  const { Central: c2, Liquidity: l2, Secondary: s2 } = await payoutRemove;

  await assertPayouts(l2, 0n, c2, (30n * 100000000n), s2, (60n * 100000000n));

  t.deepEqual(
    await E(amm.ammPublicFacet).getPoolAllocation(secondaryR.brand),
    allocations(10n, 3000n, 20n),
    `poolAllocation after remove liquidity`,
  );
});

test('amm swap secondary for central', async (t) => {
  const { makeAllocations } = t.context;
  const { zoe, amm, centralR, secondaryR } = await startServices(t);

  const centralInitialValue = 10n;
  const secondaryInitialValue = 20n;

  const { lpTokenIssuer } = await startAmmPool(
    t,
    zoe,
    amm.ammPublicFacet,
    centralR,
    secondaryR,
    'SCR',
    centralInitialValue,
    secondaryInitialValue,
  );

  const [lpTokenBrand, lpTokenDisplayInfo] = await Promise.all([
    E(lpTokenIssuer).getBrand(),
    E(E(lpTokenIssuer).getBrand()).getDisplayInfo()
  ]);

  const lpTokenR = { brand: lpTokenBrand, displayInfo: lpTokenDisplayInfo };

  const allocations  = makeAllocations(centralR, lpTokenR, secondaryR);

  t.deepEqual(
    await E(amm.ammPublicFacet).getPoolAllocation(secondaryR.brand),
    allocations(10n, 0n, 20n),
    `poolAllocation after initialization`,
  );

  const secondaryValueIn = 2n;

  const swapSeat = swapSecondaryForCentral(
    t,
    zoe,
    amm.ammPublicFacet,
    secondaryR,
    centralR,
    lpTokenIssuer,
    secondaryValueIn,
  );

  t.is(await E(swapSeat).getOfferResult(), 'Swap successfully completed.');

});



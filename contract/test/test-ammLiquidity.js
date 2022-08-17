// @ts-check

import { test } from '@agoric/zoe/tools/prepare-test-env-ava.js';
import { E } from '@endo/eventual-send';
import { AmountMath } from '@agoric/ertp';
import { unsafeMakeBundleCache } from '@agoric/run-protocol/test/bundleTool.js';
import {
  addLiquidityToPool,
  makeAssertPayouts,
  removeLiquidityToPool,
  startAmmPool,
  startServices,
  swap,
} from './helper.js';

/*
  This test will execute all functions exported by ./ammLiquidity.js
  Confirming that the amm instance created by ./setup.js is working properly as well as the functions to interact with this environment.
*/

test.before(async (t) => {
  const bundleCache = await unsafeMakeBundleCache('bundles/');
  t.context = { bundleCache };
});

test('start amm pool', async (t) => {
  const { zoe, amm, centralR, secondaryR } = await startServices(t);

  const centralInitialValue = 10_000n;
  const secondaryInitialValue = 20_000n;

  const { secondaryLiquidityIssuer, payout } = await startAmmPool(
    zoe,
    amm,
    centralR,
    secondaryR,
    centralInitialValue,
    secondaryInitialValue,
  );

  const liquidityBrand = await E(secondaryLiquidityIssuer).getBrand();

  const allocation = (c, l, s) => ({
    Central: AmountMath.make(centralR.brand, c),
    Liquidity: AmountMath.make(liquidityBrand, l),
    Secondary: AmountMath.make(secondaryR.brand, s),
  });

  t.deepEqual(
    await E(amm.ammPublicFacet).getPoolAllocation(secondaryR.brand),
    allocation(10_000n, 0n, 20_000n),
    `poolAllocation after initialization`,
  );
});

test('amm add liquidity', async (t) => {
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

  const liquidityBrand = await E(secondaryLiquidityIssuer).getBrand();

  const allocation = (c, l, s) => ({
    Central: AmountMath.make(centralR.brand, c),
    Liquidity: AmountMath.make(liquidityBrand, l),
    Secondary: AmountMath.make(secondaryR.brand, s),
  });

  t.deepEqual(
    await E(amm.ammPublicFacet).getPoolAllocation(secondaryR.brand),
    allocation(10_000n, 0n, 20_000n),
    `poolAllocation after initialization`,
  );

  // Add liquidity offer (secundary:central) 40_000:30_000.
  const centralValue = 30_000n;
  const secondaryValue = 70_000n;

  const assertPayouts = makeAssertPayouts(
    t,
    secondaryLiquidityIssuer,
    liquidityBrand,
    centralR,
    secondaryR,
  );

  const payout = await addLiquidityToPool(
    zoe,
    amm,
    centralR,
    secondaryR,
    secondaryLiquidityIssuer,
    centralValue,
    secondaryValue,
  );

  const { Central: c1, Liquidity: l1, Secondary: s1 } = payout;

  // It will be accepted at a ratio of 1:2 = (30_000:60_000) 10_000 Secondary will be returned
  await assertPayouts(l1, 30_000n, c1, 0n, s1, 10_000n);

  // The pool should now have 10K + 30K and 20K + 60K
  t.deepEqual(
    await E(amm.ammPublicFacet).getPoolAllocation(secondaryR.brand),
    allocation(40_000n, 0n, 80_000n),
    `poolAllocation after add liquidity`,
  );
});

test('amm add and remove liquidity', async (t) => {
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

  const liquidityBrand = await E(secondaryLiquidityIssuer).getBrand();

  const allocation = (c, l, s) => ({
    Central: AmountMath.make(centralR.brand, c),
    Liquidity: AmountMath.make(liquidityBrand, l),
    Secondary: AmountMath.make(secondaryR.brand, s),
  });

  t.deepEqual(
    await E(amm.ammPublicFacet).getPoolAllocation(secondaryR.brand),
    allocation(10_000n, 0n, 20_000n),
    `poolAllocation after initialization`,
  );

  // Add liquidity offer (secundary:central) 40_000:30_000.
  const centralValue = 30_000n;
  const secondaryValue = 70_000n;

  const assertPayouts = makeAssertPayouts(
    t,
    secondaryLiquidityIssuer,
    liquidityBrand,
    centralR,
    secondaryR,
  );

  const payoutAdd = await addLiquidityToPool(
    zoe,
    amm,
    centralR,
    secondaryR,
    secondaryLiquidityIssuer,
    centralValue,
    secondaryValue,
  );

  const { Central: c1, Liquidity: l1, Secondary: s1 } = payoutAdd;

  // It will be accepted at a ratio of 1:2 = (30_000:60_000) 10_000 Secondary will be returned
  await assertPayouts(l1, 30_000n, c1, 0n, s1, 10_000n);

  // The pool should now have 10K + 30K and 20K + 60K
  t.deepEqual(
    await E(amm.ammPublicFacet).getPoolAllocation(secondaryR.brand),
    allocation(40_000n, 0n, 80_000n),
    `poolAllocation after add liquidity`,
  );

  // Remove liquidity using the Liquidity tokens

  const liquidityPayment = l1;
  const liquidityValue = 30_000n;

  const payoutRemove = removeLiquidityToPool(
    zoe,
    amm,
    centralR,
    secondaryR,
    secondaryLiquidityIssuer,
    liquidityPayment,
    liquidityValue,
  );

  const { Central: c2, Liquidity: l2, Secondary: s2 } = await payoutRemove;

  // 30K is 3/4 of liquidity. Should get 3/4 of Central and Secondary.
  await assertPayouts(l2, 0n, c2, 30_000n, s2, 60_000n);

  t.deepEqual(
    await E(amm.ammPublicFacet).getPoolAllocation(secondaryR.brand),
    allocation(10_000n, 30_000n, 20_000n),
    `poolAllocation after remove liquidity`,
  );
});

test('amm swap secondary for central', async (t) => {
  const { zoe, amm, centralR, secondaryR } = await startServices(t);

  const centralInitialValue = 10_000n;
  const secondaryInitialValue = 20_000n;

  const { secondaryLiquidityIssuer, payout } = await startAmmPool(
    zoe,
    amm,
    centralR,
    secondaryR,
    centralInitialValue,
    secondaryInitialValue,
  );

  const liquidityBrand = await E(secondaryLiquidityIssuer).getBrand();

  const allocation = (c, l, s) => ({
    Central: AmountMath.make(centralR.brand, c),
    Liquidity: AmountMath.make(liquidityBrand, l),
    Secondary: AmountMath.make(secondaryR.brand, s),
  });

  t.deepEqual(
    await E(amm.ammPublicFacet).getPoolAllocation(secondaryR.brand),
    allocation(10_000n, 0n, 20_000n),
    `poolAllocation after initialization`,
  );

  const secondaryValueIn = 2_000n;

  const swapSeat = swap(
    zoe,
    amm,
    secondaryR,
    centralR,
    secondaryLiquidityIssuer,
    secondaryValueIn,
  );

  t.is(await E(swapSeat).getOfferResult(), 'Swap successfully completed.');

  const secondaryPayout = await E(swapSeat).getPayout('In');
  const centralPayout = await E(swapSeat).getPayout('Out');

  const secundaryAmount = await E(secondaryR.issuer).getAmountOf(
    secondaryPayout,
  );
  const centralAmount = await E(centralR.issuer).getAmountOf(centralPayout);

  t.log(secundaryAmount.value);
  t.log(centralAmount.value);

  /*
    ToDo:
    Learn how to calculate fees
    assert that secondaryPayout and centralPayout are correct
    assert final pool alocation
  */
});

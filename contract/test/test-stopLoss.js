// @ts-check

import { test } from '@agoric/zoe/tools/prepare-test-env-ava.js';
import { unsafeMakeBundleCache } from '@agoric/run-protocol/test/bundleTool.js';
import { startAmmPool, startServices, startStopLoss } from './helper.js';
import { AmountMath } from '@agoric/ertp';
import { E } from '@endo/eventual-send';

test.before(async t => {
  const bundleCache = await unsafeMakeBundleCache('bundles/');
  t.context = { bundleCache };
});

test('start stop loss contract', async (t) => {
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

  // start stop loss contract
  const { publicFacet } = await startStopLoss(
    zoe,
    amm,
    secondaryR,
  );

  const  poolAlocation  = await E(publicFacet).getAlocation();
  
  t.deepEqual(
    await E(amm.ammPublicFacet).getPoolAllocation(secondaryR.brand),
    poolAlocation,
    `poolAllocation after initialization`,
  )

});

/*
Next steps:
    Define what sould be on .before func
    Interact with stopLoss Contract
*/

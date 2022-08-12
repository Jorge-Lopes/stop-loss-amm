// @ts-check

import { test } from '@agoric/zoe/tools/prepare-test-env-ava.js';
import { unsafeMakeBundleCache } from '@agoric/run-protocol/test/bundleTool.js';

test.before(async t => {
  const bundleCache = await unsafeMakeBundleCache('bundles/');
  t.context = { bundleCache };
});


/*
Next steps:
    Define what sould be on .before func
    Interact with stopLoss Contract
*/

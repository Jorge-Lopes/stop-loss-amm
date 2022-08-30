# Bytepitch & Agoric - stop-loss-amm
AMM Liquidity Provider Stop Loss Contract

Bounty:
https://gitcoin.co/issue/28953

## Setup

Please make sure you install the agoric-sdk first.

### IMPORTANT - Agoric SDK
1. Clone the agoric SDK repository (`git clone https://github.com/Agoric/agoric-sdk`)
2. `cd agoric-sdk`
3. `git checkout beta`
4. Now, do:
   1. `yarn install`
   2. `yarn build`
   3. `yarn link-cli ~/bin/agoric` (or other directory you might prefer)

### Stop Loss Contract

1. Clone this repository `git clone https://github.com/JorgeLopes-BytePitch/stop-loss-amm.git`
2. cd `stop-loss-amm`
3. Install dependencies `agoric install`
4. Verify all went well:
   > Due to some problem related to ava setup we can only run test when we're in the contract/ directory.
   > So you should cd to contract/ directory until this issue is resolved.
   1. `cd contract`
   2. Run `npx ava --verbose test/lendingPool/test-stopLoss.js`.
 
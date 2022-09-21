# Bytepitch & Agoric - stop-loss-amm
AMM Liquidity Provider Stop Loss Contract

Bounty:
https://gitcoin.co/issue/28953

## Setup

Please make sure you install the agoric-sdk first.

### IMPORTANT - Agoric SDK
1. Clone the agoric SDK repository (`git clone https://github.com/Agoric/agoric-sdk`)
2. `cd agoric-sdk`
3. `git checkout fedf049435d7307311219fbab1b2b342ec6acce8`
4. Now, do:
   1. `yarn install`
   2. `yarn build`
   3. `rm -rf ~/bin/agoric`
   3. `yarn link-cli ~/bin/agoric` (or other directory you might prefer)

### Stop Loss Contract

1. Clone this repository `git clone https://github.com/Jorge-Lopes/stop-loss-amm.git`
2. cd `stop-loss-amm`
3. Install dependencies `agoric install`
4. Verify all went well:
   > Due to some problem related to ava setup we can only run test when we're in the contract/ directory.
   > So you should cd to contract/ directory until this issue is resolved.
   1. `cd contract`
   2. Run `npx ava --verbose test/lendingPool/test-stopLoss.js`.


# Demonstration scenarios

## Initiate Environment

Start Agoric local chain

    terminal #1 cosmic-swingset %
    > make scenario2-setup
    > make scenario2-run-chain-economy

Run Agoric client
    
    terminal #2 cosmic-swingset %
    > make scenario2-run-client

Initiate State
    
    terminal #3 stop-loss-amm %
    > agoric deploy contract/deploy/initState.js

Add AMM pool and define boundaries (20%)

    terminal #3 stop-loss-amm %
    > stop-loss-amm % agoric deploy contract/deploy/addPool.js
 
    terminal #4 t1 %
    > agoric open --no-browser --repl

    -> Approve Offer

Check Environment 

    terminal #3 stop-loss-amm %
    > agoric deploy contract/deploy/getFromCentralPrice.js


## Scenario 1

### Description:
The user specifies the price boundaries and locks an amount of LP tokens in stopLoss contract. The amm pool price goes up and hits the upper boundary, which will trigger the contract to remove the user liquidity from the amm pool. The user will then withdraw his liquidity from the contract to his purse.

### Steps:

Initiate stopLoss Contract

    terminal #3 stop-loss-amm %
    > agoric deploy contract/deploy/initStopLoss.js
    
    agoric wallet cli %
    > cf = E(home.scratch).get('stop_loss_creator_facet_scratch_id')
    > notifier = E(cf).getNotifier()
    > E(notifier).getUpdateSince()

Lock Lp Tokens

    terminal #3 stop-loss-amm %
    > agoric deploy contract/deploy/lockLpTokens.js
    
    -> Approve Offer
    
    agoric wallet cli %
    > E(notifier).getUpdateSince()

Move Price Up (15%)

    Update <TRADE_MARGIN> to 15 at movePriceUp.js
    const TRADE_MARGIN = 15n;

    terminal #3 stop-loss-amm %
    > agoric deploy contract/deploy/movePriceUp.js

    -> Approve Offer

    agoric wallet cli %
    > E(notifier).getUpdateSince()

Withdraw Liquidity

    terminal #3 stop-loss-amm %
    > stop-loss-amm % agoric deploy contract/deploy/withdrawLiquidity.js

    -> Approve Offer

    agoric wallet cli %
    > E(notifier).getUpdateSince()


## Scenario 2

### Description:
The user specifies the price boundaries and locks an amount of LP tokens in stopLoss contract. Later the user updates his boundaries to a wider range. The amm pool price goes lower than the initially specified lower boundary, this price update will not trigger the liquidity removal. 

The amm pool price goes lower again, this time will hit the current lower boundary, which will trigger the contract to remove the user liquidity from the amm pool. The user will then withdraw his liquidity from the contract to his purse.

### Steps:

Initiate stopLoss Contract

    terminal #3 stop-loss-amm %
    > agoric deploy contract/deploy/initStopLoss.js
    
    agoric wallet cli %
    > cf = E(home.scratch).get('stop_loss_creator_facet_scratch_id')
    > notifier = E(cf).getNotifier()
    > E(notifier).getUpdateSince()

Lock Lp Tokens

    terminal #3 stop-loss-amm %
    > agoric deploy contract/deploy/lockLpTokens.js
    
    -> Approve Offer
    
    agoric wallet cli %
    > E(notifier).getUpdateSince()

Update Boundaries (30%)

    Update Boundaries to 30n at updateBoundaries.js
    AmountMath.make(istBrand, 10n ** 6n), secondaryBrand, 30n);

    terminal #3 stop-loss-amm %
    > agoric deploy contract/deploy/updateBoundaries.js
    
    -> Approve Offer
    
    agoric wallet cli %
    > E(notifier).getUpdateSince()

Move Price Down (15%)

    Update <TRADE_MARGIN> to 15 at movePriceDown.js
    const TRADE_MARGIN = 15n;

    terminal #3 stop-loss-amm %
    > agoric deploy contract/deploy/movePriceDown.js

    -> Approve Offer

    agoric wallet cli %
    > E(notifier).getUpdateSince()

Move Price Down (10%)

    Update <TRADE_MARGIN> to 10 at movePriceDown.js
    const TRADE_MARGIN = 10n;

    terminal #3 stop-loss-amm %
    > agoric deploy contract/deploy/movePriceDown.js

    -> Approve Offer

    agoric wallet cli %
    > E(notifier).getUpdateSince()

Withdraw Liquidity

    terminal #3 stop-loss-amm %
    > stop-loss-amm % agoric deploy contract/deploy/withdrawLiquidity.js

    -> Approve Offer

    agoric wallet cli %
    > E(notifier).getUpdateSince()


## Scenario 3

### Description:
The user specifies the price boundaries and locks an amount of LP tokens in stopLoss contract. Later the user locks an additional amount of LP tokens. Then the user will deliberately withdraw his liquidity, without waiting for the amm pool price to hit a boundary.

### Steps: 

Initiate stopLoss Contract

    terminal #3 stop-loss-amm %
    > agoric deploy contract/deploy/initStopLoss.js
    
    agoric wallet cli %
    > cf = E(home.scratch).get('stop_loss_creator_facet_scratch_id')
    > notifier = E(cf).getNotifier()
    > E(notifier).getUpdateSince()

Lock Lp Tokens

    terminal #3 stop-loss-amm %
    > agoric deploy contract/deploy/lockLpTokens.js
    
    -> Approve Offer
    
    agoric wallet cli %
    > E(notifier).getUpdateSince()

Lock Lp Tokens

    terminal #3 stop-loss-amm %
    > agoric deploy contract/deploy/lockLpTokens.js
    
    -> Approve Offer
    
    agoric wallet cli %
    > E(notifier).getUpdateSince()

Withdraw Liquidity

    terminal #3 stop-loss-amm %
    > stop-loss-amm % agoric deploy contract/deploy/withdrawLiquidity.js

    -> Approve Offer

    agoric wallet cli %
    > E(notifier).getUpdateSince()


## Scenario 4

### Description:
The user specifies the price boundaries and locks an amount of LP tokens in stopLoss contract. Then the user will deliberately withdraw his LP tokens locked in the contract.

### Steps:

Initiate stopLoss Contract

    terminal #3 stop-loss-amm %
    > agoric deploy contract/deploy/initStopLoss.js
    
    agoric wallet cli %
    > cf = E(home.scratch).get('stop_loss_creator_facet_scratch_id')
    > notifier = E(cf).getNotifier()
    > E(notifier).getUpdateSince()

Lock Lp Tokens

    terminal #3 stop-loss-amm %
    > agoric deploy contract/deploy/lockLpTokens.js
    
    -> Approve Offer
    
    agoric wallet cli %
    > E(notifier).getUpdateSince()

Withdraw Lp Tokens
    
    terminal #3 stop-loss-amm %
    >stop-loss-amm % agoric deploy contract/deploy/withdrawLpTokens.js

    -> Approve Offer
    
    agoric wallet cli %
    > E(notifier).getUpdateSince()


## Scenario 5

### Description:
The user specifies the price boundaries and locks an amount of LP tokens in stopLoss contract. Later the user updates his boundaries range outside of the current amm pool price, which will trigger the contract to remove the user liquidity from the amm pool. The user will then withdraw his liquidity from the contract to his purse.

### Steps:

Initiate stopLoss Contract

    terminal #3 stop-loss-amm %
    > agoric deploy contract/deploy/initStopLoss.js
    
    agoric wallet cli %
    > cf = E(home.scratch).get('stop_loss_creator_facet_scratch_id')
    > notifier = E(cf).getNotifier()
    > E(notifier).getUpdateSince()

Lock Lp Tokens

    terminal #3 stop-loss-amm %
    > agoric deploy contract/deploy/lockLpTokens.js
    
    -> Approve Offer
    
    agoric wallet cli %
    > E(notifier).getUpdateSince()
    
Update Boundaries out of Price range

    terminal #3 stop-loss-amm %
    > agoric deploy contract/deploy/updateBoundaryOutsideRange.js
    
    -> Approve Offer
    
    agoric wallet cli %
    > E(notifier).getUpdateSince()
  
 Withdraw Lp Tokens
    
    terminal #3 stop-loss-amm %
    >stop-loss-amm % agoric deploy contract/deploy/withdrawLpTokens.js

    -> Approve Offer
    
    agoric wallet cli %
    > E(notifier).getUpdateSince()


## Scenario 6

### Description:
The user initiate the stopLoss contract with the boundaries range outside of the current amm pool price, which will return an error

### Steps:

Initiate stopLoss Contract with faulty boundaries

    terminal #3 stop-loss-amm %
    > agoric deploy contract/deploy/initFaultyStopLoss.js
    

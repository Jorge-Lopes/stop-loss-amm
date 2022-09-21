# Demonstration scenarios

## Initiate Environment

Start Agoric local chain

    terminal #1 cosmic-swingset %
    > make scenario2-setup BASE_PORT:8000 NUM_SOLO=2

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

Initiate Environment 

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

Initiate Environment 

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

Initiate Environment 

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

Initiate Environment 

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

### Steps:

## Scenario 6

### Description:

### Steps:

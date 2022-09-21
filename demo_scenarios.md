# Demonstration scenarios

## Scenario 1

### Description:

### Steps:

Start Agoric local chain

> cosmic-swingset % make scenario2-setup BASE_PORT:8000 NUM_SOLO=2

Run Agoric client

> cosmic-swingset % make scenario2-run-client

Initiate State

> stop-loss-amm % agoric deploy contract/deploy/initState.js

Add AMM pool and define boundaries (20%)

> stop-loss-amm % agoric deploy contract/deploy/addPool.js
> t1 % agoric open --no-browser --repl

    -> Approve Offer

> stop-loss-amm % agoric deploy contract/deploy/getFromCentralPrice.js

Initiate stopLoss Contract

> stop-loss-amm % agoric deploy contract/deploy/initStopLoss.js

    -> cf = E(home.scratch).get('stop_loss_creator_facet_scratch_id')
    > notifier = E(cf).getNotifier()
    > E(notifier).getUpdateSince()

Lock Lp Tokens

> stop-loss-amm % agoric deploy contract/deploy/lockLpTokens.js

    -> Approve Offer
    > E(notifier).getUpdateSince()

Move Price Up (15%)

> stop-loss-amm % agoric deploy contract/deploy/movePriceUp.js

    -> Approve Offer
    > E(notifier).getUpdateSince()

Withdraw Liquidity

> stop-loss-amm % agoric deploy contract/deploy/withdrawLiquidity.js

    -> Approve Offer
    > E(notifier).getUpdateSince()

## Scenario 2

### Description:

### Steps:

Start local chain

> cosmic-swingset % make scenario2-setup BASE_PORT:8000 NUM_SOLO=2

Run Agoric client

> cosmic-swingset % make scenario2-run-client

Initiate State

> stop-loss-amm % agoric deploy contract/deploy/initState.js

Add AMM pool and define boundaries (20%)

> stop-loss-amm % agoric deploy contract/deploy/addPool.js
> t1 % agoric open --no-browser --repl

    -> Approve Offer

> stop-loss-amm % agoric deploy contract/deploy/getFromCentralPrice.js

Initiate stopLoss Contract

> stop-loss-amm % agoric deploy contract/deploy/initStopLoss.js

    -> cf = E(home.scratch).get('stop_loss_creator_facet_scratch_id')
    > notifier = E(cf).getNotifier()
    > E(notifier).getUpdateSince()

Lock Lp Tokens

> stop-loss-amm % agoric deploy contract/deploy/lockLpTokens.js

    -> Approve Offer
    > E(notifier).getUpdateSince()

Update Boundaries (30%)

> stop-loss-amm % agoric deploy contract/deploy/updateBoundaries.js

    -> Approve Offer //"Something went wrong"
    > E(notifier).getUpdateSince()

Move Price Down (15%)

> stop-loss-amm % agoric deploy contract/deploy/getFromCentralPrice.js
> stop-loss-amm % agoric deploy contract/deploy/movePriceDown.js

    -> Approve Offer //Explain the IST payment

> stop-loss-amm % agoric deploy contract/deploy/getFromCentralPrice.js

Move Price Down (10%)

> stop-loss-amm % agoric deploy contract/deploy/movePriceDown.js

    -> Approve Offer
    > E(notifier).getUpdateSince()

Withdraw Liquidity

> stop-loss-amm % agoric deploy contract/deploy/withdrawLiquidity.js

    -> Approve Offer
    > E(notifier).getUpdateSince()

## Scenario 3

### Description:

### Steps:
Start Agoric local chain

> cosmic-swingset % make scenario2-setup BASE_PORT:8000 NUM_SOLO=2

Run Agoric client

> cosmic-swingset % make scenario2-run-client

Initiate State

> stop-loss-amm % agoric deploy contract/deploy/initState.js

Add AMM pool and define boundaries (20%)

> stop-loss-amm % agoric deploy contract/deploy/addPool.js
> t1 % agoric open --no-browser --repl

    -> Approve Offer

> stop-loss-amm % agoric deploy contract/deploy/getFromCentralPrice.js

Initiate stopLoss Contract

> stop-loss-amm % agoric deploy contract/deploy/initStopLoss.js

    -> cf = E(home.scratch).get('stop_loss_creator_facet_scratch_id')
    > notifier = E(cf).getNotifier()
    > E(notifier).getUpdateSince()

Lock Lp Tokens (15n)

> stop-loss-amm % agoric deploy contract/deploy/lockLpTokens.js

    -> Approve Offer
    > E(notifier).getUpdateSince()

Lock Lp Tokens (15n)

> stop-loss-amm % agoric deploy contract/deploy/lockLpTokens.js

    -> Approve Offer
    > E(notifier).getUpdateSince()

Withdraw Liquidity

> stop-loss-amm % agoric deploy contract/deploy/withdrawLiquidity.js

    -> Approve Offer
    > E(notifier).getUpdateSince()

## Scenario 4

### Description:

### Steps:
Add Liquidity to Pool

> stop-loss-amm % agoric deploy contract/deploy/addLiquidityToAMM.js

    -> Approve Offer

> stop-loss-amm % agoric deploy contract/deploy/getFromCentralPrice.js

Initiate Stop Loss

> stop-loss-amm % agoric deploy contract/deploy/initStopLoss.js

    -> cf = E(home.scratch).get('stop_loss_creator_facet_scratch_id')
    > notifier = E(cf).getNotifier()
    > E(notifier).getUpdateSince()

Lock Lp Tokens (15n)

> stop-loss-amm % agoric deploy contract/deploy/lockLpTokens.js

    -> Approve Offer
    > E(notifier).getUpdateSince()

Withdraw Lp Tokens
> stop-loss-amm % agoric deploy contract/deploy/withdrawLpTokens.js

    -> Approve Offer
    > E(notifier).getUpdateSince()


## Scenario 5

### Description:

### Steps:

## Scenario 6

### Description:

### Steps:

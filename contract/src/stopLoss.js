// @ts-check

import {
  assertIssuerKeywords,
  assertProposalShape,
  getAmountOut,
} from '@agoric/zoe/src/contractSupport';
import { Far, E } from '@endo/far';
import { AmountMath } from '@agoric/ertp';
import { offerTo } from '@agoric/zoe/src/contractSupport/index.js';
import { assertBoundryShape, assertExecutionMode } from './assertionHelper.js';
import { makeBoundryWatcher } from './boundryWatcher.js';
import { makeNotifierKit } from '@agoric/notifier';
import { ALLOCATION_PHASE, BOUNDRY_WATCHER_STATUS } from './constants.js';
import { makeTracer } from '@agoric/run-protocol/src/makeTracer.js';

const tracer = makeTracer('StopLoss');

/**
 *
 * @param {ZCF} zcf
 */
const start = async (zcf) => {
  const {
    /** @type XYKAMMPublicFacet */  ammPublicFacet,
    /** @type Issuer */ centralIssuer,
    /** @type Issuer */ secondaryIssuer,
    /** @type Issuer */ liquidityIssuer,
    boundries,
    /** @type PriceAuthority */ devPriceAuthority = undefined,
  } = zcf.getTerms();
  assertIssuerKeywords(zcf, ['Central', 'Secondary', 'Liquidity']);
  assertExecutionMode(ammPublicFacet, devPriceAuthority);

  const { zcfSeat: stopLossSeat } = zcf.makeEmptySeatKit();

  const centralBrand = zcf.getBrandForIssuer(centralIssuer);
  const secondaryBrand = zcf.getBrandForIssuer(secondaryIssuer);
  const lpTokenBrand = zcf.getBrandForIssuer(liquidityIssuer);

  const getStateSnapshot = phase => {
    return harden({
      phase: phase,
      lpBalance: stopLossSeat.getAmountAllocated('Liquidity', lpTokenBrand),
      liquidityBalance: {
        central: stopLossSeat.getAmountAllocated('Central', centralBrand),
        secondary: stopLossSeat.getAmountAllocated('Secondary', secondaryBrand),
      }
    });
  };

  const { updater, notifier } = makeNotifierKit(getStateSnapshot(ALLOCATION_PHASE.IDLE));

  const updateAllocationState = (allocationPhase) => {
    const allocationState = getStateSnapshot(allocationPhase);
    updater.updateState(allocationState);
  }

  assertBoundryShape(boundries, centralBrand, secondaryBrand);

  const init = async () => {
    let fromCentralPriceAuthority;

    if (ammPublicFacet) {
      const { fromCentral } = await E(ammPublicFacet).getPriceAuthorities(secondaryBrand);
      fromCentralPriceAuthority = fromCentral;
    } else {
      fromCentralPriceAuthority = devPriceAuthority;
    }

    const boundryWatcher = makeBoundryWatcher({
      fromCentralPriceAuthority,
      boundries,
      centralBrand,
      secondaryBrand,
    });

    updateAllocationState(ALLOCATION_PHASE.SCHEDULED);

    return boundryWatcher;
  };

  // Initiate listening
  const {
    boundryWatcherPromise,
    updateBoundries,
  } = await init();

  const schedule = async () => {
    // Wait for the price boundry being violated
    const { code, quote, error } = await boundryWatcherPromise;

    if (code === BOUNDRY_WATCHER_STATUS.FAIL) {
      updateAllocationState(ALLOCATION_PHASE.ERROR);
      tracer('Boundry watcher error', error);
      return;
    }

    tracer('Resolving with the quote', getAmountOut(quote));

    updateAllocationState(ALLOCATION_PHASE.REMOVING);
    console.log('REMOVING_LP_TOKENS');

    await removeLiquidityFromAmm();
  };

  // Schedule a trigger for LP token removal
  schedule().catch(error => {
    updateAllocationState(ALLOCATION_PHASE.ERROR);
    tracer('Schedule encountered an error', error);
  }); // Notify user

  const makeLockLPTokensInvitation = () => {
    const lockLPTokens = (creatorSeat) => {
      assertProposalShape(creatorSeat, {
        give: { Liquidity: null },
      });

      const {
        give: { Liquidity: liquidityAmount },
      } = creatorSeat.getProposal();

      stopLossSeat.incrementBy(
        creatorSeat.decrementBy(harden({ Liquidity: liquidityAmount })),
      );

      zcf.reallocate(stopLossSeat, creatorSeat);

      creatorSeat.exit();

      updateAllocationState(ALLOCATION_PHASE.ACTIVE);

      return `Liquidity locked in the value of ${liquidityAmount.value}`;
    };

    return zcf.makeInvitation(
      lockLPTokens,
      'Lock LP Tokens in stopLoss contract',
    );
  };

  const removeLiquidityFromAmm = async () => {
    const removeLiquidityInvitation =
      E(ammPublicFacet).makeRemoveLiquidityInvitation();

    const liquidityIn = stopLossSeat.getAmountAllocated(
      'Liquidity',
      lpTokenBrand,
    );

    const proposal = harden({
      want: {
        Central: AmountMath.makeEmpty(centralBrand),
        Secondary: AmountMath.makeEmpty(secondaryBrand),
      },
      give: {
        Liquidity: liquidityIn,
      },
    });

    const { deposited, userSeatPromise: liquiditySeat } = await offerTo(
      zcf,
      removeLiquidityInvitation,
      undefined,
      proposal,
      stopLossSeat,
    );

    const [amounts, removeOfferResult] = await Promise.all([deposited, E(liquiditySeat).getOfferResult()]);
    tracer('Amounts from removal', amounts);

    updateAllocationState(ALLOCATION_PHASE.REMOVED);

    return removeOfferResult;
  };

  const makeWithdrawLiquidityInvitation = () => {
    const withdrawLiquidity = (creatorSeat) => {
      assertProposalShape(creatorSeat, {
        want: {
          Central: null,
          Secondary: null,
        },
      });

      const centralAmountAllocated = stopLossSeat.getAmountAllocated(
        'Central',
        centralBrand,
      );
      const secondaryAmountAllocated = stopLossSeat.getAmountAllocated(
        'Secondary',
        secondaryBrand,
      );

      // assert that ALLOCATION_PHASE is REMOVED

      creatorSeat.incrementBy(
        stopLossSeat.decrementBy(
          harden({
            Central: centralAmountAllocated,
            Secondary: secondaryAmountAllocated,
          }),
        ),
      );

      zcf.reallocate(creatorSeat, stopLossSeat);

      creatorSeat.exit();

      updateAllocationState(ALLOCATION_PHASE.WITHDRAWN);

      return `Liquidity withdraw to creator seat`;
    };

    return zcf.makeInvitation(withdrawLiquidity, 'withdraw Liquidity');
  };

  const updateConfiguration = async boundries => {
    return await updateBoundries(boundries);
  };

  const getBalanceByBrand = (keyword, issuer) => {
    return stopLossSeat.getAmountAllocated(
      keyword,
      zcf.getBrandForIssuer(issuer),
    );
  };

  // Contract facets
  const publicFacet = Far('public facet', {
    getBalanceByBrand,
  });

  const creatorFacet = Far('creator facet', {
    makeLockLPTokensInvitation,
    makeWithdrawLiquidityInvitation,
    removeLiquidityFromAmm,
    updateConfiguration,
    getNotifier: () => notifier,
  });

  return harden({ publicFacet, creatorFacet });
};
harden(start);
export { start };

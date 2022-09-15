// @ts-check

import {
  assertIssuerKeywords,
  assertProposalShape,
  getAmountOut,
} from '@agoric/zoe/src/contractSupport';
import { Far, E } from '@endo/far';
import { AmountMath } from '@agoric/ertp';
import { offerTo } from '@agoric/zoe/src/contractSupport/index.js';
import {
  assertBoundaryShape,
  assertExecutionMode,
  assertAllocationStatePhase,
  assertScheduledOrActive,
  assertInitialBoundariesRange,
} from './assertionHelper.js';
import { makeBoundaryWatcher } from './boundaryWatcher.js';
import { makeNotifierKit } from '@agoric/notifier';
import { ALLOCATION_PHASE, BOUNDARY_WATCHER_STATUS } from './constants.js';
import { makeTracer } from '@agoric/inter-protocol/src/makeTracer.js';

const tracer = makeTracer('StopLoss');

/**
 *
 * @param {ZCF} zcf
 */
const start = async (zcf) => {
  const {
    /** @type XYKAMMPublicFacet */ ammPublicFacet,
    /** @type Issuer */ centralIssuer,
    /** @type Issuer */ secondaryIssuer,
    /** @type Issuer */ lpTokenIssuer,
    boundaries,
    /** @type PriceAuthority */ devPriceAuthority = undefined,
  } = zcf.getTerms();
  assertIssuerKeywords(zcf, ['Central', 'Secondary', 'LpToken']);
  assertExecutionMode(ammPublicFacet, devPriceAuthority);

  const { zcfSeat: stopLossSeat } = zcf.makeEmptySeatKit();

  const centralBrand = zcf.getBrandForIssuer(centralIssuer);
  const secondaryBrand = zcf.getBrandForIssuer(secondaryIssuer);
  const lpTokenBrand = zcf.getBrandForIssuer(lpTokenIssuer);

  const getStateSnapshot = (phase) => {
    return harden({
      phase: phase,
      lpBalance: stopLossSeat.getAmountAllocated('LpToken', lpTokenBrand),
      liquidityBalance: {
        central: stopLossSeat.getAmountAllocated('Central', centralBrand),
        secondary: stopLossSeat.getAmountAllocated('Secondary', secondaryBrand),
      },
    });
  };

  const { updater, notifier } = makeNotifierKit(
    getStateSnapshot(ALLOCATION_PHASE.IDLE),
  );

  // phaseSnapshot used for assertAllocationStatePhase
  let phaseSnapshot = ALLOCATION_PHASE.IDLE;

  const updateAllocationState = (allocationPhase) => {
    const allocationState = getStateSnapshot(allocationPhase);
    updater.updateState(allocationState);
    phaseSnapshot = allocationPhase;
  };

  assertBoundaryShape(boundaries, centralBrand, secondaryBrand);

  const init = async () => {
    let fromCentralPriceAuthority;

    if (ammPublicFacet) {
      const { fromCentral } = await E(ammPublicFacet).getPriceAuthorities(
        secondaryBrand,
      );
      fromCentralPriceAuthority = fromCentral;
    } else {
      fromCentralPriceAuthority = devPriceAuthority;
    }

    await isPriceInsideInitialBoundaries(
      fromCentralPriceAuthority,
      boundaries,
      secondaryBrand,
    );

    const boundaryWatcher = makeBoundaryWatcher({
      fromCentralPriceAuthority,
      boundaries,
      centralBrand,
      secondaryBrand,
    });

    updateAllocationState(ALLOCATION_PHASE.SCHEDULED);

    return boundaryWatcher;
  };

  const isPriceInsideInitialBoundaries = async (
    fromCentralPriceAuthority,
    boundaries,
    secondaryBrand,
  ) => {
    const amountIn = boundaries.lower.denominator;
    const quote = await E(fromCentralPriceAuthority).quoteGiven(
      amountIn,
      secondaryBrand,
    );
    const quoteAmountOut = getAmountOut(quote);
    assertInitialBoundariesRange(boundaries, quoteAmountOut);
  };

  // Initiate listening
  const { boundaryWatcherPromise, updateBoundaries } = await init();

  const schedule = async () => {
    // Wait for the price boundary being violated
    const { code, quote, error } = await boundaryWatcherPromise;

    if (code === BOUNDARY_WATCHER_STATUS.FAIL) {
      updateAllocationState(ALLOCATION_PHASE.ERROR);
      tracer('Boundary watcher error', error);
      return;
    }

    tracer('Resolving with the quote', getAmountOut(quote));

    updateAllocationState(ALLOCATION_PHASE.REMOVING);
    console.log('REMOVING_LP_TOKENS');

    await removeLiquidityFromAmm();
  };

  // Schedule a trigger for LP token removal
  schedule().catch((error) => {
    updateAllocationState(ALLOCATION_PHASE.ERROR);
    tracer('Schedule encountered an error', error);
  }); // Notify user

  const makeLockLPTokensInvitation = () => {

    const lockLPTokens = (creatorSeat) => {
      assertScheduledOrActive(phaseSnapshot);

      const {
        give: { LpToken: lpTokenAmount },
      } = creatorSeat.getProposal();

      stopLossSeat.incrementBy(
        creatorSeat.decrementBy(harden({ LpToken: lpTokenAmount })),
      );

      zcf.reallocate(stopLossSeat, creatorSeat);

      creatorSeat.exit();

      updateAllocationState(ALLOCATION_PHASE.ACTIVE);

      return `LP Tokens locked in the value of ${lpTokenAmount.value}`;
    };


    // TODO: find the correct way to get lpTokenAmount.value for the give : ...
    // const proposalShape = harden({
    //   want: {},
    //   give: {LpToken: AmountMath.make(lpTokenBrand, VALUE_???},
    //   exit: { onDemand: null },
    // });

    return zcf.makeInvitation(
      lockLPTokens,
      'Lock LP Tokens in stopLoss contract',
      // undefined,
      // proposalShape,
    );
  };

  const makeWithdrawLiquidityInvitation = () => {
    const withdrawLiquidity = async (creatorSeat) => {
      await removeLiquidityFromAmm();
      assertAllocationStatePhase(phaseSnapshot, ALLOCATION_PHASE.REMOVED);

      const centralAmountAllocated = stopLossSeat.getAmountAllocated(
        'Central',
        centralBrand,
      );
      const secondaryAmountAllocated = stopLossSeat.getAmountAllocated(
        'Secondary',
        secondaryBrand,
      );

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

    const proposalShape = harden({
      want: {
        Central: AmountMath.makeEmpty(centralBrand),
        Secondary: AmountMath.makeEmpty(secondaryBrand),
      },
      give: {},
      exit: { onDemand: null },
    });

    return zcf.makeInvitation(
      withdrawLiquidity,
      'withdraw Liquidity',
      undefined,
      proposalShape,
    );
  };

  const makeWithdrawLpTokensInvitation = () => {
    const withdrawLpTokens = (creatorSeat) => {
      assertAllocationStatePhase(phaseSnapshot, ALLOCATION_PHASE.ACTIVE);

      const lpTokenAmountAllocated = stopLossSeat.getAmountAllocated(
        'LpToken',
        lpTokenBrand,
      );

      creatorSeat.incrementBy(
        stopLossSeat.decrementBy(harden({ LpToken: lpTokenAmountAllocated })),
      );

      zcf.reallocate(creatorSeat, stopLossSeat);

      creatorSeat.exit();

      updateAllocationState(ALLOCATION_PHASE.WITHDRAWN);

      return `LP Tokens withdraw to creator seat`;
    };

    const proposalShape = harden({
      want: { LpToken: AmountMath.makeEmpty(lpTokenBrand) },
      give: {},
      exit: { onDemand: null },
    });

    return zcf.makeInvitation(
      withdrawLpTokens,
      'withdraw Lp Tokens',
      undefined,
      proposalShape,
    );
  };

  const removeLiquidityFromAmm = async () => {
    const removeLiquidityInvitation = await E(
      ammPublicFacet,
    ).makeRemoveLiquidityInvitation();

    const lpTokensLockedAmount = stopLossSeat.getAmountAllocated(
      'LpToken',
      lpTokenBrand,
    );

    const proposal = harden({
      want: {
        Central: AmountMath.makeEmpty(centralBrand),
        Secondary: AmountMath.makeEmpty(secondaryBrand),
      },
      give: {
        Liquidity: lpTokensLockedAmount,
      },
    });

    const keywordMapping = harden({
      LpToken: 'Liquidity',
    });

    const { deposited, userSeatPromise: liquiditySeat } = await offerTo(
      zcf,
      removeLiquidityInvitation,
      keywordMapping,
      proposal,
      stopLossSeat,
    );

    try {
      await E(liquiditySeat).getOfferResult();
    } catch (error) {
      updateAllocationState(ALLOCATION_PHASE.ERROR);
      tracer('removeLiquidityFromAmm encounted an error: ', error);
      return;
    }

    const [amounts, removeOfferResult] = await Promise.all([
      deposited,
      E(liquiditySeat).getOfferResult(),
    ]);
    tracer('Amounts from removal', amounts);

    updateAllocationState(ALLOCATION_PHASE.REMOVED);

    return removeOfferResult;
  };

  const updateConfiguration = async (boundaries) => {
    assertScheduledOrActive(phaseSnapshot);
    return await updateBoundaries(boundaries);
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
    makeWithdrawLpTokensInvitation,
    updateConfiguration,
    getNotifier: () => notifier,
  });

  return harden({ publicFacet, creatorFacet });
};
harden(start);
export { start };


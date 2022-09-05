// @ts-check

import {
  assertIssuerKeywords,
  assertProposalShape,
  getAmountOut,
} from '@agoric/zoe/src/contractSupport';
import { Far, E } from '@endo/far';
import { AmountMath } from '@agoric/ertp';
import { offerTo } from '@agoric/zoe/src/contractSupport/index.js';
import { assertBoundryShape } from './assertionHelper.js';
import { makeBoundryWatcher } from './boundryWatcher.js';
import { makeNotifierKit } from '@agoric/notifier';

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
    boundries } =
    zcf.getTerms();
  assertIssuerKeywords(zcf, ['Central', 'Secondary', 'Liquidity']);

  const { zcfSeat: stopLossSeat } = zcf.makeEmptySeatKit();

  const centralBrand = zcf.getBrandForIssuer(centralIssuer);
  const secondaryBrand = zcf.getBrandForIssuer(secondaryIssuer);
  const lpTokenBrand = zcf.getBrandForIssuer(liquidityIssuer);

  const { updater, notifier } = makeNotifierKit();

  /**
   * TODO: this object should be imported from constants.js
   * Constants for allocation phase,
   *
   * ACTIVE       - lp tokens locked in stopLoss seat
   * LIQUIDATING  - liquidity being withdraw from the amm pool to the stopLoss seat
   * LIQUIDATED   - liquidity has been withdraw from the amm pool to the stopLoss seat
   * CLOSED       - stopLoss was closed by the creator and all assets have been transfered to his seat
   * ERROR        - error catched in some process
   */
  const AllocationPhase = ({
    ACTIVE: 'active',
    LIQUIDATING: 'liquidating',
    LIQUIDATED: 'liquidated',
    CLOSED: 'closed',
    ERROR: 'error,'
  });


  const updateAllocationState = (allocationPhase) => {
    const allocationState = harden({
      phase: allocationPhase,
      lpBalance: stopLossSeat.getAmountAllocated('Liquidity', lpTokenBrand),
      liquidityBalance: {
        central: stopLossSeat.getAmountAllocated('Central', centralBrand),
        secondary: stopLossSeat.getAmountAllocated('Secondary', secondaryBrand),
      }
    });
    updater.updateState(allocationState);
  }

  assertBoundryShape(boundries, centralBrand, secondaryBrand);

  const centralAmount = (value) => AmountMath.make(centralBrand, value);
  const secondaryAmount = (value) => AmountMath.make(secondaryBrand, value);

  const init = async () => {
    const { fromCentral } = await E(ammPublicFacet).getPriceAuthorities(secondaryBrand);

    return makeBoundryWatcher({
      fromCentralPriceAuthority: fromCentral,
      boundries,
      centralBrand,
      secondaryBrand,
    })
  };

  // Initiate listening
  const {
    boundryWatcherPromise,
    updateBoundries,
  } = await init();

  const schedule = async () => {
    // Wait for the price boundry being violated
    await boundryWatcherPromise;
    // TODO Notify state changed to 'Removing'
    console.log('REMOVING_LP_TOKENS')
    await removeLiquidityFromAmm();
  };

  // Schedule a trigger for LP token removal
  schedule().catch(err => console.log('SCHEDULE_ERROR', err)); // Notify user

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

      updateAllocationState(AllocationPhase.ACTIVE);

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

    const amount = await deposited;

    await Promise.all([deposited, E(liquiditySeat).getOfferResult()]);

    updateAllocationState(AllocationPhase.LIQUIDATED);

    return E(liquiditySeat).getOfferResult();
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
    removeLiquidityFromAmm,
    updateConfiguration,
    getNotifier: () => notifier,
  });

  return harden({ publicFacet, creatorFacet });
};
harden(start);
export { start };

/*
// next steps:
  remove,
    - check input and output value
    - check liquiditySeat
    - check allocation of the liquidity

  tests
    - comment the tests to explain their purpose
*/

/* Code structure:
  
  terms: ammPublicFacet, stopRatioUpperLimit, stopRatioLowerLimit,  secondaryBrand;
  issuerKeywordRecord: Central, Secondary, Liquidity;

  makeLockLPTokensInvitation () => {
    lockLPTokens () => {}
  }

  removeLiquidity () => {}

  getPriceAuthority (Secondary) => {}
  getQuote () => {}

  isStopRatio () => {
      removeLiquidity ()
  }

  updateStopRatio () => {
      removeLiquidity ()
      create new contract*
  }

  withdrawLiquidity () => {}

  publicFacet ({
      getQuote
  })

  creatorFacet ({
      makeAddLPTokensInvitation,
      updateStopRatio
      withdrawLiquidity
  })

*/

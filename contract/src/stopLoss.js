// @ts-check

import {
  assertIssuerKeywords,
  assertProposalShape,
} from '@agoric/zoe/src/contractSupport';
import { Far, E } from '@endo/far';
import { AmountMath } from '@agoric/ertp';
import { offerTo } from '@agoric/zoe/src/contractSupport/index.js';
import { makeAsyncIterableFromNotifier, makeNotifierKit } from '@agoric/notifier';

const start = async (zcf) => {
  const { ammPublicFacet, centralIssuer, secondaryIssuer, liquidityIssuer } =
    zcf.getTerms();
  assertIssuerKeywords(zcf, ['Central', 'Secondary', 'Liquidity']);
  const { zcfSeat: stopLossSeat } = zcf.makeEmptySeatKit();

  const centralBrand = zcf.getBrandForIssuer(centralIssuer);
  const secondaryBrand = zcf.getBrandForIssuer(secondaryIssuer);
  const lpTokenBrand = zcf.getBrandForIssuer(liquidityIssuer);

  const { updater, notifier } = makeNotifierKit();

  /**
   * Constants for allocation phase,
   *
   * ACTIVE       - lp tokens locked in stopLoss seat 
   * LIQUIDATING  - liquidity being withdraw from the amm pool to the stopLoss seat
   * LIQUIDATED   - liquidity has been withdraw from the amm pool to the stopLoss seat
   * CLOSED       - stopLoss was closed by the creator and all assets have been transfered to his seat
   */
  const AllocationPhase = ({
    ACTIVE: 'active',
    LIQUIDATING: 'liquidating',
    LIQUIDATED: 'liquidated',
    CLOSED: 'closed',
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
      'Lock LP Tokens in stopLoss contact',
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

    await Promise.all([deposited, E(liquiditySeat).getOfferResult()]);

    updateAllocationState(AllocationPhase.LIQUIDATED);

    return E(liquiditySeat).getOfferResult();
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
    getNotifier: () => notifier,
  });

  return harden({ publicFacet, creatorFacet });
};
harden(start);
export { start };

/* Code structure:
  
  terms: ammPublicFacet, stopRatioUpperLimit, stopRatioLowerLimit,  secondaryBrand;
  issuerKeywordRecord: Central, Secondary, Liquidity;

  makeAddLPTokensInvitation () => {}
  addLPTokens () => {}

  getPriceAuthority (Secondary) => {}
  getQuote () => {}

  makeRemoveLiquidityInvitation () => {}
  removeLiquidity () => {}

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

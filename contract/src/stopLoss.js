// @ts-check

import {
  assertIssuerKeywords,
  assertProposalShape,
} from '@agoric/zoe/src/contractSupport';
import { Far, E } from '@endo/far';

const start = async (zcf) => {
  /* Code structure:
    
    terms: amm, stopRatioUpperLimit, stopRatioLowerLimit,  secondaryBrand
    issuerKeywordRecord: Central, Secondary

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

  // const { stopRatio, secondaryR } = zcf.getTerms();
  // assertIssuerKeywords(zcf, ['Central', 'Secondary']);
  const { amm, secondaryR } = zcf.getTerms();
  const { zcfSeat } = zcf.makeEmptySeatKit();

  const makeAddLPTokensInvitation = () => {
    const addLPTokens = (creatorSeat) => {
      assertProposalShape(creatorSeat, {
        give: { LPTokens: null },
      });

      const {
        give: { LPTokens: lpTokensAmount },
      } = creatorSeat.getProposal();

      zcfSeat.incrementBy(
        creatorSeat.decrementBy(harden({ LPTokens: lpTokensAmount })),
      );

      zcf.reallocate(zcfSeat, creatorSeat);

      creatorSeat.exit();

      return `LP Tokens locked in the amount of ${lpTokensAmount.value}`;
    };

    return zcf.makeInvitation(addLPTokens, 'Add LP Tokens');
  };

  // functions for testing purpose, to be removed!
  const secondaryBrand = secondaryR.brand;
  const getAlocation = async () => {
    const poolAllocation = await E(amm.ammPublicFacet).getPoolAllocation(
      secondaryBrand,
    );
    return poolAllocation;
  };

  // Contract facets
  const publicFacet = Far('public facet', {
    getAlocation,
  });

  const creatorFacet = Far('creator facet', {
    makeAddLPTokensInvitation,
  });

  return harden({ publicFacet, creatorFacet });
};
harden(start);
export { start };

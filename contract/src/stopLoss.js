// @ts-check

import {
  assertIssuerKeywords,
  assertProposalShape,
  getAmountOut,
} from '@agoric/zoe/src/contractSupport';
import { Far, E } from '@endo/far';
import { AmountMath } from '@agoric/ertp';
import { offerTo } from '@agoric/zoe/src/contractSupport/index.js';

const start = async (zcf) => {
  const { ammPublicFacet, centralIssuer, secondaryIssuer, liquidityIssuer } =
    zcf.getTerms();
  assertIssuerKeywords(zcf, ['Central', 'Secondary', 'Liquidity']);
  const { zcfSeat: stopLossSeat } = zcf.makeEmptySeatKit();

  const centralBrand = zcf.getBrandForIssuer(centralIssuer);
  const secondaryBrand = zcf.getBrandForIssuer(secondaryIssuer);
  const centralAmount = (value) => AmountMath.make(centralBrand, value);
  const secondaryAmount = (value) => AmountMath.make(secondaryBrand, value);

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

      return `Liquidity locked in the value of ${liquidityAmount.value}`;
    };

    return zcf.makeInvitation(
      lockLPTokens,
      'Lock LP Tokens in stopLoss contract',
    );
  };

  /* 
  Questions:
    how should I use "deposited"?
    Should the liquidity be reallocated from "liquiditySeat" to the "stopLossSeat"?
  */
  const removeLiquidityFromAmm = async () => {
    const removeLiquidityInvitation =
      E(ammPublicFacet).makeRemoveLiquidityInvitation();

    const liquidityIn = stopLossSeat.getAmountAllocated(
      'Liquidity',
      zcf.getBrandForIssuer(liquidityIssuer),
    );

    const proposal = harden({
      want: {
        Central: centralAmount(0n),
        Secondary: secondaryAmount(0n),
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
      stopLossSeat,
      undefined,
    );

    return liquiditySeat;
  };

  const getQuotefromCentral = async (value) => {
    const { fromCentral: priceAuthority } = await E(ammPublicFacet).getPriceAuthorities(secondaryBrand);
    const quoteGiven = await E(priceAuthority).quoteGiven(
      centralAmount(value),
      secondaryBrand,
    );
    const amountOut = getAmountOut(quoteGiven);
    return amountOut;
  };

  // Work in progress
  const getQuoteWhenFromCentral = async (valueIn, valueOut) => {
    const { fromCentral: priceAuthority } = await E(ammPublicFacet).getPriceAuthorities(secondaryBrand);
    const quoteWhenGTE = E(priceAuthority).quoteWhenGTE(
      centralAmount(valueIn), 
      secondaryAmount(valueOut)
    );
    return quoteWhenGTE;
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
    getQuotefromCentral,
    getQuoteWhenFromCentral,
  });

  const creatorFacet = Far('creator facet', {
    makeLockLPTokensInvitation,
    removeLiquidityFromAmm,
  });

  return harden({ publicFacet, creatorFacet });
};
harden(start);
export { start };

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

// @ts-check

import {
  assertIssuerKeywords,
  assertProposalShape,
} from '@agoric/zoe/src/contractSupport';
import { Far, E } from '@endo/far';
import { saveAllIssuers } from '@agoric/zoe/src/contractSupport/index.js';
import { AmountMath } from '@agoric/ertp';

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

const start = async (zcf) => {
  assertIssuerKeywords(zcf, harden(['Liquidity']));
  
  const { 
    amm,
    centralBrand,
    secondaryBrand,
    liquidityBrand,
  } = zcf.getTerms();

  const { zcfSeat } = zcf.makeEmptySeatKit();
  const zoeService = zcf.getZoeService();



  const makeAddLiquidityInvitation = () => {
    const addLiquidity = (creatorSeat) => {
      assertProposalShape(creatorSeat, {
        give: { Liquidity: null },
      });

      const {
        give: { Liquidity: liquidityAmount },
      } = creatorSeat.getProposal();

      zcfSeat.incrementBy(
        creatorSeat.decrementBy(harden({ Liquidity: liquidityAmount })),
      );

      zcf.reallocate(zcfSeat, creatorSeat);

      creatorSeat.exit();

      return `Liquidity locked in the amount of ${liquidityAmount.value}`;
    };

    return zcf.makeInvitation(addLiquidity, 'Add Liquidity');
  };

  const makeCentral = (value) => {AmountMath.make(centralBrand, value)};
  const makeSecondary = (value) => {AmountMath.make(secondaryBrand, value)};
  const liquidityIssuer = zcf.getIssuerForBrand(liquidityBrand);


  // should remove liquidity have an invitation? considering that it will be not exposed to outside
  // should this function send the assets directly to the user seat or store in the zcfSeat?
  // should I get the amm pool from the secondary and not from the terms
  // BUG: problems with the liquidity issuer to generate a payment
  // How should I use the issuerKeywords?
  const removeLiquidity = () => {
    const liquidityIn = zcfSeat.getAmountAllocated(
      'Liquidity',
      liquidityBrand,
    );

    const invitation = E(amm.ammPublicFacet).makeRemoveLiquidityInvitation();
    const proposal = harden({
      want: {
        Central: makeCentral(0n),
        Secondary: makeSecondary(0n),
      },
      give: {
        Liquidity: liquidityIn,
      },
    });
    
    const payment = liquidityIssuer.mint.mintPayment(liquidityIn);

    const removeLiquiditySeat = E(zoeService).offer(
      invitation,
      proposal,
      payment,
    );

    const { Central: c, Secondary: s, Liquidity: l } = E(removeLiquiditySeat).getPayouts();

    zcfSeat.incrementBy(
      removeLiquiditySeat.decrementBy(harden({Central: c, Secondary: s, Liquidity: l })),
    );

    zcf.reallocate(zcfSeat, removeLiquiditySeat);

    removeLiquiditySeat.exit

    return 'Liquidity removed';
  };


  // Contract facets
  const publicFacet = Far('public facet', {
  });

  const creatorFacet = Far('creator facet', {
    makeAddLiquidityInvitation,
    removeLiquidity,
  });

  return harden({ publicFacet, creatorFacet });
};
harden(start);
export { start };

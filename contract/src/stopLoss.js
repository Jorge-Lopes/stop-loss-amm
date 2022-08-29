// @ts-check

import { assertProposalShape } from '@agoric/zoe/src/contractSupport';
import { Far, E } from '@endo/far';
import { saveAllIssuers } from '@agoric/zoe/src/contractSupport/index.js';
import { AmountMath } from '@agoric/ertp';

const start = async (zcf) => {
  const { ammPublicFacet, centralIssuer, secondaryIssuer, liquidityIssuer } =
    zcf.getTerms();

  await saveAllIssuers(zcf, {
    C: centralIssuer,
    S: secondaryIssuer,
    L: liquidityIssuer,
  });
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

  // should I use IssuerKeywordRecords to pass the Issuers instead of terms?
  // Is the saveAllIssuers usefull?
  // should remove liquidity have an invitation? considering that it will be not exposed to outside
  // should this function send the assets directly to the user seat or store in the zcfSeat?
  // should I get the amm pool from the secondary and not from the terms

  const removeLiquidity = () => {
    console.log('LOG: remove Liquidity func');
    const seatAllocation = zcfSeat.getCurrentAllocation();
    const liquidityIn = seatAllocation.Liquidity.value;
    console.log('LOG: ' + liquidityIn);

    const centralAmount = (value) =>
      AmountMath.make(centralIssuer.brand, value);
    const secondaryAmount = (value) =>
      AmountMath.make(secondaryIssuer.brand, value);

    const invitation = E(ammPublicFacet).makeRemoveLiquidityInvitation();

    console.log('LOG: teste 1');
    const proposal = harden({
      want: {
        Central: centralAmount(0n),
        Secondary: secondaryAmount(0n),
      },
      give: {
        Liquidity: liquidityIn,
      },
    });

    console.log('LOG: teste 2');
    // should i use zcf.makeZCFMint
    const payment = liquidityIssuer.mint.mintPayment(liquidityIn);

    const removeLiquiditySeat = E(zoeService).offer(
      invitation,
      proposal,
      payment,
    );

    const { Central: c, Secondary: s } = E(removeLiquiditySeat).getPayouts();

    zcfSeat.incrementBy(
      removeLiquiditySeat.decrementBy(harden({ Central: c, Secondary: s })),
    );

    zcf.reallocate(zcfSeat, removeLiquiditySeat);

    removeLiquiditySeat.exit;

    return 'Liquidity removed';
  };

  // Contract facets
  const publicFacet = Far('public facet', {});

  const creatorFacet = Far('creator facet', {
    makeAddLiquidityInvitation,
    removeLiquidity,
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

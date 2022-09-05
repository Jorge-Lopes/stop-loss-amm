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
    Should the liquidity(central and secondary) be reallocated from "liquiditySeat" to the "stopLossSeat"?
    - check again considering that the amount await was added.
    pay attention to the diference in value of input and output liquidity from the amm
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
    );

    const amount = await deposited;

    return liquiditySeat;
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
    // if one bounder resolves, the other should be canceled
      removeLiquidity ()
  }

  updateStopRatio () => {
      removeLiquidity ()
      create new contract*
  }

  withdrawLiquidity () => {}

  withdrawLPtoken () => {}

  publicFacet ({
      getQuote
  })

  creatorFacet ({
      makeAddLPTokensInvitation,
      updateStopRatio
      withdrawLiquidity
  })

*/

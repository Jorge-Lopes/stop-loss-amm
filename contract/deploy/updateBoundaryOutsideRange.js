import dappConstants from '../dappConstants.js';
import { E } from '@endo/far';
import { getBoundaries } from '../test/helper.js';
import { AmountMath } from '@agoric/ertp';
import { getAmountOut, makeRatioFromAmounts } from '@agoric/zoe/src/contractSupport/index.js';

const updateBoundaryOutsideRange = async (homeP) => {
  const home = await homeP;
  /** @type {{zoe: ZoeService}} */
  const { wallet, scratch, board, agoricNames, zoe } = home;

  const { STOP_LOSS_CREATOR_FACET_SCRATCH_ID, SECONDARY_ISSUER_BOARD_ID } = dappConstants;

  const ammInstanceP = E(agoricNames).lookup('instance', 'amm');
  const istBrandP = E(agoricNames).lookup('brand', 'IST');
  const walletBridgerP = E(wallet).getBridge();
  const secondaryIssuerP = E(board).getValue(SECONDARY_ISSUER_BOARD_ID);

  console.log('Fetching stopLossCreatorFacet and necessary ERTP date...');
  const [stopLossCreatorFacet, secondaryBrand, ammPublicFacet, istBrand] = await Promise.all([
    E(scratch).get(STOP_LOSS_CREATOR_FACET_SCRATCH_ID),
    E(secondaryIssuerP).getBrand(),
    E(zoe).getPublicFacet(ammInstanceP),
    istBrandP
  ]);

  const { fromCentral } = await E(ammPublicFacet).getPriceAuthorities(secondaryBrand);

  console.log('Fetching current boundaries...');
  const oneUnitIst = AmountMath.make(istBrand, 10n ** 6n)
  const quote = await E(fromCentral).quoteGiven(oneUnitIst, secondaryBrand);
  const price = getAmountOut(quote);
  const marginAmount = AmountMath.make(secondaryBrand, 5n * 10n ** 7n) // 0,5 SCR

  const newBoundaries = {
    upper: makeRatioFromAmounts(AmountMath.subtract(price, marginAmount), oneUnitIst),
    lower: makeRatioFromAmounts(AmountMath.subtract(price, marginAmount), oneUnitIst),
  };

  const updateBoundariesConfig = {
    id: `${Date.now()}`,
    invitation: E(stopLossCreatorFacet).makeUpdateConfigurationInvitation(),
    proposalTemplate: {
      arguments: {
        boundaries: newBoundaries,
      },
    },
  };

  console.log('Making an offer to update price boundaries...');
  await E(walletBridgerP).addOffer(updateBoundariesConfig);
  console.log('Please go to your wallet UI and approve the offer.');
};

export default updateBoundaryOutsideRange;
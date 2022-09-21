import dappConstants from '../dappConstants.js';
import { E } from '@endo/far';
import { floorMultiplyBy, makeRatio, makeRatioFromAmounts } from '@agoric/zoe/src/contractSupport/ratio.js';
import { AmountMath } from '@agoric/ertp/src/amountMath.js';
import { getBoundaries } from '../test/helper.js';

const updateBoundaries = async homeP => {
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
  const widerBoundaries = await getBoundaries(fromCentral,
    AmountMath.make(istBrand, 10n ** 6n), secondaryBrand, 30n);

  const newBoundaries = {
    upper: widerBoundaries.upper,
    lower: widerBoundaries.lower,
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
  console.log('Please go to your wallet UI and approve the offer.')
};

export default updateBoundaries;
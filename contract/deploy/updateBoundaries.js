import dappConstants from '../dappConstants.js';
import { E } from '@endo/far';
import { floorMultiplyBy, makeRatio, makeRatioFromAmounts } from '@agoric/zoe/src/contractSupport/ratio.js';
import { AmountMath } from '@agoric/ertp/src/amountMath.js';

const updateBoundaries = async homeP => {
  const home = await homeP;
  /** @type {{zoe: ZoeService}} */
  const { wallet, scratch, board } = home;

  const { STOP_LOSS_CREATOR_FACET_SCRATCH_ID, SECONDARY_ISSUER_BOARD_ID } = dappConstants;

  const walletBridgerP = E(wallet).getBridge();
  const secondaryIssuerP = E(board).getValue(SECONDARY_ISSUER_BOARD_ID);

  console.log('Fetching stopLossCreatorFacet and necessary ERTP date...');
  const [stopLossCreatorFacet, secondaryBrand] = await Promise.all([
    E(scratch).get(STOP_LOSS_CREATOR_FACET_SCRATCH_ID),
    E(secondaryIssuerP).getBrand(),
  ]);

  console.log('Fetching current boundaries...');
  const notifierP = E(stopLossCreatorFacet).getNotifier();
  const { value: { boundaries: { upper, lower } } } = await E(notifierP).getUpdateSince();
  console.log('upper', upper)
  console.log('lower', lower)
  const updateMarginRatio = makeRatio(10n, secondaryBrand);

  const upperBoundaryUpdateMargin = floorMultiplyBy(upper.numerator, updateMarginRatio);
  const lowerBoundaryUpdateMargin = floorMultiplyBy(lower.numerator, updateMarginRatio);


  const newBoundaries = {
    upper: makeRatioFromAmounts(AmountMath.add(upper.numerator, upperBoundaryUpdateMargin), upper.denominator),
    lower: makeRatioFromAmounts(AmountMath.subtract(lower.numerator, lowerBoundaryUpdateMargin), lower.denominator),
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
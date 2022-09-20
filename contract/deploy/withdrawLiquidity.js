import dappConstants from '../dappConstants.js';
import { E } from '@endo/far';

const withdrawLiquidity = async (homeP) => {
  const home = await homeP;
  /** @type {{zoe: ZoeService}} */
  const { wallet, scratch } = home;

  const { STOP_LOSS_CREATOR_FACET_SCRATCH_ID } = dappConstants;

  const walletBridgerP = E(wallet).getBridge();

  console.log('Fetching stopLossCreatorFacet...');
  const stopLossCreatorFacet = await E(scratch).get(STOP_LOSS_CREATOR_FACET_SCRATCH_ID);

  const withdrawLiquidityConfig = {
    id: `${Date.now()}`,
    invitation: E(stopLossCreatorFacet).makeWithdrawLiquidityInvitation(),
    proposalTemplate: {
      want: {
        Central: {
          pursePetname: 'Agoric stable local currency',
          value: 0n,
        },
        Secondary: {
          pursePetname: 'Secondary Purse',
          value: 0n,
        },
      }
    },
  };

  console.log('Making an offer to withdraw liquidity...');
  await E(walletBridgerP).addOffer(withdrawLiquidityConfig);
  console.log('Please go to your wallet UI and approve the offer.')
};

export default withdrawLiquidity;
import dappConstants from '../dappConstants.js';
import { E } from '@endo/far';

const withdrawLpTokens = async (homeP) => {
  const home = await homeP;
  /** @type {{zoe: ZoeService}} */
  const { wallet, scratch } = home;

  const { STOP_LOSS_CREATOR_FACET_SCRATCH_ID } = dappConstants;

  const walletBridgerP = E(wallet).getBridge();

  console.log('Fetching stopLossCreatorFacet...');
  const stopLossCreatorFacet = await E(scratch).get(STOP_LOSS_CREATOR_FACET_SCRATCH_ID);

  const withdrawLiquidityConfig = {
    id: `${Date.now()}`,
    invitation: E(stopLossCreatorFacet).makeWithdrawLpTokensInvitation(),
    proposalTemplate: {
      want: {
        Liquidity: {
          pursePetname: 'LpToken Purse',
          value: 0n,
        }
      }
    },
  };

  console.log('Making an offer to withdraw LP Token...');
  await E(walletBridgerP).addOffer(withdrawLiquidityConfig);
  console.log('Please go to your wallet UI and approve the offer.')
};

export default withdrawLpTokens;
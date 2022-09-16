import { E } from '@endo/far';
import dappConstants from '../dappConstants.js';

const lockLpTokens = async (homeP) => {
  const home = await homeP;
  /** @type {{zoe: ZoeService}} */
  const { wallet, scratch } = home;

  const { STOP_LOSS_CREATOR_FACET_SCRATCH_ID } = dappConstants;

  const walletBridgerP = E(wallet).getBridge();

  console.log('Fetching secondaryCreatorFacet...');
  const secondaryCreatorFacet = await E(scratch).get(STOP_LOSS_CREATOR_FACET_SCRATCH_ID);

  const lockLpTokenConfig = {
    id: `${Date.now()}`,
    invitation: E(secondaryCreatorFacet).makeLockLPTokensInvitation(),
    proposalTemplate: {
      give: {
        Liquidity: {
          pursePetname: 'LpToken Purse',
          value: 10n ** 6n, // 1 unit of LP Token
        }
      }
    },
  };

  console.log('Making an offer to lock LP tokens...');
  await E(walletBridgerP).addOffer(lockLpTokenConfig);
  console.log('Please go to your wallet UI and approve the offer.')
};

export default lockLpTokens;
import dappConstants from '../dappConstants.js';
import { E } from '@endo/far';

const addLiquidityToAMM = async homeP => {
  const home = await homeP;
  /** @type {{zoe: ZoeService}} */
  const { zoe, wallet, agoricNames } = home;

  const walletBridgerP = E(wallet).getBridge();
  const ammInstanceP = E(agoricNames).lookup('instance', 'amm');

  console.log('Fetchin ammPublicFacet...');
  /** @type XYKAMMPublicFacet */
  const ammPublicFacet = await E(zoe).getPublicFacet(ammInstanceP);

  const addLiquidityConfig = {
    id: `${Date.now()}`,
    invitation: E(ammPublicFacet).makeAddLiquidityInvitation(),
    proposalTemplate: {
      give: {
        Secondary: {
          pursePetname: 'Secondary Purse',
          value: 80n ** 10n ** 8n, // 2 Secondary
        },
        Central: {
          pursePetname: 'Agoric stable local currency',
          value: 40n * 10n ** 6n, // 1 IST
        },
      },
      want: {
        Liquidity: {
          pursePetname: 'LpToken Purse',
          value: 100n,
        }
      },
    },
  };

  console.log('Making an offer to add liquidity to AMM...');
  await E(walletBridgerP).addOffer(addLiquidityConfig);
  console.log('Please go to your wallet UI and approve the offer.');

};

export default addLiquidityToAMM;

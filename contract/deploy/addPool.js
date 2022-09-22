import { E } from '@endo/far';

const addPool = async (homeP) => {
  const home = await homeP;
  /** @type {{zoe: ZoeService}} */
  const { zoe, agoricNames, wallet } = home;

  const walletBridgerP = E(wallet).getBridge();

  console.log('Getting AMM Public Facet...');
  const ammInstanceP = E(agoricNames).lookup('instance', 'amm');
  /** @type XYKAMMPublicFacet */
  const ammPublicFacet = await  E(zoe).getPublicFacet(ammInstanceP);

  const addPoolConfig = {
    id: `${Date.now()}`,
    invitation: E(ammPublicFacet).addPoolInvitation(),
    proposalTemplate: {
      give: {
        Central: {
          pursePetname: 'Agoric stable local currency',
          value: 100n * 10n ** 6n, // 1 IST
        },
        Secondary: {
          pursePetname: 'Secondary Purse',
          value: 200n * 10n ** 8n, // 2 SCR
        }
      },
      want: {
        Liquidity: {
          pursePetname: 'LpToken Purse',
          value: 100n,
        }
      },
    },
  };

  console.log('Adding new pool...');
  await E(walletBridgerP).addOffer(addPoolConfig);
  console.log('Please go to your wallet UI and approve the offer.')
};

export default addPool;
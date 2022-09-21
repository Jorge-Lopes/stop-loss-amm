// @ts-check

import '@agoric/zoe/exported.js';
import { E } from '@endo/far';
import { makeDeployHelper } from './deployHelper.js';

export default async function deployContract(
  homePromise,
  { bundleSource, pathResolve },
) {

  const home = await homePromise;
  /** @type {{zoe: ZoeService}} */
  const { zoe, board, agoricNames, wallet } = home;

  const {
    startFaucet,
    addIssuerToAmm,
    startStopLoss,
    startAMMPool,
    getLiquidityFromFaucet,
  } = makeDeployHelper(zoe, bundleSource, pathResolve);

  const ammInstanceP = E(agoricNames).lookup('instance', 'amm');
  const walletBridgerP = E(wallet).getBridge();

  console.log('Starting faucets...')
  const [secondaryFaucet, /** @type XYKAMMPublicFacet */ammPublicFacet] = await Promise.all([
    startFaucet('SCR2', { decimalPlaces: 8 }),
    E(zoe).getPublicFacet(ammInstanceP),
  ]);

  const { creatorFacet: secondaryCreatorFacet, instance: secondaryInstance } = secondaryFaucet;

  console.log('Getting issuers and liquidity...');
  const [secondaryIssuer, secondaryLiquidity] = await Promise.all([
    E(secondaryCreatorFacet).getIssuer(),
    getLiquidityFromFaucet(secondaryCreatorFacet, 2n, 'SCR2'),
  ]);

  const lpTokenIssuer = await addIssuerToAmm(ammPublicFacet, secondaryIssuer, 'SCR2');

  console.log('Getting board ids for issuers...');
  const [SECONDARY_ISSUER_BOARD_ID, LP_TOKEN_ISSUER_BOARD_ID] = await Promise.all([
    E(board).getId(secondaryIssuer),
    E(board).getId(lpTokenIssuer),
  ]);

  console.log('Suggesting issuers...');
  await Promise.all([
    E(walletBridgerP).suggestIssuer('Secondary Purse2', SECONDARY_ISSUER_BOARD_ID),
    E(walletBridgerP).suggestIssuer('LpToken Purse2', LP_TOKEN_ISSUER_BOARD_ID),
  ]);

  console.log('Depositing secondaryLiquidity...');
  const secondaryPurseP = E(wallet).getPurse('Secondary Purse2');
  await E(secondaryPurseP).deposit(secondaryLiquidity);

  const addPoolConfig = {
    id: `${Date.now()}`,
    invitation: E(ammPublicFacet).addPoolInvitation(),
    proposalTemplate: {
      give: {
        Central: {
          pursePetname: 'Agoric stable local currency',
          value: 1n * 10n ** 6n, // 1 IST
        },
        Secondary: {
          pursePetname: 'Secondary Purse2',
          value: 2n * 10n ** 8n, // 2 SCR
        }
      },
      want: {
        Liquidity: {
          pursePetname: 'LpToken Purse2',
          value: 100n,
        }
      },
    },
  };

  console.log('Adding new pool...');
  await E(walletBridgerP).addOffer(addPoolConfig);
  console.log('Please go to your wallet UI and approve the offer.')

}
import { makeDeployHelper } from './deployHelper.js';
import { E } from '@endo/far';
import fs from 'fs';

const initState = async (homeP, { bundleSource, pathResolve }) => {
  const home = await homeP;
  /** @type {{zoe: ZoeService}} */
  const { zoe, board, agoricNames, wallet, scratch } = home;

  const {
    startFaucet,
    addIssuerToAmm,
    getLiquidityFromFaucet,
  } = makeDeployHelper(zoe, bundleSource, pathResolve);

  const ammInstanceP = E(agoricNames).lookup('instance', 'amm');
  const walletBridgerP = E(wallet).getBridge();

  console.log('Starting faucets...')
  const [secondaryFaucet, /** @type XYKAMMPublicFacet */ammPublicFacet] = await Promise.all([
    startFaucet('SCR', { decimalPlaces: 8 }),
    E(zoe).getPublicFacet(ammInstanceP),
  ]);

  const { creatorFacet: secondaryCreatorFacet, instance: secondaryInstance } = secondaryFaucet;

  console.log('Getting issuers and liquidity...');
  const [secondaryIssuer, secondaryLiquidity] = await Promise.all([
    E(secondaryCreatorFacet).getIssuer(),
    getLiquidityFromFaucet(secondaryCreatorFacet, 1000n, 'SCR'),
  ]);

  const lpTokenIssuer = await addIssuerToAmm(ammPublicFacet, secondaryIssuer, 'SCR');

  console.log('Getting board ids for issuers...');
  const [SECONDARY_ISSUER_BOARD_ID, LP_TOKEN_ISSUER_BOARD_ID, SECONDARY_CREATOR_FACET_SCRATCH_ID] = await Promise.all([
    E(board).getId(secondaryIssuer),
    E(board).getId(lpTokenIssuer),
    E(scratch).set('secondary_creator_facet_scratch_id', secondaryCreatorFacet),
  ]);

  console.log('Suggesting issuers...');
  await Promise.all([
    E(walletBridgerP).suggestIssuer('Secondary Purse', SECONDARY_ISSUER_BOARD_ID),
    E(walletBridgerP).suggestIssuer('LpToken Purse', LP_TOKEN_ISSUER_BOARD_ID),
  ]);

  console.log('Depositing secondaryLiquidity...');
  const secondaryPurseP = E(wallet).getPurse('Secondary Purse');
  await E(secondaryPurseP).deposit(secondaryLiquidity);

  console.log('--- SECONDARY_ISSUER_BOARD_ID ---', SECONDARY_ISSUER_BOARD_ID);
  console.log('--- SECONDARY_CREATOR_FACET_SCRATCH_ID ---', SECONDARY_CREATOR_FACET_SCRATCH_ID);
  console.log('--- LP_TOKEN_ISSUER_BOARD_ID ---', LP_TOKEN_ISSUER_BOARD_ID);

  const dappConstants = {
    SECONDARY_ISSUER_BOARD_ID,
    SECONDARY_CREATOR_FACET_SCRATCH_ID,
    LP_TOKEN_ISSUER_BOARD_ID,
  };

  const defaultsFile = pathResolve(`../dappConstants.js`);
  console.log('writing', defaultsFile);
  const defaultsContents = `\
// GENERATED
export default ${JSON.stringify(dappConstants, undefined, 2)};
`;

  await fs.promises.writeFile(defaultsFile, defaultsContents);
  console.log('Done.')
};

export default initState;
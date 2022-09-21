import { makeDeployHelper } from './deployHelper.js';
import { E } from '@endo/far';
import { AmountMath } from '@agoric/ertp/src/amountMath.js';
import dappConstants from '../dappConstants.js';
import { getBoundaries } from '../test/helper.js';
import fs from 'fs';

const initStopLoss = async (homeP, { bundleSource, pathResolve }) => {
  const home = await homeP;
  /** @type {{zoe: ZoeService}} */
  const { zoe, board, agoricNames, wallet, scratch } = home;

  const { SECONDARY_ISSUER_BOARD_ID, LP_TOKEN_ISSUER_BOARD_ID } = dappConstants;

  const {
    startStopLoss,
  } = makeDeployHelper(zoe, bundleSource, pathResolve);

  const ammInstanceP = E(agoricNames).lookup('instance', 'amm');
  const centralIssuerP = E(agoricNames).lookup('issuer', 'IST');
  const centralBrandP = E(agoricNames).lookup('brand', 'IST');
  const secondaryIssuerP = E(board).getValue(SECONDARY_ISSUER_BOARD_ID);
  const walletBridgerP = E(wallet).getBridge();

  console.log('Fetching ammPublicFacet and related ERTP data...');
  /** @type {
   * {ammPublicFacet: XYKAMMPublicFacet,
   * secondaryIssuer: Issuer,
   * econdaryBrand: Brand ,
   * lpTokenIssuer: Issuer}
   * } */
  const [ammPublicFacet, secondaryIssuer, secondaryBrand, lpTokenIssuer, centralBrand, centralIssuer] = await Promise.all([
    E(zoe).getPublicFacet(ammInstanceP),
    secondaryIssuerP,
    E(secondaryIssuerP).getBrand(),
    E(board).getValue(LP_TOKEN_ISSUER_BOARD_ID),
    centralBrandP,
    centralIssuerP,
  ]);

  console.log('Getting boundaries...');
  const { fromCentral } = await E(ammPublicFacet).getPriceAuthorities(secondaryBrand);
  const boundaries = await getBoundaries(fromCentral, AmountMath.make(centralBrand, 10n ** 6n), secondaryBrand);

  const terms = {
    ammPublicFacet,
    secondaryIssuer,
    lpTokenIssuer,
    centralIssuer,
    boundaries,
  };

  console.log('Starting stopLoss contract...');
  const { creatorFacet, publicFacet, instance } = await startStopLoss(terms);

  console.log('Putting stopLoss data to board and scratch...');
  const [
    STOP_LOSS_CREATOR_FACET_SCRATCH_ID,
    STOP_LOSS_PUBLIC_FACET_BOARD_ID,
    STOP_LOSS_INSTANCE_BOARD_ID] = await Promise.all([
    E(scratch).set('stop_loss_creator_facet_scratch_id', creatorFacet),
    E(board).getId(publicFacet),
    E(board).getId(instance),
  ]);

  console.log('--- STOP_LOSS_CREATOR_FACET_SCRATCH_ID ---', STOP_LOSS_CREATOR_FACET_SCRATCH_ID);
  console.log('--- STOP_LOSS_PUBLIC_FACET_BOARD_ID ---', STOP_LOSS_PUBLIC_FACET_BOARD_ID);
  console.log('--- STOP_LOSS_INSTANCE_BOARD_ID ---', STOP_LOSS_INSTANCE_BOARD_ID);

  const dappDefaults = {
    ...dappConstants,
    STOP_LOSS_CREATOR_FACET_SCRATCH_ID,
    STOP_LOSS_PUBLIC_FACET_BOARD_ID,
    STOP_LOSS_INSTANCE_BOARD_ID,
  };

  const defaultsFile = pathResolve(`../dappConstants.js`);
  console.log('writing', defaultsFile);
  const defaultsContents = `\
// GENERATED
export default ${JSON.stringify(dappDefaults, undefined, 2)};
`;

  await fs.promises.writeFile(defaultsFile, defaultsContents);
  console.log('Done.')

};

export default initStopLoss;
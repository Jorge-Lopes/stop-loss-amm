// @ts-check

import fs from 'fs';
import '@agoric/zoe/exported.js';
import { E } from '@endo/eventual-send';

export default async function deployContract(
  homePromise,
  { bundleSource, pathResolve },
) {

  const home = await homePromise;
  const {zoe, board,} = home;

  // bundle contracts address
  const bundle = await bundleSource(pathResolve(`../src/stopLoss.js`));


  // install contracts bundle through zoe
  const installation = await E(zoe).install(bundle);

  // get board ID of the instalation
  const CONTRACT_NAME = 'stopLoss';
  const BOARD_ID = await E(board).getId(installation);

  console.log('- SUCCESS! contracts code installed on Zoe');
  console.log(`-- Contract Name: ${CONTRACT_NAME}`);
  console.log(`-- Contract Board Id: ${BOARD_ID}`);

  const dappConstants = {
    CONTRACT_NAME, 
    BOARD_ID, 
  };

  // record dappConstantes in a local file
  const defaultsFolder = pathResolve(`../ui/src/conf`);
  const defaultsFile = pathResolve(`../ui/src/conf/installationConstants.js`);
  console.log('writing', defaultsFile);
  const defaultsContents = `\
// GENERATED FROM ${pathResolve('./deploy.js')}
export default ${JSON.stringify(dappConstants, undefined, 2)};
`;
  await fs.promises.mkdir(defaultsFolder, { recursive: true });
  await fs.promises.writeFile(defaultsFile, defaultsContents);
}
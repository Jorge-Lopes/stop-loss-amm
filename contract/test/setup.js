// @ts-check
import { E } from '@endo/far';
import buildManualTimer from '@agoric/zoe/tools/manualTimer.js';
import * as Collect from '@agoric/inter-protocol/src/collect.js';
import {
  setupAmm,
  startEconomicCommittee,
  setupReserve,
} from '@agoric/inter-protocol/src/proposals/econ-behaviors.js';
import { provideBundle } from '@agoric/inter-protocol/test/supports.js';
import bundleSource from "@endo/bundle-source";
import { resolve as importMetaResolve } from 'import-meta-resolve';
import { setupAMMBootstrap, setUpZoeForTest } from '@agoric/inter-protocol/test/amm/vpool-xyk-amm/setup.js'

/*
  Code imported from: @agoric/run-protocol/test/amm/vpool-xyk-amm/setup.js
  Purpose:
    setup an zoe instace for testing purposes,
    setup amm bootstap to get access to produce and consume functions,
    setup an amm instance, exporting the public and contructor facet for testing purposes;
*/

const contractRoots = {
  ammRoot: '@agoric/inter-protocol/src/vpool-xyk-amm/multipoolMarketMaker.js',
  reserveRoot: '@agoric/inter-protocol/src/reserve/assetReserve.js',
  stopLossRoot: '../src/stopLoss.js'
}

/**
 * NOTE: called separately by each test so AMM/zoe/priceAuthority don't interfere
 *
 * @param {*} t
 * @param {{ committeeName: string, committeeSize: number}} electorateTerms
 * @param {{ brand: Brand, issuer: Issuer }} centralR
 * @param {ManualTimer | undefined=} timer
 * @param {ERef<ZoeService> | undefined=} farZoeKit
 */
export const setupAmmServices = async (
  t,
  electorateTerms,
  centralR,
  timer = buildManualTimer(console.log),
  farZoeKit,
) => {
  if (!farZoeKit) {
    farZoeKit = await setUpZoeForTest();
  }
  const { feeMintAccess, zoe } = farZoeKit;
  const space = await setupAMMBootstrap(timer, farZoeKit);
  space.produce.zoe.resolve(farZoeKit.zoe);
  space.produce.feeMintAccess.resolve(feeMintAccess);
  const { consume, brand, issuer, installation, instance } = space;
  const ammUrl = await importMetaResolve(contractRoots.ammRoot, import.meta.url);
  const ammBundle = await provideBundle(t, new URL(ammUrl).pathname, 'amm');
  installation.produce.amm.resolve(E(zoe).install(ammBundle));
  const reserveUrl = await importMetaResolve(contractRoots.reserveRoot, import.meta.url);
  const reserveBundle = await provideBundle(t, new URL(reserveUrl).pathname, 'reserve');
  installation.produce.reserve.resolve(E(zoe).install(reserveBundle));
  brand.produce.IST.resolve(centralR.brand);
  issuer.produce.IST.resolve(centralR.issuer);

  await Promise.all([
    await startEconomicCommittee(space, {
      options: { econCommitteeOptions: electorateTerms },
    }),
    await setupAmm(space, {
      options: {
        minInitialPoolLiquidity: 1000n,
      },
    }),
  ]);

  await setupReserve(space);

  const installs = await Collect.allValues({
    amm: installation.consume.amm,
    governor: installation.consume.contractGovernor,
    electorate: installation.consume.committee,
    counter: installation.consume.binaryVoteCounter,
  });

  const governorCreatorFacet = consume.ammGovernorCreatorFacet;
  const governorInstance = await instance.consume.ammGovernor;
  const governorPublicFacet = await E(zoe).getPublicFacet(governorInstance);
  const g = {
    governorInstance,
    governorPublicFacet,
    governorCreatorFacet,
  };
  const governedInstance = E(governorPublicFacet).getGovernedContract();

  /** @type { GovernedPublicFacet<XYKAMMPublicFacet> } */
  // @ts-expect-error cast from unknown
  const ammPublicFacet = await E(governorCreatorFacet).getPublicFacet();
  const amm = {
    ammCreatorFacet: await consume.ammCreatorFacet,
    ammPublicFacet,
    instance: governedInstance,
  };

  const committeeCreator = await consume.economicCommitteeCreatorFacet;
  const electorateInstance = await instance.consume.economicCommittee;

  const poserInvitationP = E(committeeCreator).getPoserInvitation();
  const poserInvitationAmount = await E(
    E(zoe).getInvitationIssuer(),
  ).getAmountOf(poserInvitationP);
  return {
    zoe,
    installs,
    electorate: installs.electorate,
    committeeCreator,
    electorateInstance,
    governor: g,
    amm,
    invitationAmount: poserInvitationAmount,
    space,
  };
};
harden(setupAmmServices);


export const setupStopLoss = async (
  t,
  zoe,
  issuerKeywordRecord,
  terms,
) => {

  const stopLossUrl = await importMetaResolve(contractRoots.stopLossRoot, import.meta.url);
  const stopLossBundle = await provideBundle(t, new URL(stopLossUrl).pathname, 'stopLoss');
  const installation = await E(zoe).install(stopLossBundle);

  const { publicFacet, creatorFacet  } = await E(zoe).startInstance(
    installation,
    issuerKeywordRecord,
    terms
  );

  return { publicFacet, creatorFacet };

};
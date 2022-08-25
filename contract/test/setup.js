// @ts-check
import { E } from '@endo/far';
import { makeLoopback } from '@endo/captp';
import { makeFakeVatAdmin } from '@agoric/zoe/tools/fakeVatAdmin.js';
import { makeZoeKit } from '@agoric/zoe';
import buildManualTimer from '@agoric/zoe/tools/manualTimer.js';
import {
  makeAgoricNamesAccess,
  makePromiseSpace,
} from '@agoric/vats/src/core/utils.js';
import * as Collect from '@agoric/run-protocol/src/collect.js';
import {
  setupAmm,
  startEconomicCommittee,
} from '@agoric/run-protocol/src/econ-behaviors.js';
import {
  installGovernance,
  provideBundle,
} from '@agoric/run-protocol/test/supports.js';
import bundleSource from "@endo/bundle-source";
import { resolve as importMetaResolve } from 'import-meta-resolve';

/*
  Code imported from: @agoric/run-protocol/test/amm/vpool-xyk-amm/setup.js
  When finished, consider importing the file instead of duplicating it this repository
  Purpose:
    setup an zoe instace for testing purposes,
    setup amm bootstap to get access to produce and consume functions,
    setup an amm instance, exporting the public and contructor facet for testing purposes;
*/

const ammRoot =
  '@agoric/run-protocol/src/vpool-xyk-amm/multipoolMarketMaker.js'; // package relative

const stopLossRoot =
  '../src/stopLoss.js'

export const setUpZoeForTest = async () => {
  const { makeFar } = makeLoopback('zoeTest');

  const { zoeService, feeMintAccess: nonFarFeeMintAccess } = makeZoeKit(
    makeFakeVatAdmin(() => {}).admin,
  );
  /** @type {ERef<ZoeService>} */
  const zoe = makeFar(zoeService);
  const feeMintAccess = await makeFar(nonFarFeeMintAccess);
  return {
    zoe,
    feeMintAccess,
  };
};
harden(setUpZoeForTest);

export const setupAMMBootstrap = async (
  timer = buildManualTimer(console.log),
  zoe,
) => {
  if (!zoe) {
    ({ zoe } = await setUpZoeForTest());
  }

  const space = /** @type {any} */ (makePromiseSpace());
  const { produce, consume } =
    /** @type { import('@agoric/run-protocol/src/econ-behaviors.js').EconomyBootstrapPowers } */ (
      space
    );

  produce.chainTimerService.resolve(timer);
  produce.zoe.resolve(zoe);

  const { agoricNames, spaces } = makeAgoricNamesAccess();
  produce.agoricNames.resolve(agoricNames);

  installGovernance(zoe, spaces.installation.produce);

  return { produce, consume, ...spaces };
};

/**
 * NOTE: called separately by each test so AMM/zoe/priceAuthority don't interfere
 *
 * @param {*} t
 * @param {{ committeeName: string, committeeSize: number}} electorateTerms
 * @param {{ brand: Brand, issuer: Issuer }} centralR
 * @param {ManualTimer | undefined=} timer
 * @param {ERef<ZoeService> | undefined=} zoe
 */
export const setupAmmServices = async (
  t,
  electorateTerms,
  centralR,
  timer = buildManualTimer(console.log),
  zoe,
) => {
  if (!zoe) {
    ({ zoe } = await setUpZoeForTest());
  }
  const space = await setupAMMBootstrap(timer, zoe);
  const { consume, brand, issuer, installation, instance } = space;
  const url = await importMetaResolve(ammRoot, import.meta.url);
  const ammBundle = await provideBundle(t, new URL(url).pathname, 'amm');
  installation.produce.amm.resolve(E(zoe).install(ammBundle));

  brand.produce.RUN.resolve(centralR.brand);
  issuer.produce.RUN.resolve(centralR.issuer);

  await Promise.all([
    startEconomicCommittee(space, electorateTerms),
    setupAmm(space),
  ]);

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
  zoe,
  issuerKeywordRecord,
  terms,

) => {

  const contractPath = new URL(stopLossRoot, import.meta.url).pathname;
  const bundle = await bundleSource(contractPath);
  const installation = await E(zoe).install(bundle);

  const { publicFacet, creatorFacet  } = await E(zoe).startInstance(
    installation,
    issuerKeywordRecord,
    terms
  );

  return { publicFacet, creatorFacet };

};
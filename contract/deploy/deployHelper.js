import { E } from '@endo/far';
import { setupAmmServices } from '../test/setup.js';
import { unsafeMakeBundleCache } from '@agoric/swingset-vat/tools/bundleTool.js';
import buildManualTimer from '@agoric/zoe/tools/manualTimer.js';
import { AmountMath } from '@agoric/ertp/src/amountMath.js';

const contractRoots = {
  faucet: './faucet.js',
  stopLoss: '../src/stopLoss.js',
}

/**
 *
 * @param {ZoeService} zoe
 * @param bundleSource
 * @param pathResolve
 * @returns {*}
 */
export const makeDeployHelper = (zoe, bundleSource, pathResolve) => {

  const installContract = async root => {
    const bundleP = await bundleSource(pathResolve(root));
    return E(zoe).install(bundleP);
  };

  /**
   *
   * @param {String} keyword
   * @param {{decimalPlaces: number}} displayInfo
   */
  const startFaucet = async (keyword, displayInfo) => {
    const installationP = await installContract(contractRoots.faucet);
    const terms = {
      keyword,
      displayInfo,
    };

    return E(zoe).startInstance(installationP,
      undefined,
      terms);
  };

  const getLiquidityFromFaucet = async (creatorFacet, unit, keyword) => {
    const issuerP = E(creatorFacet).getIssuer();
    const invitationP = E(creatorFacet).makeFaucetInvitation();
    const brand = await E(issuerP).getBrand();
    const displayInfo = await E(brand).getDisplayInfo();
    const proposalAmountKeywordRecord = {};
    proposalAmountKeywordRecord[keyword] = AmountMath.make(brand, unit * 10n ** BigInt(displayInfo.decimalPlaces));
    const liquidityProposal = {
      give: {},
      want: proposalAmountKeywordRecord,
    };

    const faucetSeatP = E(zoe).offer(
      invitationP,
      harden(liquidityProposal),
      harden({}),
    );

    return E(faucetSeatP).getPayout(keyword);
  };

  /**
   *
   * @param {XYKAMMPublicFacet} ammPublicFacet
   * @param {Issuer} issuer
   * @param {String} kwd
   */
  const addIssuerToAmm = (ammPublicFacet, issuer, kwd) => {
    return E(ammPublicFacet).addIssuer(issuer, kwd);
  };

  const startStopLoss = async (terms) => {

    const {
      centralIssuer,
      secondaryIssuer,
      lpTokenIssuer,
    } = terms;

    const issuerKeywordRecord = harden({
      Central: centralIssuer,
      Secondary: secondaryIssuer,
      LpToken: lpTokenIssuer,
    });

    const installationP = await installContract(contractRoots.stopLoss);

    return E(zoe).startInstance(
      installationP,
      issuerKeywordRecord,
      terms,
    );
  };

  const startAMMPool = async () => {

  };

  return harden({
    installContract,
    startFaucet,
    addIssuerToAmm,
    startStopLoss,
    startAMMPool,
    getLiquidityFromFaucet
  });
}


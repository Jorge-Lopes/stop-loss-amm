import dappConstants from '../dappConstants.js';
import { E } from '@endo/far';
import { floorMultiplyBy, makeRatio } from '@agoric/zoe/src/contractSupport/ratio.js';

const movePriceDown = async homeP => {
  const home = await homeP;
  /** @type {{zoe: ZoeService}} */
  const { wallet, agoricNames, zoe, board } = home;

  const TRADE_MARGIN = 10n;

  const { SECONDARY_ISSUER_BOARD_ID } = dappConstants;

  const ammInstanceP = E(agoricNames).lookup('instance', 'amm');
  const secodaryIssuerP = E(board).getValue(SECONDARY_ISSUER_BOARD_ID);
  const walletBridgerP = E(wallet).getBridge();

  console.log('Fetching ammPublicFacet and secondaryBrand...');
  /** @type {[ammPublicFacet: XYKAMMPublicFacet, secondaryBrand: Brand]} */
  const [ammPublicFacet, secondaryBrand] = await Promise.all([
    E(zoe).getPublicFacet(ammInstanceP),
    E(secodaryIssuerP).getBrand()
  ]);

  console.log('Getting the pool allocation...');
  const { Central: centralAmount } = await E(ammPublicFacet).getPoolAllocation(secondaryBrand);
  const { brand: centralBrand } = centralAmount;

  const tradeMarginRatio = makeRatio(TRADE_MARGIN, centralBrand);
  const tradeAmountIn = floorMultiplyBy(centralAmount, tradeMarginRatio);

  const swapConfig = {
    id: `${Date.now()}`,
    invitation: E(ammPublicFacet).makeSwapInInvitation(),
    proposalTemplate: {
      give: {
        In: {
          pursePetname: 'Agoric stable local currency',
          value: tradeAmountIn.value,
        },
      },
      want: {
        Out: {
          pursePetname: 'Secondary Purse',
          value: 0n,
        },
      },
    },
  };

  console.log(`Making an offer to move the price down by ${TRADE_MARGIN}%...`);
  await E(walletBridgerP).addOffer(swapConfig);
  console.log('Please go to your wallet UI and approve the offer.');
};

export default movePriceDown;
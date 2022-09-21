import dappConstants from '../dappConstants.js';
import { E } from '@endo/far';
import { floorMultiplyBy, makeRatio } from '@agoric/zoe/src/contractSupport/index.js';

const movePriceUp = async homeP => {
  const home = await homeP;
  /** @type {{zoe: ZoeService}} */
  const { wallet, agoricNames, zoe, board } = home;

  const TRADE_MARGIN = 5n;

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
  const { Secondary: secondaryAmount } = await E(ammPublicFacet).getPoolAllocation(secondaryBrand);

  const tradeMarginRatio = makeRatio(TRADE_MARGIN, secondaryBrand);
  const tradeAmountIn = floorMultiplyBy(secondaryAmount, tradeMarginRatio);

  const swapConfig = {
    id: `${Date.now()}`,
    invitation: E(ammPublicFacet).makeSwapInInvitation(),
    proposalTemplate: {
      give: {
        In: {
          pursePetname: 'Secondary Purse',
          value: tradeAmountIn.value,
        },
      },
      want: {
        Out: {
          pursePetname: 'Agoric stable local currency',
          value: 0n,
        },
      },
    },
  };

  console.log(`Making an offer to move the price up by ${TRADE_MARGIN}%...`);
  await E(walletBridgerP).addOffer(swapConfig);
  console.log('Please go to your wallet UI and approve the offer.');
};

export default movePriceUp;
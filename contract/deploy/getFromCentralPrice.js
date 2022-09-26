import dappConstants from '../dappConstants.js';
import { E } from '@endo/far';
import { getAmountOut } from '@agoric/zoe/src/contractSupport/index.js';
import { AmountMath } from '@agoric/ertp';

const getFromCentralPrice = async (homeP) => {
  const home = await homeP;
  /** @type {{zoe: ZoeService}} */
  const { wallet, agoricNames, zoe, board } = home;

  const { SECONDARY_ISSUER_BOARD_ID } = dappConstants;

  const ammInstanceP = E(agoricNames).lookup('instance', 'amm');
  const istBrandP = E(agoricNames).lookup('brand', 'IST');
  const secodaryIssuerP = E(board).getValue(SECONDARY_ISSUER_BOARD_ID);

  /** @type {[ammPublicFacet: XYKAMMPublicFacet, secondaryBrand: Brand]} */
  const [ammPublicFacet, secondaryBrand, istBrand] = await Promise.all([
    E(zoe).getPublicFacet(ammInstanceP),
    E(secodaryIssuerP).getBrand(),
    istBrandP
  ]);

  console.log('Getting the priceAuth...');
  const [{ fromCentral }] = await Promise.all([
    E(ammPublicFacet).getPriceAuthorities(secondaryBrand)
  ]);

  console.log('Getting the quote...');
  const quote = await E(fromCentral).quoteGiven(AmountMath.make(istBrand, 10n ** 6n), secondaryBrand);
  const price = getAmountOut(quote);
  console.log('Price', price);
};

export default getFromCentralPrice;
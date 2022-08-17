// @ts-check

import { Far, E } from '@endo/far';
import { AmountMath } from '@agoric/ertp';

const start = async zcf => {
    const { amm } = zcf.getTerms();    

    const getQuote = (amountIn, amountOut) => {
        const quote = E(amm).getOutputPrice(
            AmountMath.make(amountIn.brand, 10n),
            AmountMath.makeEmpty(amountOut.brand),
        );
        return quote
    }

    const publicFacet = Far('Stop Loss public facet', {
        getQuote,
    });
    
    const creatorFacet = Far('Stop Loss creator facet', {
    });

    return harden({ publicFacet, creatorFacet });

};
harden(start);
export { start };
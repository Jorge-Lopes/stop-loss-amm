// @ts-check

import { Far, E } from '@endo/far';

const start = async zcf => {
    const terms = zcf.getTerms();    
    
    const {
        amm,
        secondaryR,
    } = terms;

    const secondaryBrand = secondaryR.brand;

    const getAlocation = async () => {
        const poolAllocation = await E(amm.ammPublicFacet).getPoolAllocation(secondaryBrand);
        return poolAllocation;
    }

    const publicFacet = Far('public facet', {
        getAlocation,
    });
    
    const creatorFacet = Far('creator facet', {
    });

    return harden({ publicFacet, creatorFacet });

};
harden(start);
export { start };
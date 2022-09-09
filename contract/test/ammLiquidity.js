// @ts-check

import { E } from '@endo/eventual-send';
import { AmountMath } from '@agoric/ertp';

/*
  File adapted from: @agoric/run-protocol/test/amm/vpool-xyk-amm/test-liquidity.js
  When finished, consider importing the file instead of duplicating it this repository
  Purpose:
    Create function to interact with the AMM instace, such as:
      - add pool
      - add liquidity
      - remove liquidity
      - swap
*/

/**
 * @param t
 * @param {ZoeService} zoe
 * @param {XYKAMMPublicFacet} ammPublicFacet
 * @param {{ mint: Mint; issuer: Issuer; brand: Brand; displayInfo: DisplayInfo }} secondaryR
 * @param {{ mint: Mint; issuer: Issuer; brand: Brand; displayInfo: DisplayInfo }} centralR
 * @param {*} liquidityIssuer
 * @returns
 */
export const makeLiquidityInvitations = async (
  t,
  zoe,
  ammPublicFacet,
  secondaryR,
  centralR,
  liquidityIssuer,
) => {
  const makeCentral = (value) => AmountMath.make(centralR.brand, value * 10n ** BigInt(centralR.displayInfo.decimalPlaces));
  const makeSecondary = (value) => AmountMath.make(secondaryR.brand, value * 10n ** BigInt(secondaryR.displayInfo.decimalPlaces));
  const liquidityBrand = await E(liquidityIssuer).getBrand();

  const initPool = async (secondaryValue, centralValue) => {
    const addPoolInvitation = E(ammPublicFacet).addPoolInvitation();

    const proposal = harden({
      give: {
        Secondary: makeSecondary(secondaryValue),
        Central: makeCentral(centralValue),
      },
      want: { Liquidity: AmountMath.make(liquidityBrand, 1000n) },
    });
    const payments = {
      Secondary: secondaryR.mint.mintPayment(makeSecondary(secondaryValue)),
      Central: centralR.mint.mintPayment(makeCentral(centralValue)),
    };

    /** @type UserSeat */
    const addLiquiditySeat = await E(zoe).offer(
      addPoolInvitation,
      proposal,
      payments,
    );
    t.is(
      await E(addLiquiditySeat).getOfferResult(),
      'Added liquidity.',
      `Added Secondary and Central Liquidity`,
    );

    return { seat: addLiquiditySeat, liquidityIssuer };
  };

  const addLiquidity = async (secondary, central) => {
    const addLiquidityInvitation = E(
      ammPublicFacet,
    ).makeAddLiquidityInvitation();

    const secondaryPayment = secondaryR.mint.mintPayment(
      makeSecondary(secondary),
    );
    const centralPayment = centralR.mint.mintPayment(makeCentral(central));

    const proposal = harden({
      want: { Liquidity: AmountMath.make(liquidityBrand, 1000n) },
      give: {
        Secondary: makeSecondary(secondary),
        Central: makeCentral(central),
      },
    });
    const payments = {
      Secondary: secondaryPayment,
      Central: centralPayment,
    };

    const addLiquiditySeat = await E(zoe).offer(
      addLiquidityInvitation,
      proposal,
      payments,
    );

    return E(addLiquiditySeat).getPayouts();
  };

  const removeLiquidity = async (liquidityPayment, liquidity) => {
    const removeLiquidityInvitation = E(
      ammPublicFacet,
    ).makeRemoveLiquidityInvitation();

    const emptyLiquidity = AmountMath.make(liquidityBrand, liquidity);
    const proposal = harden({
      give: { Liquidity: emptyLiquidity },
      want: {
        Secondary: makeSecondary(0n),
        Central: makeCentral(0n),
      },
    });
    const payment = { Liquidity: liquidityPayment };

    const addLiquiditySeat = await E(zoe).offer(
      removeLiquidityInvitation,
      proposal,
      payment,
    );

    return E(addLiquiditySeat).getPayouts();
  };

  const swapSecondaryForCentral = async (secondaryValueIn) => {
    const invitationIssuer = await E(zoe).getInvitationIssuer();
    const swapInvitation = E(ammPublicFacet).makeSwapInInvitation();
    const { value } = await E(invitationIssuer).getAmountOf(swapInvitation);

    assert(Array.isArray(value)); // non-fungible
    const [invitationValue] = value;
    const swapPublicFacet = await E(zoe).getPublicFacet(
      invitationValue.instance,
    );

    const { amountOut: centralAmountOut } = await E(
      swapPublicFacet,
    ).getInputPrice(
      makeSecondary(secondaryValueIn),
      AmountMath.makeEmpty(centralR.brand),
    );

    const secondaryForCentralProposal = harden({
      want: { Out: centralAmountOut },
      give: { In: makeSecondary(secondaryValueIn) },
    });

    const secondaryPayment = secondaryR.mint.mintPayment(
      makeSecondary(secondaryValueIn),
    );
    const secondaryForCentralPayments = harden({ In: secondaryPayment });

    const swapSeat = await E(zoe).offer(
      swapInvitation,
      secondaryForCentralProposal,
      secondaryForCentralPayments,
    );

    return swapSeat;
  };

  const swapCentralForSecondary = async (centralValueIn) => {
    const invitationIssuer = await E(zoe).getInvitationIssuer();
    const swapInvitation = E(ammPublicFacet).makeSwapInInvitation();
    const { value } = await E(invitationIssuer).getAmountOf(swapInvitation);

    assert(Array.isArray(value)); // non-fungible
    const [invitationValue] = value;
    const swapPublicFacet = await E(zoe).getPublicFacet(
      invitationValue.instance,
    );

    const { amountOut: secondaryAmountOut } = await E(
      swapPublicFacet,
    ).getInputPrice(
      makeCentral(centralValueIn),
      AmountMath.makeEmpty(secondaryR.brand),
    );

    const centralForSecondaryProposal = harden({
      want: { Out: secondaryAmountOut },
      give: { In: makeCentral(centralValueIn) },
    });

    const centralPayment = centralR.mint.mintPayment(
      makeCentral(centralValueIn),
    );
    const centralForSecondaryPayments = harden({ In: centralPayment});

    const swapSeat = await E(zoe).offer(
      swapInvitation,
      centralForSecondaryProposal,
      centralForSecondaryPayments,
    );

    return swapSeat;
  };

  return harden({
    initPool,
    addLiquidity,
    removeLiquidity,
    swapSecondaryForCentral,
    swapCentralForSecondary,
    makeCentral,
    makeSecondary,
  });
};

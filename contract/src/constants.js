export const BOUNDARY_WATCHER_STATUS = {
  SUCCESS: 1,
  FAIL: 2,
};

export const UPDATED_BOUNDARY_MESSAGE = 'Successfully updated boundaries';

/**
 * Constants for allocation phase,
 * IDLE         - contract started
 * SCHEDULED    - price quotes scheduled
 * ACTIVE       - lp tokens locked in stopLoss seat
 * // TODO Consider changing the phrase 'Liquidate' to 'Remove'
 * LIQUIDATING  - liquidity being withdraw from the amm pool to the stopLoss seat
 * LIQUIDATED   - liquidity has been withdraw from the amm pool to the stopLoss seat
 * CLOSED       - stopLoss was closed by the creator and all assets have been transfered to his seat
 * ERROR        - error catched in some process
 */
export const ALLOCATION_PHASE = ({
  IDLE: 'idle',
  SCHEDULED: 'scheduled',
  ACTIVE: 'active',
  LIQUIDATING: 'liquidating',
  LIQUIDATED: 'liquidated',
  CLOSED: 'closed',
  ERROR: 'error,'
});
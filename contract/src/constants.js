export const BOUNDARY_WATCHER_STATUS = {
  SUCCESS: 1,
  FAIL: 2,
};

export const UPDATE_BOUNDARY_STATUS = {
  SUCCESS: 1,
  FAIL: 2,
};

export const UPDATED_BOUNDARY_MESSAGE = 'Successfully updated boundaries';

/**
 * Constants for allocation phase,
 * IDLE         - contract started
 * SCHEDULED    - price quotes scheduled
 * ACTIVE       - lp tokens locked in stopLoss seat
 * REMOVING     - liquidity being removed from the amm pool to the stopLoss seat
 * REMOVED      - liquidity has been removed from the amm pool to the stopLoss seat
 * WITHDRAWN    - liquidity has benn withdrawn from the stopLoss seat by the user
 * ERROR        - error catched in a process
 */
export const ALLOCATION_PHASE = ({
  IDLE: 'idle',
  SCHEDULED: 'scheduled',
  ACTIVE: 'active',
  REMOVING: 'removing',
  REMOVED: 'removed',
  WITHDRAWN: 'withdrawn',
  ERROR: 'error,'
});
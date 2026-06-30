// Backward-compatible re-exports — prefer resources.ts for new code.
export {
  isValidResourceLabel as isValidWheelLabel,
  loadResourceIds as loadWheelIds,
  maxConcurrentBookingsForResource,
  newResourceId as newWheelId,
  resourceHasBookings,
  resourceLabelForId as wheelLabelForId,
  sanitizeResourceLabel as sanitizeWheelLabel,
} from "./resources.ts";

export const MAX_WHEELS = 20;

import { MAX_SURFACES } from '../domain/domain-brief.ts';

// Fits a desktop/mobile pair for every canonical surface; additional named-state views
// share this finite capture budget rather than multiplying it without a state bound.
export const MAX_INSPECTION_VIEWS = MAX_SURFACES * 2;

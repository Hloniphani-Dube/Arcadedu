// Tunable constants for the Study Agent's deterministic layer.
//
// These are MVP assumptions, deliberately kept in one place — the spec calls out
// alpha, the flat threshold and expected_gain_per_session as calibration
// experiments, not permanent values.

/** EWMA weight on the newest observation when updating a topic's mastery. */
export const MASTERY_ALPHA = 0.4

/** A wrong answer still carries partial signal: q_obs = quality * this. */
export const WRONG_ANSWER_QUALITY_FACTOR = 0.4

/** A session is "flat" if mastery moved less than this and is still below target. */
export const FLAT_DELTA = 0.03

/** Default per-topic mastery goal. */
export const TARGET_MASTERY_DEFAULT = 0.75

/** Assumed mastery gain from one well-run practice session (confidence math). */
export const EXPECTED_GAIN_PER_SESSION = 0.08

/** Diagnostic asks this many questions per topic. */
export const DIAGNOSTIC_ITEMS_PER_TOPIC = 2

/** A normal mission practice session is this many items. */
export const SESSION_ITEM_COUNT = 4

/** Consecutive flat sessions required before the agent may escalate strategy. */
export const FLAT_SESSIONS_FOR_ESCALATION = 2

/** Plan-confidence band thresholds on `ratio = available / required`. */
export const CONFIDENCE_ON_TRACK_RATIO = 1.15
export const CONFIDENCE_AT_RISK_RATIO = 0.9

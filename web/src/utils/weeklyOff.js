const WEEK_DAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const OCCURRENCE_KEYS = ['first', 'second', 'third', 'fourth', 'fifth'];

function emptyRule() {
  return { all: false, first: false, second: false, third: false, fourth: false, fifth: false };
}

/** Normalizes API/orgSetup weeklyOff structure; handles legacy string values too. */
export function normalizeWeeklyOffPolicy(raw) {
  const out = {
    name: '',
    days: {
      sunday: emptyRule(),
      monday: emptyRule(),
      tuesday: emptyRule(),
      wednesday: emptyRule(),
      thursday: emptyRule(),
      friday: emptyRule(),
      saturday: emptyRule(),
    },
  };

  if (!raw) return out;

  // Legacy format: "Sunday" string.
  if (typeof raw === 'string') {
    const key = raw.trim().toLowerCase();
    if (WEEK_DAY_KEYS.includes(key)) {
      out.name = 'Weekly Off';
      out.days[key].all = true;
    }
    return out;
  }

  if (typeof raw !== 'object') return out;

  out.name = String(raw.name || '').trim();
  const srcDays = raw.days && typeof raw.days === 'object' ? raw.days : {};
  WEEK_DAY_KEYS.forEach((k) => {
    const d = srcDays[k] && typeof srcDays[k] === 'object' ? srcDays[k] : {};
    out.days[k] = {
      all: Boolean(d.all),
      first: Boolean(d.first),
      second: Boolean(d.second),
      third: Boolean(d.third),
      fourth: Boolean(d.fourth),
      fifth: Boolean(d.fifth),
    };
  });
  return out;
}

/** True when any weekly-off rule is configured. */
export function hasWeeklyOffRules(policy) {
  const p = normalizeWeeklyOffPolicy(policy);
  return WEEK_DAY_KEYS.some((k) => {
    const d = p.days[k];
    return d.all || d.first || d.second || d.third || d.fourth || d.fifth;
  });
}

/** @param {import('dayjs').Dayjs} date */
export function isWeeklyOffDate(date, policy) {
  const p = normalizeWeeklyOffPolicy(policy);
  const dayKey = WEEK_DAY_KEYS[date.day()];
  const rule = p.days[dayKey] || emptyRule();
  if (rule.all) return true;
  const occurrence = Math.floor((date.date() - 1) / 7); // 0..4
  const occKey = OCCURRENCE_KEYS[occurrence];
  return occKey ? Boolean(rule[occKey]) : false;
}


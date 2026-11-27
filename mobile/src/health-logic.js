// VYRA / HealthKit normalization. All timestamps are interpreted in the device time zone.
// Data is stored on-device; this module has no network access.
export function dateKey(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(d.getTime())) return null;
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
}

export function firstDay(days = 14, now = new Date()) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - Math.max(1, days));
  return d;
}

export function normalizeDailySum(samples, maxValue = 100000) {
  const data = Object.create(null);
  for (const sample of samples || []) {
    const key = dateKey(sample.startDate);
    const val = Number(sample.value);
    if (!key || !Number.isFinite(val) || val < 0) continue;
    data[key] = Math.round(Math.min(maxValue, (data[key] || 0) + val));
  }
  return data;
}

const sleeping = new Set(["asleep", "deep", "rem", "light", "core", "asleepCore", "asleepDeep", "asleepREM", "asleepUnspecified"]);
function sleepDay(endValue) {
  const end = new Date(endValue);
  if (!Number.isFinite(end.getTime())) return null;
  // Evening sleep belongs to the following morning. Afternoon naps to today.
  if (end.getHours() >= 18) end.setDate(end.getDate() + 1);
  return dateKey(end);
}
function intervalsFrom(sample) {
  if (Array.isArray(sample.stages) && sample.stages.length) {
    return sample.stages.filter(s => sleeping.has(s.stage)).map(s => [Date.parse(s.startDate), Date.parse(s.endDate)]);
  }
  return sleeping.has(sample.sleepState) ? [[Date.parse(sample.startDate), Date.parse(sample.endDate)]] : [];
}

export function normalizeSleep(samples) {
  const byDay = Object.create(null);
  for (const sample of samples || []) {
    const intervals = intervalsFrom(sample);
    for (const [start, end] of intervals) {
      const key = sleepDay(new Date(end));
      if (!key || !Number.isFinite(start) || !Number.isFinite(end) || start >= end) continue;
      (byDay[key] ||= []).push([start, end]);
    }
  }
  const totals = Object.create(null);
  for (const [day, intervals] of Object.entries(byDay)) {
    intervals.sort((a, b) => a[0] - b[0]);
    let start = null, end = null, total = 0;
    for (const [a, b] of intervals) {
      if (start === null) { start = a; end = b; continue; }
      if (a > end) { total += end - start; start = a; end = b; }
      else end = Math.max(end, b);
    }
    if (start !== null) total += end - start;
    if (total > 0) totals[day] = Math.round(Math.min(24, total / 3600000) * 100) / 100;
  }
  return totals;
}

export function normalizeWorkouts(workouts) {
  const data = Object.create(null), seen = new Set();
  for (const workout of workouts || []) {
    const day = dateKey(workout.endDate || workout.startDate);
    if (!day) continue;
    const key = workout.platformId || [workout.startDate, workout.endDate, workout.workoutType].join(":");
    if (seen.has(key)) continue;
    seen.add(key);
    data[day] = (data[day] || 0) + 1;
  }
  return data;
}

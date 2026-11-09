(function (root) {
  'use strict';
  const defaults = { salaryType: 'monthly', salary: 9600, weekdays: [1, 2, 3, 4, 5], start: '09:00', end: '18:00', lunchEnabled: true, lunchStart: '12:00', lunchEnd: '13:00', lunchPaid: false };
  const minute = value => /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? Number(value.slice(0, 2)) * 60 + Number(value.slice(3)) : NaN;
  function geometry(s) {
    const start = minute(s.start), rawEnd = minute(s.end);
    const end = rawEnd < start ? rawEnd + 1440 : rawEnd;
    let lunchStart = minute(s.lunchStart), lunchEnd = minute(s.lunchEnd);
    if (end > 1440 && lunchStart < start) lunchStart += 1440;
    if (end > 1440 && lunchEnd < start) lunchEnd += 1440;
    return { start, end, lunchStart, lunchEnd };
  }
  function validate(s) {
    if (!s || typeof s !== 'object') return '设置格式无效。';
    if (!['hourly', 'daily', 'monthly'].includes(s.salaryType)) return '请选择有效的薪资类型。';
    if (!Number.isFinite(s.salary) || s.salary <= 0 || s.salary > 1e9) return '请输入大于 0、且不超过 10 亿的薪资金额。';
    if (!Array.isArray(s.weekdays) || !s.weekdays.length || new Set(s.weekdays).size !== s.weekdays.length || s.weekdays.some(d => !Number.isInteger(d) || d < 0 || d > 6)) return '请至少选择一个每周工作日。';
    const g = geometry(s);
    if (!Number.isFinite(g.start) || !Number.isFinite(g.end) || g.end <= g.start) return '上下班时间不能相同，请设置有效的工作时段。';
    if (s.lunchEnabled && (!Number.isFinite(g.lunchStart) || !Number.isFinite(g.lunchEnd) || g.lunchEnd <= g.lunchStart || g.lunchStart < g.start || g.lunchEnd > g.end)) return '午休必须位于工作时段内，且结束时间晚于开始时间。';
    if (s.lunchEnabled && !s.lunchPaid && g.lunchEnd - g.lunchStart >= g.end - g.start) return '扣除午休后，至少需要保留一段计薪时间。';
    if (s.adjustments !== undefined) {
      if (!s.adjustments || typeof s.adjustments !== 'object' || Array.isArray(s.adjustments)) return '日期调整格式无效。';
      for (const [key, item] of Object.entries(s.adjustments)) {
        const date = new Date(key + 'T00:00:00');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || !Number.isFinite(+date) || dateKey(date) !== key) return '日期调整中包含无效日期。';
        if (!item || !['leave', 'work', 'rest'].includes(item.type)) return '请选择有效的日期安排。';
        if (item.type === 'leave' && (!['full', 'first-half', 'second-half'].includes(item.portion) || typeof item.paid !== 'boolean')) return '请设置有效的请假时长与带薪类型。';
        if (item.payRule !== undefined && !['default', 'custom'].includes(item.payRule)) return '请选择有效的日期计薪方式。';
        if (item.payRule === 'custom' && (!Number.isFinite(item.customDaily) || item.customDaily < 0 || item.customDaily > 1e9)) return '自定义当天薪资应为 0 至 10 亿之间的金额。';
      }
    }
    return '';
  }
  function midnight(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function dateKey(d) { return `${String(d.getFullYear()).padStart(4, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
  function at(d, minutes) { return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, minutes); }
  function baseShift(d, s, force = false) {
    if (!force && !s.weekdays.includes(d.getDay())) return null;
    const g = geometry(s);
    const start = +at(d, g.start), end = +at(d, g.end);
    const lunch = s.lunchEnabled ? [+at(d, g.lunchStart), +at(d, g.lunchEnd)] : null;
    const paid = lunch && !s.lunchPaid ? [[start, lunch[0]], [lunch[1], end]] : [[start, end]];
    return { start, end, lunch, paid: paid.filter(([a, b]) => b > a) };
  }
  function shift(d, s) {
    const adjustment = (s.adjustments || {})[dateKey(d)];
    if (adjustment && adjustment.type === 'rest' && adjustment.payRule !== 'custom') return null;
    const item = baseShift(d, s, adjustment && ['work', 'rest'].includes(adjustment.type));
    if (!item || !adjustment) return item;
    if (adjustment.payRule === 'custom') {
      item.customDaily = adjustment.customDaily;
      item.customSeconds = item.paid.reduce((sum, [a, b]) => sum + (b - a) / 1000, 0);
    }
    if (adjustment.type === 'rest') return { ...item, resting: true };
    if (adjustment.type !== 'leave') return item;
    let remaining = item.paid.reduce((sum, [a, b]) => sum + b - a, 0) / 2;
    let middle = item.start;
    for (const [a, b] of item.paid) {
      if (remaining <= b - a) { middle = a + remaining; break; }
      remaining -= b - a;
    }
    const from = adjustment.portion === 'second-half' ? middle : item.start;
    const to = adjustment.portion === 'first-half' ? middle : item.end;
    const paid = adjustment.paid || adjustment.payRule === 'custom' ? item.paid : item.paid.flatMap(([a, b]) => [[a, Math.min(b, from)], [Math.max(a, to), b]]).filter(([a, b]) => b > a);
    return { ...item, paid, leave: [from, to], leavePaid: adjustment.paid };
  }
  function secondsBetween(s, from, to, applyAdjustments = true) {
    if (+to <= +from) return 0;
    let seconds = 0;
    const d = midnight(from);
    d.setDate(d.getDate() - 1);
    for (; +d < +to; d.setDate(d.getDate() + 1)) {
      const item = applyAdjustments ? shift(d, s) : baseShift(d, s);
      if (item) for (const [a, b] of item.paid) seconds += Math.max(0, Math.min(b, +to) - Math.max(a, +from)) / 1000;
    }
    return seconds;
  }
  function earningsBetween(s, from, to, normalRate) {
    if (+to <= +from) return 0;
    let amount = 0;
    const d = midnight(from);
    d.setDate(d.getDate() - 1);
    for (; +d < +to; d.setDate(d.getDate() + 1)) {
      const item = shift(d, s);
      if (!item) continue;
      const rate = item.customDaily !== undefined ? item.customDaily / item.customSeconds : normalRate;
      for (const [a, b] of item.paid) amount += Math.max(0, Math.min(b, +to) - Math.max(a, +from)) / 1000 * rate;
    }
    return amount;
  }
  function calculate(s, now = new Date()) {
    const error = validate(s);
    if (error) throw new Error(error);
    const today = midnight(now), tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1), monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const g = geometry(s);
    const dailySeconds = (g.end - g.start - (s.lunchEnabled && !s.lunchPaid ? g.lunchEnd - g.lunchStart : 0)) * 60;
    // Date exceptions affect earned income, never the monthly salary denominator.
    const monthSeconds = secondsBetween(s, monthStart, monthEnd, false);
    const adjustedMonthSeconds = secondsBetween(s, monthStart, monthEnd);
    const rate = s.salaryType === 'hourly' ? s.salary / 3600 : s.salaryType === 'daily' ? s.salary / dailySeconds : s.salary / monthSeconds;
    const todayElapsed = secondsBetween(s, today, now), monthElapsed = secondsBetween(s, monthStart, now);
    const todayTotal = secondsBetween(s, today, tomorrow);
    let status = shift(today, s) ? 'before' : 'rest';
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    const shifts = [shift(yesterday, s), shift(today, s)].filter(Boolean);
    const active = shifts.find(item => +now >= item.start && +now < item.end);
    if (active) status = active.resting ? 'rest' : active.leave && +now >= active.leave[0] && +now < active.leave[1] ? 'leave' : active.lunch && +now >= active.lunch[0] && +now < active.lunch[1] ? 'lunch' : 'working';
    else if (shifts.some(item => item.end > +today && item.end <= +now)) status = 'after';
    const activeRate = active ? active.customDaily !== undefined ? active.customDaily / active.customSeconds : rate : 0;
    return { rate, daily: rate * dailySeconds, hourly: rate * 3600, monthly: rate * monthSeconds, monthExpected: earningsBetween(s, monthStart, monthEnd, rate), todayEarned: earningsBetween(s, today, now, rate), monthEarned: earningsBetween(s, monthStart, now, rate), todayTarget: earningsBetween(s, today, tomorrow, rate), dailySeconds, monthSeconds, adjustedMonthSeconds, todayElapsed, todayTotal, status, leavePaid: status === 'leave' && active.leavePaid, customPay: !!active && active.customDaily !== undefined, activeRate, growing: !!active && activeRate > 0 && active.paid.some(([a, b]) => +now >= a && +now < b) };
  }
  const api = { defaults, validate, calculate, shift, baseShift, dateKey, secondsBetween, earningsBetween, midnight };
  root.CFSCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);

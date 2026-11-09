const { test } = require('node:test');
const assert = require('node:assert/strict');
const { defaults, calculate, validate } = require('../prototype/core.js');
const base = { ...defaults, weekdays: [...defaults.weekdays], salary: 8800 };
const date = (day, hour, min = 0) => new Date(2026, 10, day, hour, min);
test('月薪按本月 21 个工作日分配；完成整月后等于输入月薪', () => {
  const r = calculate(base, date(30, 20));
  assert.equal(r.monthSeconds, 21 * 8 * 3600);
  assert.ok(Math.abs(r.monthEarned - 8800) < 1e-8);
});
test('日薪只在工作时段增长，午休暂停，下午继续', () => {
  const s = { ...base, salaryType: 'daily', salary: 400 };
  assert.equal(calculate(s, date(6, 8)).todayEarned, 0);
  assert.equal(calculate(s, date(6, 12, 30)).todayEarned, 150);
  assert.equal(calculate(s, date(6, 13)).todayEarned, 150);
  assert.equal(calculate(s, date(6, 14)).todayEarned, 200);
  assert.equal(calculate(s, date(6, 19)).todayEarned, 400);
});
test('边界状态、周末及带薪午休', () => {
  assert.equal(calculate(base, date(6, 9)).status, 'working');
  assert.equal(calculate(base, date(6, 12)).status, 'lunch');
  assert.equal(calculate(base, date(6, 18)).status, 'after');
  assert.equal(calculate(base, date(7, 10)).status, 'rest');
  assert.equal(calculate(base, date(7, 10)).todayEarned, 0);
  const r = calculate({ ...base, salaryType: 'hourly', salary: 50, lunchPaid: true }, date(6, 12, 30));
  assert.equal(r.todayEarned, 175);
  assert.equal(r.status, 'lunch');
  assert.equal(r.growing, true);
});
test('跨午夜班次按自然日期分摊，周末仍可完成前一天夜班', () => {
  const s = { ...base, salaryType: 'hourly', salary: 60, start: '22:00', end: '06:00', lunchStart: '02:00', lunchEnd: '03:00' };
  assert.equal(validate(s), '');
  const r = calculate(s, date(7, 4));
  assert.equal(r.todayEarned, 180);
  assert.equal(r.status, 'working');
  assert.equal(calculate(s, date(7, 2, 30)).status, 'lunch');
});
test('跨月夜班计入所属自然月份，月末完成时仍等于月薪', () => {
  const s = { ...base, start: '22:00', end: '06:00', lunchEnabled: false };
  const r = calculate(s, new Date(2026, 10, 30, 23, 59, 59, 999));
  assert.ok(Math.abs(r.monthEarned - s.salary) < 0.001);
});
test('无工作日、零时长、无效金额与越界午休被阻止', () => {
  for (const patch of [{ weekdays: [] }, { end: '09:00' }, { salary: 0 }, { salary: NaN }, { lunchStart: '08:00' }, { lunchStart: '12:00', lunchEnd: '12:00' }]) assert.ok(validate({ ...base, ...patch }));
});
const calendarBase = { ...base, salary: 8400 };
const withDay = (day, adjustment, patch = {}) => ({ ...calendarBase, ...patch, adjustments: { [`2026-11-${String(day).padStart(2, '0')}`]: adjustment } });
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`);
test('不带薪全天请假扣日薪，月薪分母与秒薪不被请假抬高', () => {
  const s = withDay(3, { type: 'leave', portion: 'full', paid: false });
  const r = calculate(s, date(30, 20));
  close(r.rate, calculate(calendarBase, date(30, 20)).rate);
  close(r.monthly, 8400);
  close(r.monthEarned, 8000);
  close(r.monthExpected, 8000);
  assert.equal(calculate(s, date(3, 10)).status, 'leave');
  assert.equal(calculate(s, date(3, 10)).growing, false);
});
test('前后半班各扣准确半天，跨午休时仍按有效计薪时长的一半划分', () => {
  const first = withDay(3, { type: 'leave', portion: 'first-half', paid: false });
  const second = withDay(3, { type: 'leave', portion: 'second-half', paid: false });
  close(calculate(first, date(3, 14)).todayEarned, 0);
  close(calculate(first, date(3, 16)).todayEarned, 100);
  close(calculate(second, date(3, 14)).todayEarned, 200);
  for (const s of [first, second]) {
    close(calculate(s, date(3, 19)).todayEarned, 200);
    close(calculate(s, date(30, 20)).monthEarned, 8200);
  }
});
test('带薪全天或半天假保留收入，但显示请假状态', () => {
  for (const portion of ['full', 'first-half', 'second-half']) {
    const s = withDay(3, { type: 'leave', portion, paid: true });
    close(calculate(s, date(30, 20)).monthEarned, 8400);
    close(calculate(s, date(3, 18)).todayEarned, 400);
  }
  const r = calculate(withDay(3, { type: 'leave', portion: 'full', paid: true }), date(3, 10));
  assert.equal(r.status, 'leave'); assert.equal(r.growing, true); assert.equal(r.leavePaid, true);
});
test('未来请假只改变预计收入，其他月份不受影响', () => {
  const s = withDay(20, { type: 'leave', portion: 'full', paid: false });
  close(calculate(s, date(6, 10)).monthEarned, calculate(calendarBase, date(6, 10)).monthEarned);
  close(calculate(s, date(6, 10)).monthExpected, 8000);
  const december = calculate(s, new Date(2026, 11, 15, 10));
  close(december.monthExpected, 8400);
});
test('休息日调休/加班默认增加正常日薪；工作日设置不会重复计薪', () => {
  close(calculate(withDay(7, { type: 'work' }), date(30, 20)).monthExpected, 8800);
  close(calculate(withDay(3, { type: 'work' }), date(30, 20)).monthExpected, 8400);
  assert.equal(calculate(withDay(7, { type: 'work' }), date(7, 10)).status, 'working');
});
test('B 是当天总额，不是额外加薪，并按原计划时段分摊', () => {
  const s = withDay(3, { type: 'leave', portion: 'full', paid: false, payRule: 'custom', customDaily: 650 });
  close(calculate(s, date(3, 13)).todayEarned, 650 * 3 / 8);
  close(calculate(s, date(3, 18)).todayEarned, 650);
  close(calculate(s, date(30, 20)).monthExpected, 8650);
  assert.equal(calculate(s, date(3, 10)).status, 'leave');
  assert.equal(calculate(s, date(3, 10)).growing, true);
  close(calculate(withDay(7, { type: 'work', payRule: 'custom', customDaily: 800 }), date(30, 20)).monthExpected, 9200);
});
test('自定义零薪资不增长；调休休息可按零薪资或自定义薪资计算', () => {
  const zero = withDay(3, { type: 'work', payRule: 'custom', customDaily: 0 });
  close(calculate(zero, date(3, 18)).todayEarned, 0);
  assert.equal(calculate(zero, date(3, 10)).growing, false);
  close(calculate(withDay(3, { type: 'rest' }), date(30, 20)).monthExpected, 8000);
  close(calculate(withDay(3, { type: 'rest', payRule: 'custom', customDaily: 200 }), date(30, 20)).monthExpected, 8200);
});
test('跨午夜自定义工资按实际自然日期拆分', () => {
  const s = withDay(6, { type: 'work', payRule: 'custom', customDaily: 800 }, { weekdays: [5], start: '22:00', end: '06:00', lunchEnabled: false });
  close(calculate(s, date(6, 23)).todayEarned, 100);
  close(calculate(s, date(7, 6)).todayEarned, 600);
});
test('日期和自定义金额必须有效', () => {
  for (const item of [{ type: 'unknown' }, { type: 'leave', portion: 'full' }, { type: 'work', payRule: 'custom', customDaily: -1 }, { type: 'work', payRule: 'custom', customDaily: NaN }]) assert.ok(validate(withDay(3, item)));
  assert.ok(validate({ ...calendarBase, adjustments: { '2026-02-30': { type: 'work' } } }));
});

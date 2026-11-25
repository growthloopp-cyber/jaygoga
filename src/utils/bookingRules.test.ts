import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCsvDocument,
  calculateCancellationRefund,
  calculateFareBreakdown,
  formatDurationMinutes,
  isLockActive,
  validateBerthGenderSelection,
} from './bookingRules';

test('calculateFareBreakdown applies flat coupon and 5% GST accurately', () => {
  const res = calculateFareBreakdown({
    berthFares: [900, 900],
    coupon: { discountType: 'flat', discountValue: 100, minAmount: 1000 },
    gstPercent: 5,
  });
  assert.equal(res.subtotal, 1800);
  assert.equal(res.discount, 100);
  assert.equal(res.tax, 85); // 5% of 1700
  assert.equal(res.total, 1785);
});

test('calculateFareBreakdown caps percentage coupon by maxDiscount', () => {
  const res = calculateFareBreakdown({
    berthFares: [2500],
    coupon: { discountType: 'percent', discountValue: 20, maxDiscount: 300, minAmount: 500 },
    gstPercent: 5,
  });
  assert.equal(res.subtotal, 2500);
  assert.equal(res.discount, 300);
  assert.equal(res.tax, 110); // 5% of 2200
  assert.equal(res.total, 2310);
});

test('validateBerthGenderSelection blocks male passenger adjacent to female-booked double berth', () => {
  const berths = [
    {
      berthNumber: 'L2',
      deck: 'lower',
      berthType: 'double',
      rowIndex: 0,
      colIndex: 1,
      ladiesReserved: false,
      status: 'booked',
      genderBooked: 'female',
    },
    {
      berthNumber: 'L3',
      deck: 'lower',
      berthType: 'double',
      rowIndex: 0,
      colIndex: 2,
      ladiesReserved: false,
      status: 'available',
      genderBooked: null,
    },
  ];
  const maleTry = validateBerthGenderSelection(berths[1], 'male', berths);
  assert.equal(maleTry.allowed, false);

  const femaleTry = validateBerthGenderSelection(berths[1], 'female', berths);
  assert.equal(femaleTry.allowed, true);
});

test('validateBerthGenderSelection enforces ladiesReserved berths', () => {
  const berth = {
    berthNumber: 'L4',
    deck: 'lower',
    berthType: 'single',
    rowIndex: 1,
    colIndex: 0,
    ladiesReserved: true,
    status: 'available',
  };
  assert.equal(validateBerthGenderSelection(berth, 'male', [berth]).allowed, false);
  assert.equal(validateBerthGenderSelection(berth, 'female', [berth]).allowed, true);
});

test('isLockActive checks lock expiry timestamp accurately', () => {
  const now = new Date('2026-11-24T10:00:00Z');
  assert.equal(isLockActive('2026-11-24T10:05:00Z', now), true);
  assert.equal(isLockActive('2026-11-24T09:59:59Z', now), false);
});

test('calculateCancellationRefund computes tiered refunds properly', () => {
  assert.equal(calculateCancellationRefund(1000, 30).refundAmount, 900);
  assert.equal(calculateCancellationRefund(1000, 12).refundAmount, 750);
  assert.equal(calculateCancellationRefund(1000, 3).refundAmount, 500);
  assert.equal(calculateCancellationRefund(1000, 1).refundAmount, 0);
});

test('formatDurationMinutes and buildCsvDocument format cleanly', () => {
  assert.equal(formatDurationMinutes(375), '06h 15m');
  const csv = buildCsvDocument(['PNR', 'Name'], [['JGT123', 'Patel, Aarav']]);
  assert.equal(csv, 'PNR,Name\nJGT123,"Patel, Aarav"');
});

export interface FareBreakdownInput {
  berthFares: number[];
  coupon?: {
    discountType: 'percent' | 'flat';
    discountValue: number;
    maxDiscount?: number | null;
    minAmount?: number;
  } | null;
  gstPercent?: number;
}

export interface FareBreakdownResult {
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
}

export function calculateFareBreakdown(input: FareBreakdownInput): FareBreakdownResult {
  const subtotal = Math.max(
    0,
    input.berthFares.reduce((sum, f) => sum + Math.round(f), 0)
  );

  let discount = 0;
  if (input.coupon && subtotal >= (input.coupon.minAmount ?? 0)) {
    if (input.coupon.discountType === 'percent') {
      discount = Math.round((subtotal * input.coupon.discountValue) / 100);
      if (input.coupon.maxDiscount != null && discount > input.coupon.maxDiscount) {
        discount = input.coupon.maxDiscount;
      }
    } else {
      discount = Math.round(input.coupon.discountValue);
    }
  }
  discount = Math.min(subtotal, Math.max(0, discount));

  const taxable = Math.max(0, subtotal - discount);
  const gstRate = input.gstPercent ?? 5;
  const tax = Math.round((taxable * gstRate) / 100);
  const total = taxable + tax;

  return { subtotal, discount, tax, total };
}

export interface BerthRuleCandidate {
  berthNumber: string;
  deck: string;
  berthType: string;
  rowIndex: number;
  colIndex: number;
  ladiesReserved: boolean;
  status: string;
  genderBooked?: string | null;
}

export function validateBerthGenderSelection(
  targetBerth: BerthRuleCandidate,
  passengerGender: 'male' | 'female' | 'other',
  allBerths: BerthRuleCandidate[]
): { allowed: boolean; reason?: string } {
  if (targetBerth.status !== 'available') {
    return { allowed: false, reason: `Berth ${targetBerth.berthNumber} is no longer available.` };
  }

  if (targetBerth.ladiesReserved && passengerGender !== 'female') {
    return {
      allowed: false,
      reason: `Berth ${targetBerth.berthNumber} is reserved exclusively for female passengers.`,
    };
  }

  // On double-berth columns (colIndex 1 and 2 on the same deck and row),
  // if the adjacent berth is booked by a female passenger, restrict solo male booking.
  if (targetBerth.berthType === 'double' && passengerGender === 'male') {
    const partnerCol = targetBerth.colIndex === 1 ? 2 : targetBerth.colIndex === 2 ? 1 : -1;
    if (partnerCol !== -1) {
      const partner = allBerths.find(
        (b) =>
          b.deck === targetBerth.deck &&
          b.rowIndex === targetBerth.rowIndex &&
          b.colIndex === partnerCol
      );
      if (partner && partner.status === 'booked' && partner.genderBooked === 'female') {
        return {
          allowed: false,
          reason: `Adjacent berth ${partner.berthNumber} is occupied by a female passenger. Only female passengers may book ${targetBerth.berthNumber}.`,
        };
      }
    }
  }

  return { allowed: true };
}

export function isLockActive(expiresAt: Date | string, now: Date = new Date()): boolean {
  const exp = typeof expiresAt === 'string' ? new Date(expiresAt) : expiresAt;
  return exp.getTime() > now.getTime();
}

export function calculateCancellationRefund(
  totalAmount: number,
  hoursBeforeDeparture: number
): { refundAmount: number; feeAmount: number; policyTier: string } {
  if (totalAmount <= 0) {
    return { refundAmount: 0, feeAmount: 0, policyTier: 'No charge' };
  }
  if (hoursBeforeDeparture >= 24) {
    const fee = Math.round(totalAmount * 0.1);
    return {
      refundAmount: totalAmount - fee,
      feeAmount: fee,
      policyTier: '24+ hours prior (90% refund)',
    };
  }
  if (hoursBeforeDeparture >= 6) {
    const fee = Math.round(totalAmount * 0.25);
    return {
      refundAmount: totalAmount - fee,
      feeAmount: fee,
      policyTier: '6–24 hours prior (75% refund)',
    };
  }
  if (hoursBeforeDeparture >= 2) {
    const fee = Math.round(totalAmount * 0.5);
    return {
      refundAmount: totalAmount - fee,
      feeAmount: fee,
      policyTier: '2–6 hours prior (50% refund)',
    };
  }
  return {
    refundAmount: 0,
    feeAmount: totalAmount,
    policyTier: 'Under 2 hours prior (non-refundable)',
  };
}

export function formatDurationMinutes(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes));
  const hrs = Math.floor(safe / 60);
  const mins = safe % 60;
  return `${String(hrs).padStart(2, '0')}h ${String(mins).padStart(2, '0')}m`;
}

export function generatePnrCode(prefix = 'JGT'): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  for (let i = 0; i < 6; i++) {
    suffix += chars[Math.floor(Math.random() * chars.length)];
  }
  return `${prefix}${suffix}`;
}

export function escapeCsvCell(value: unknown): string {
  const str = String(value ?? '');
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function buildCsvDocument(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(escapeCsvCell).join(',')];
  for (const row of rows) {
    lines.push(row.map(escapeCsvCell).join(','));
  }
  return lines.join('\n');
}

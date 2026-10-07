import { describe, expect, test } from 'bun:test';

import {
  dailyPagesEngagementTierBands,
  formatDailyPagesEngagementBandRange,
} from './daily-pages-engagement-tier-bands';

/** Brian Connell 2026-10-02 reference table (totals 5–100). */
const REFERENCE_TABLE: Array<{
  total: number;
  notPresent: string;
  needsMore: string;
  good: string;
  excellent: string;
}> = [
  { total: 5, notPresent: '0–2', needsMore: '3', good: '4', excellent: '5' },
  { total: 10, notPresent: '0–6', needsMore: '7', good: '8', excellent: '10' },
  { total: 15, notPresent: '0–10', needsMore: '11', good: '12–13', excellent: '15' },
  { total: 20, notPresent: '0–13', needsMore: '14–15', good: '16–17', excellent: '20' },
  { total: 25, notPresent: '0–17', needsMore: '18–19', good: '20–22', excellent: '25' },
  { total: 30, notPresent: '0–20', needsMore: '21–23', good: '24–26', excellent: '30' },
  { total: 35, notPresent: '0–24', needsMore: '25–27', good: '28–31', excellent: '35' },
  { total: 40, notPresent: '0–27', needsMore: '28–31', good: '32–35', excellent: '40' },
  { total: 45, notPresent: '0–31', needsMore: '32–35', good: '36–40', excellent: '45' },
  { total: 50, notPresent: '0–34', needsMore: '35–39', good: '40–44', excellent: '50' },
  { total: 55, notPresent: '0–38', needsMore: '39–43', good: '44–49', excellent: '55' },
  { total: 60, notPresent: '0–41', needsMore: '42–47', good: '48–53', excellent: '60' },
  { total: 65, notPresent: '0–45', needsMore: '46–51', good: '52–58', excellent: '65' },
  { total: 70, notPresent: '0–48', needsMore: '49–55', good: '56–62', excellent: '70' },
  { total: 75, notPresent: '0–52', needsMore: '53–59', good: '60–67', excellent: '75' },
  { total: 80, notPresent: '0–55', needsMore: '56–63', good: '64–71', excellent: '80' },
  { total: 85, notPresent: '0–59', needsMore: '60–67', good: '68–76', excellent: '85' },
  { total: 90, notPresent: '0–62', needsMore: '63–71', good: '72–80', excellent: '90' },
  { total: 95, notPresent: '0–66', needsMore: '67–75', good: '76–85', excellent: '95' },
  { total: 100, notPresent: '0–69', needsMore: '70–79', good: '80–89', excellent: '100' },
];

describe('dailyPagesEngagementTierBands', () => {
  test('matches every row of Brian’s reference table', () => {
    for (const row of REFERENCE_TABLE) {
      const bands = dailyPagesEngagementTierBands(row.total);
      expect(formatDailyPagesEngagementBandRange(bands[0])).toBe(row.notPresent);
      expect(formatDailyPagesEngagementBandRange(bands[1])).toBe(row.needsMore);
      expect(formatDailyPagesEngagementBandRange(bands[2])).toBe(row.good);
      expect(formatDailyPagesEngagementBandRange(bands[3])).toBe(row.excellent);
    }
  });

  test('rejects totals below 5', () => {
    expect(() => dailyPagesEngagementTierBands(4)).toThrow(/≥ 5/);
  });

  test('implements arbitrary totals (e.g. 12 and 37)', () => {
    const twelve = dailyPagesEngagementTierBands(12);
    expect(twelve.map((b) => [b.min, b.max])).toEqual([
      [0, 7],
      [8, 9],
      [10, 10],
      [12, 12],
    ]);

    const thirtySeven = dailyPagesEngagementTierBands(37);
    expect(formatDailyPagesEngagementBandRange(thirtySeven[0])).toBe('0–25');
    expect(formatDailyPagesEngagementBandRange(thirtySeven[1])).toBe('26–29');
    expect(formatDailyPagesEngagementBandRange(thirtySeven[2])).toBe('30–32');
    expect(formatDailyPagesEngagementBandRange(thirtySeven[3])).toBe('37');
  });

  test('matches Brian’s 45- and 85-point rows (integer halves-up)', () => {
    const fortyFive = dailyPagesEngagementTierBands(45);
    expect(formatDailyPagesEngagementBandRange(fortyFive[0])).toBe('0–31');
    expect(formatDailyPagesEngagementBandRange(fortyFive[1])).toBe('32–35');
    expect(formatDailyPagesEngagementBandRange(fortyFive[2])).toBe('36–40');
    expect(formatDailyPagesEngagementBandRange(fortyFive[3])).toBe('45');

    const eightyFive = dailyPagesEngagementTierBands(85);
    expect(formatDailyPagesEngagementBandRange(eightyFive[0])).toBe('0–59');
    expect(formatDailyPagesEngagementBandRange(eightyFive[1])).toBe('60–67');
    expect(formatDailyPagesEngagementBandRange(eightyFive[2])).toBe('68–76');
    expect(formatDailyPagesEngagementBandRange(eightyFive[3])).toBe('85');
  });

  test('never places 90–99 on a 100-point scale (gap above Good)', () => {
    const good = dailyPagesEngagementTierBands(100)[2];
    expect(good.max).toBe(89);
    expect(good.min).toBe(80);
  });
});

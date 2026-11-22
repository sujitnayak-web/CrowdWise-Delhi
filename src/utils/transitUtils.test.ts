import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractForwardNudge,
  formatHour,
  getCrowdingLevel,
  normalizeConfidence,
  normalizeLoadPct,
  normalizePredictionSource,
} from './transitUtils';

test('getCrowdingLevel maps load thresholds cleanly', () => {
  assert.equal(getCrowdingLevel(32), 'seats');
  assert.equal(getCrowdingLevel(51), 'seats');
  assert.equal(getCrowdingLevel(52), 'standing');
  assert.equal(getCrowdingLevel(77), 'standing');
  assert.equal(getCrowdingLevel(78), 'crowded');
});

test('normalizeLoadPct converts ratios and integer percentages accurately', () => {
  assert.equal(normalizeLoadPct(undefined, 0.74), 74);
  assert.equal(normalizeLoadPct(0.58), 58);
  assert.equal(normalizeLoadPct(84), 84);
});

test('normalizeConfidence and normalizePredictionSource normalize backend values', () => {
  assert.equal(normalizeConfidence('high'), 'High');
  assert.equal(normalizeConfidence('medium'), 'Medium');
  assert.equal(normalizeConfidence('low'), 'Low');
  assert.equal(normalizePredictionSource('ml_fallback'), 'ml_fallback');
  assert.equal(normalizePredictionSource('observed_tickets'), 'observed_tickets');
  assert.equal(normalizePredictionSource('route_average'), 'route_average');
});

test('extractForwardNudge rejects past times and formats forward nudges cleanly', () => {
  assert.equal(formatHour(8), '08:00');

  // Past time (07:00 when departing at 08:00) must be filtered out
  const past = extractForwardNudge({ calmer_suggestion: 'Seats open at 07:00' }, '08:00');
  assert.equal(past.text, null);
  assert.equal(past.time, null);

  // Forward object nudge (08:20 when departing at 08:00)
  const forwardObj = extractForwardNudge(
    {
      departure_nudge: {
        time: '08:20',
        shift_minutes: 20,
        crowding: 'standing',
      },
    },
    '08:00'
  );
  assert.equal(forwardObj.time, '08:20');
  assert.equal(forwardObj.text, 'Leave 20 min later (08:20) · Standing room');

  // Forward string nudge
  const forwardStr = extractForwardNudge(
    { departure_nudge: 'Leave 20 min later (08:20) · Standing room' },
    '08:00'
  );
  assert.equal(forwardStr.time, '08:20');
  assert.equal(forwardStr.text, 'Leave 20 min later (08:20) · Standing room');

  // Render backend departure_shifts array (rejects -90 min past shift, picks +120 min future shift)
  const backendShifts = extractForwardNudge(
    {
      departure_shifts: [
        { shift_minutes: -90, departure_time: '06:30', improves_crowding: true, new_crowd_level: 'seats_available' },
        { shift_minutes: 120, departure_time: '10:00', improves_crowding: true, new_crowd_level: 'seats_available' },
      ],
    },
    '08:00'
  );
  assert.equal(backendShifts.time, '10:00');
  assert.equal(backendShifts.text, 'Leave 2 hr later (10:00) · Seats available');
});

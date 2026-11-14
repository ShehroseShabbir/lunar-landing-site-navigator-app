// Tour steps (prep/tour-copy.md section 2.2). The numbers are fixed text measured with siteMetrics;
// tour.test.ts re-measures them so a maths change fails the test instead of making the tour wrong.

export interface TourStep {
  siteId: string;
  /** rangeStart (the 30-day window start), ISO UTC. */
  startIso: string;
  /** Playhead, ISO UTC. */
  tIso: string;
  title: string;
  body: string;
  /** data-tour values to highlight; the first one found in the page is used. */
  targets: string[];
}

export const TOUR_START_ISO = '2027-03-14T00:00:00Z';

export const TOUR_STEPS: readonly TourStep[] = [
  {
    siteId: 'apollo11',
    startIso: TOUR_START_ISO,
    tIso: '2027-03-17T00:00:00Z',
    title: 'Apollo 11: the Sun climbs high',
    body: "Apollo 11 is near the Moon's equator. On 17 Mar 2027 at 00:00 UTC the Sun is 43.1° above the horizon. Over the 30 days from 14 Mar, Power OK is 51%, with one dark period of 14 d 16 h.",
    targets: ['sky-sun', 'sky'],
  },
  {
    siteId: 'connecting_ridge',
    startIso: TOUR_START_ISO,
    tIso: '2027-03-14T00:00:00Z',
    title: 'A polar ridge: the Sun stays low',
    body: 'At Connecting Ridge, near the south pole, the Sun stays low. On 14 Mar 2027 at 00:00 UTC it is 0.2° above the terrain, with 90% of its disk showing. Its 30-day path runs along the skyline.',
    targets: ['sky-sun', 'sky'],
  },
  {
    siteId: 'connecting_ridge',
    startIso: TOUR_START_ISO,
    tIso: '2027-03-14T00:00:00Z',
    title: 'What this means for power and comms',
    body: 'Over these 30 days this ridge has Power OK 66%, Comms OK 55% and Both OK 32%. Its longest dark period is 3 d 4 h. Apollo 11 had Comms OK 100%, but Power OK only 51%.',
    targets: ['metrics-window', 'metrics'],
  },
];

export const TOUR_DONE_MESSAGE = 'Tour finished. You are viewing Connecting Ridge.';

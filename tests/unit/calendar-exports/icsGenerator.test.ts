import { icsGenerator } from '../../../src/app/calendar-exports/utils/icsGenerator';
import { CalendarEvent } from '../../../../src/lib/models';

describe('icsGenerator', () => {
  it('should generate a valid ICS file', async () => {
    const user = { isAdmin: true };
    const events: CalendarEvent[] = [
      { id: '1', start: '20260630T090000', end: '20260630T100000', title: 'Meeting', privacy: 'PUBLIC' },
    ];
    jest.spyOn(global, 'getEventsForUser').mockResolvedValue(events);
    const icsFile = await icsGenerator(user);
    expect(icsFile).toContain('BEGIN:VCALENDAR');
    expect(icsFile).toContain('END:VCALENDAR');
  });
});
import { describe, expect, it } from 'vitest';
import { getNotificationMessages, renderNotificationMessage } from '../src/i18n/index.js';
import { isNotificationMessageKey } from '../src/i18n/messages.js';

// Unit tests for the server-side message catalog: the same templates the
// locale endpoint serves to the frontend and that email/push delivery
// renders with renderNotificationMessage.

describe('i18n message catalog', () => {
  it('serves the same message keys in every supported language', () => {
    const en = Object.keys(getNotificationMessages('en-GB')).sort();
    for (const lng of ['en-US', 'fi'] as const) {
      expect(Object.keys(getNotificationMessages(lng)).sort()).toEqual(en);
    }
    expect(en.length).toBeGreaterThan(0);
  });

  it('renders a message with interpolated params in the requested language', () => {
    const rendered = renderNotificationMessage(
      'workRoleAssigned',
      { role: 'Room setup', eventTitle: 'Weekly Community Meeting' },
      'fi',
    );
    expect(rendered.title).toBe('Sinut on määrätty työrooliin');
    expect(rendered.body).toBe(
      'Sinut on määrätty rooliin "Room setup" tapahtumaan Weekly Community Meeting.',
    );
  });

  it('renders in English (UK) by default', () => {
    const rendered = renderNotificationMessage('upcomingEvent', { eventTitle: 'Potluck' }, 'en-GB');
    expect(rendered.body).toBe('Potluck is happening this month. Check the calendar for details.');
  });

  it('falls back to the default language for an unsupported language', () => {
    const rendered = renderNotificationMessage('welcome', {}, 'de');
    expect(rendered.title).toBe('Welcome to Watodo');
  });

  it('leaves unknown placeholders untouched', () => {
    const rendered = renderNotificationMessage('upcomingEvent', {}, 'en-GB');
    expect(rendered.body).toContain('{{eventTitle}}');
  });

  it('throws for an unknown message key', () => {
    expect(isNotificationMessageKey('nope')).toBe(false);
    expect(() => renderNotificationMessage('nope', {}, 'en-GB')).toThrow(
      'Unknown notification message key',
    );
  });
});

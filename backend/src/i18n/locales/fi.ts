import type { LocaleBundle } from '../types.js';

// Finnish notification message templates (canonical server-side source, see
// en-GB.ts).
const fi: LocaleBundle = {
  notifications: {
    welcome: {
      title: 'Tervetuloa Watodoon',
      body: 'Organisaatiosi on nyt perustettu. Tutki kalenteria ja kutsu tiimisi mukaan.',
    },
    upcomingEvent: {
      title: 'Tuleva tapahtuma',
      body: '{{eventTitle}} järjestetään tässä kuussa. Katso lisätiedot kalenterista.',
    },
    workRoleAssigned: {
      title: 'Sinut on määrätty työrooliin',
      body: 'Sinut on määrätty rooliin "{{role}}" tapahtumaan {{eventTitle}}.',
    },
    workRoleUnassigned: {
      title: 'Työroolimääritys poistettu',
      body: 'Sinua ei enää ole määrätty rooliin "{{role}}" tapahtumassa {{eventTitle}}.',
    },
    newEventComment: {
      title: 'Uusi tapahtumakommentti',
      body: 'Joku kommentoi tapahtumaa {{eventTitle}}.',
    },
    roleAssigned: {
      title: 'Rooli määrätty',
      body: 'Sinulle on määrätty rooli {{roleName}}.',
    },
    eventCancelled: {
      title: 'Tapahtuma peruttu',
      body: '{{eventTitle}} ({{start}}) on peruttu.',
    },
    eventRescheduled: {
      title: 'Tapahtuma siirretty',
      body: '{{eventTitle}} ({{start}}) on siirretty aikaan {{newStart}} - {{newEnd}}.',
    },
    unfilledCriticalSlot: {
      title: 'Kriittinen rooli täyttämättä',
      body: 'Kriittinen rooli/roolit ovat edelleen täyttämättä tapahtumassa {{eventTitle}} ({{start}}): {{roles}}.',
    },
    assignmentRemovedDueToAbsence: {
      title: 'Määritys poistettu poissaolon vuoksi',
      body: '{{userName}} poistettiin tapahtumasta "{{eventTitle}}" ({{start}}) poissaolon vuoksi ({{absenceType}}, {{absenceStart}} - {{absenceEnd}}).',
    },
  },
};

export default fi;

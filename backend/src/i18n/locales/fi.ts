import type { LocaleBundle } from '../types.js';

// Finnish notification message templates (canonical server-side source, see
// en-GB.ts).
const fi: LocaleBundle = {
  notifications: {
    welcome: {
      title: 'Tervetuloa Watodoon',
      body: 'Organisaatiosi on nyt perustettu. Tutki kalenteria ja kutsu tiimisi mukaan.',
    },
    organizationCreated: {
      title: 'Uusi organisaatio valmis',
      body: '{{organizationName}} on luotu. Ala lisätä tapahtumia.',
    },
    upcomingEvent: {
      title: 'Tuleva tapahtuma',
      body: '{{eventTitle}} järjestetään tässä kuussa. Katso lisätiedot kalenterista.',
    },
    workRoleAssigned: {
      title: 'Sinut on määrätty työrooliin',
      body: 'Sinut on määrätty rooliin "{{role}}" tapahtumaan {{eventTitle}}.',
    },
    newEventComment: {
      title: 'Uusi tapahtumakommentti',
      body: 'Joku kommentoi tapahtumaa {{eventTitle}}.',
    },
    roleAssigned: {
      title: 'Rooli määrätty',
      body: 'Sinulle on määrätty rooli {{roleName}}.',
    },
    assignmentRemovedDueToAbsence: {
      title: 'Määritys poistettu poissaolon vuoksi',
      body: '{{userName}} poistettiin tapahtumasta "{{eventTitle}}" ({{start}}) poissaolon vuoksi ({{absenceType}}, {{absenceStart}} - {{absenceEnd}}).',
    },
  },
};

export default fi;

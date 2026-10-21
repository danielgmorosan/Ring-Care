/*
 * Obrigada web demo: a stand-in for the backend, in the browser.
 *
 * The family app is built with EXPO_PUBLIC_API_URL=https://demo.obrigada.invalid. This
 * script replaces window.fetch for that origin and answers from window.__OBRIGADA_FIXTURES__
 * (fixtures.js, generated from fixtures.json). Responses were recorded from the real backend;
 * the two incidents are sample data (see fixtures.json __meta).
 *
 * Mutations change an in-memory copy, kept in sessionStorage so a reload keeps what you did.
 * Nothing leaves the browser. Must load BEFORE the app bundle.
 */
(function () {
  'use strict';

  var API = 'https://demo.obrigada.invalid';
  var TZ = 'Europe/Lisbon';
  var RECORDED_DAY = '2026-10-20';
  var STATE_KEY = 'obrigada.demo.state.v1';
  var RING_LIVE_MESSAGE = 'Live view needs a Ring account. This demo has none.';
  var GUARDIAN_LIVE_MESSAGE = 'Live view needs a guardian phone online. This demo has none.';

  var RAW = window.__OBRIGADA_FIXTURES__;
  if (!RAW) {
    console.error('[demo] fixtures.js did not load; the demo has no data.');
    return;
  }
  var realFetch = window.fetch ? window.fetch.bind(window) : null;

  /* ---------- Household clock ---------- */

  var DAY_MS = 86400000;
  var dtf = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  function parts(ms) {
    var out = {};
    dtf.formatToParts(new Date(ms)).forEach(function (p) {
      out[p.type] = p.value;
    });
    return out;
  }
  /** Minutes the household clock is ahead of UTC at this instant. */
  function offsetMin(ms) {
    var p = parts(ms);
    var asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
    return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60000);
  }
  function localDay(ms) {
    var p = parts(ms);
    return p.year + '-' + p.month + '-' + p.day;
  }
  function dayToUtc(day) {
    var s = day.split('-');
    return Date.UTC(+s[0], +s[1] - 1, +s[2]);
  }
  function utcToDay(ms) {
    return new Date(ms).toISOString().slice(0, 10);
  }

  // Replay the recorded day as today, so "3:04 this morning" reads as this morning. Before
  // 04:00 the recorded night has not happened yet, so the replay is anchored on yesterday.
  var nowMs = Date.now();
  var todayDay = localDay(nowMs);
  if (+parts(nowMs).hour < 4) todayDay = utcToDay(dayToUtc(todayDay) - DAY_MS);
  var SHIFT_DAYS = Math.round((dayToUtc(todayDay) - dayToUtc(RECORDED_DAY)) / DAY_MS);

  // The Bee note said "from Monday": keep that the Monday after the replayed day.
  var recordedDow = new Date(dayToUtc(RECORDED_DAY)).getUTCDay();
  var todayDow = new Date(dayToUtc(todayDay)).getUTCDay();
  var nextMondayRecorded = utcToDay(dayToUtc(RECORDED_DAY) + (((8 - recordedDow) % 7) || 7) * DAY_MS);
  var nextMondayToday = utcToDay(dayToUtc(todayDay) + (((8 - todayDow) % 7) || 7) * DAY_MS);

  function mapDay(day) {
    if (day === nextMondayRecorded) return nextMondayToday;
    return utcToDay(dayToUtc(day) + SHIFT_DAYS * DAY_MS);
  }
  /** Same household wall-clock time, SHIFT_DAYS later (holds across a DST change). */
  function mapInstant(iso) {
    var ms = Date.parse(iso);
    if (isNaN(ms)) return iso;
    var day = localDay(ms);
    var target = mapDay(day);
    var deltaDays = Math.round((dayToUtc(target) - dayToUtc(day)) / DAY_MS);
    var shifted = ms + deltaDays * DAY_MS;
    shifted += (offsetMin(ms) - offsetMin(shifted)) * 60000;
    return new Date(shifted).toISOString();
  }

  var WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  var PHRASE = new RegExp(
    '\\b(?:' + WEEKDAYS.join('|') + ') (\\d{1,2}) (' + MONTHS.join('|') + ')\\b',
    'g',
  );
  function phraseFor(day) {
    var d = new Date(dayToUtc(day));
    return WEEKDAYS[d.getUTCDay()] + ' ' + d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()];
  }
  function mapPhrases(text) {
    return text.replace(PHRASE, function (whole, dayNum, month) {
      var m = MONTHS.indexOf(month);
      var year = m < 6 ? 2027 : 2026; // the recording was in October 2026
      var day = utcToDay(Date.UTC(year, m, +dayNum));
      return phraseFor(mapDay(day));
    });
  }

  var ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
  var ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
  function shiftAll(value) {
    if (typeof value === 'string') {
      if (ISO_INSTANT.test(value)) return mapInstant(value);
      if (ISO_DAY.test(value)) return mapDay(value);
      return mapPhrases(value);
    }
    if (Array.isArray(value)) return value.map(shiftAll);
    if (value && typeof value === 'object') {
      var out = {};
      Object.keys(value).forEach(function (k) {
        out[k] = shiftAll(value[k]);
      });
      return out;
    }
    return value;
  }

  var F = shiftAll(RAW);
  function clone(v) {
    return v === undefined ? undefined : JSON.parse(JSON.stringify(v));
  }

  /* ---------- State ---------- */

  function freshState() {
    var doses = {};
    Object.keys(F).forEach(function (k) {
      var m = /^GET \/me\/medications\/([^/]+)\/doses$/.exec(k);
      if (m) doses[m[1]] = clone(F[k]);
    });
    var details = {};
    Object.keys(F).forEach(function (k) {
      var m = /^GET \/me\/incidents\/([^/?]+)$/.exec(k);
      if (m) details[m[1]] = clone(F[k]);
    });
    return {
      day: todayDay,
      session: clone(F['GET /auth/me']),
      login: clone(F['POST /auth/login']),
      family: clone(F['GET /me/family']),
      devices: clone(F['GET /me/devices']),
      fleet: clone(F['GET /me/fleet']),
      zones: clone(F['GET /me/zones']),
      summary: clone(F['GET /me/summary/today']),
      incidents: clone(F['GET /me/incidents']),
      details: details,
      contacts: clone(F['GET /me/contacts']),
      medications: clone(F['GET /me/medications']),
      doses: doses,
      appointments: clone(F['GET /me/appointments']),
      activity: clone(F['GET /me/activity']),
      alerts: clone(F['GET /me/alerts']),
      people: clone(F['GET /me/people']),
      sightings: clone(F['GET /me/sightings']),
      visits: clone(F['GET /me/visits']),
      arrivals: clone(F['GET /me/visits/arrivals']),
      ringStatus: clone(F['GET /me/ring/status']),
      ringCameras: clone(F['GET /me/ring/cameras']),
      ringActivity: clone(F['GET /me/ring/activity?limit=50']),
      proposals: {
        pending: clone(F['GET /me/care/proposals?status=pending']),
        approved: clone(F['GET /me/care/proposals?status=approved']),
        rejected: clone(F['GET /me/care/proposals?status=rejected']),
      },
    };
  }

  var S = null;
  try {
    var saved = JSON.parse(sessionStorage.getItem(STATE_KEY) || 'null');
    if (saved && saved.day === todayDay) S = saved;
  } catch (e) {
    /* storage blocked: start fresh */
  }
  if (!S) S = freshState();
  function save() {
    try {
      sessionStorage.setItem(STATE_KEY, JSON.stringify(S));
    } catch (e) {
      /* fine: the demo works without it */
    }
  }

  // Skip first-run setup for the demo family, unless ?onboarding=1 asks to see it.
  try {
    var key = 'obrigada.onboarded.' + S.session.family.id;
    if (/[?&]onboarding=1\b/.test(location.search)) localStorage.removeItem(key);
    else localStorage.setItem(key, '1');
  } catch (e) {
    /* storage blocked: onboarding will show, which also works */
  }

  /* ---------- Helpers ---------- */

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'demo-' + Math.random().toString(16).slice(2) + Date.now().toString(16);
  }
  function nowIso() {
    return new Date().toISOString();
  }
  function log(label) {
    S.activity.unshift({ id: uuid(), at: nowIso(), label: label });
  }
  function byId(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function removeId(list, id) {
    var i = list.findIndex(function (x) {
      return x.id === id;
    });
    if (i >= 0) list.splice(i, 1);
    return i >= 0;
  }
  function pick(body, keys) {
    var out = {};
    keys.forEach(function (k) {
      if (body && body[k] !== undefined) out[k] = body[k];
    });
    return out;
  }
  function clock(iso) {
    var p = parts(Date.parse(iso));
    return +p.hour + ':' + p.minute;
  }
  function longDay(day) {
    var d = new Date(dayToUtc(day));
    return d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()];
  }

  function outcomeOf(steps) {
    var kinds = steps.map(function (s) {
      return s.kind;
    });
    if (kinds.indexOf('stood_down') >= 0) return 'stood_down';
    if (kinds.indexOf('call_answered') >= 0) return 'acknowledged';
    if (kinds.indexOf('emergency_notified') >= 0) return 'emergency_notified';
    if (kinds.indexOf('family_alerted') >= 0) return 'family_alerted';
    return 'active';
  }
  function appendStep(id, kind, detail) {
    var d = S.details[id];
    if (!d) return false;
    d.steps.push({
      seq: d.steps.length,
      kind: kind,
      contactName: null,
      contactRole: null,
      detail: detail || {},
      occurredAt: nowIso(),
    });
    d.outcome = outcomeOf(d.steps);
    var row = byId(S.incidents, id);
    if (row) {
      row.outcome = d.outcome;
      row.stepCount = d.steps.length;
    }
    return true;
  }

  function careToday() {
    return {
      date: todayDay,
      medications: S.medications,
      appointments: S.appointments.filter(function (a) {
        return localDay(Date.parse(a.at)) === todayDay;
      }),
    };
  }

  /* ---------- Q&A ---------- */

  function answerFor(question) {
    var q = String(question || '').toLowerCase();
    var elder = String((S.family && S.family.elderName) || '').toLowerCase();
    if ((elder && q.indexOf(elder) >= 0) || /\b(mom|mum|mother|she|her)\b/.test(q) || /\btoday\b/.test(q) || /how (was|is)/.test(q)) {
      var lines = [];
      var night = S.details[F.__nightIncidentId];
      if (night) {
        var answered = night.steps.filter(function (s) {
          return s.kind === 'call_answered';
        })[0];
        lines.push(
          'A calm day. Someone was at the front door at ' + clock(night.openedAt) + ' this morning.',
        );
        if (answered && answered.contactName)
          lines.push(answered.contactName + ' answered our call and said he was handling it.');
      } else {
        lines.push('A calm day.');
      }
      var arrival = S.arrivals[0];
      if (arrival)
        lines.push(
          arrival.visitorLabel + ' arrived for her visit at ' + clock(arrival.arrivedAt) + '.',
        );
      var donepezil = S.medications.filter(function (m) {
        return /donepezil/i.test(m.name);
      })[0];
      if (donepezil && donepezil.notes && /5 mg/.test(donepezil.notes)) {
        lines.push(
          'Her Donepezil moves to 5 mg at 20:00 from Monday ' + longDay(nextMondayToday) + '.',
        );
      } else if (S.proposals.pending.length > 0) {
        lines.push('There is a Bee note waiting in Care with a change to her Donepezil.');
      }
      var blood = S.appointments.filter(function (a) {
        return /blood test/i.test(a.title);
      })[0];
      if (blood) lines.push('A blood test is booked for ' + longDay(localDay(Date.parse(blood.at))) + '.');
      lines.push('Nothing else needed your attention.');
      return lines.join(' ');
    }
    return (
      'In this demo I can only answer from the recorded day: visits, alerts, calls and the care plan. ' +
      'Try asking "How was ' + ((S.family && S.family.elderName) || 'Mom') + ' today?"'
    );
  }

  /* ---------- Toast (visible above the app, including its modals) ---------- */

  var toastTimer = null;
  function toast(message) {
    var el = document.getElementById('demo-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'demo-toast';
      el.setAttribute('role', 'status');
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.className = 'show';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.className = '';
    }, 6500);
  }

  /* ---------- Routes ---------- */

  function json(status, body) {
    return { status: status, body: body };
  }
  function noContent() {
    return { status: 204, body: null };
  }
  function notFound(method, path) {
    return json(404, {
      statusCode: 404,
      error: 'Not Found',
      message: 'Cannot ' + method + ' ' + path,
    });
  }

  function route(method, path, query, body) {
    var m;

    // Auth. Any email and password open the recorded Ferreira household.
    if (method === 'POST' && (path === '/auth/login' || path === '/auth/signup')) {
      var res = clone(S.login);
      if (body && body.email) res.user.email = String(body.email);
      // Signing up also opens the Ferreira household: the recorded data belongs to it.
      S.session = { user: res.user, family: res.family };
      save();
      return json(path === '/auth/signup' ? 201 : 200, res);
    }
    if (method === 'GET' && path === '/auth/me') return json(200, S.session);

    if (method === 'GET') {
      switch (path) {
        case '/me/devices': return json(200, S.devices);
        case '/me/fleet': return json(200, S.fleet);
        case '/me/zones': return json(200, S.zones);
        case '/me/summary/today': return json(200, S.summary);
        case '/me/incidents': return json(200, S.incidents);
        case '/me/contacts': return json(200, S.contacts);
        case '/me/medications': return json(200, S.medications);
        case '/me/appointments': return json(200, S.appointments);
        case '/me/care/today': return json(200, careToday());
        case '/me/activity': return json(200, S.activity.slice(0, 50));
        case '/me/family': return json(200, S.family);
        case '/me/alerts': return json(200, S.alerts);
        case '/me/people': return json(200, S.people);
        case '/me/sightings': return json(200, S.sightings);
        case '/me/visits': return json(200, S.visits);
        case '/me/visits/arrivals': return json(200, S.arrivals);
        case '/me/ring/status': return json(200, Object.assign({}, S.ringStatus, { cameras: S.ringCameras }));
        case '/me/ring/cameras': return json(200, S.ringCameras);
        case '/me/ring/activity': {
          var limit = Math.max(1, Math.min(200, parseInt(query.get('limit') || '50', 10) || 50));
          return json(200, S.ringActivity.slice(0, limit));
        }
        case '/me/care/proposals': {
          var status = query.get('status') || 'pending';
          return json(200, S.proposals[status] || []);
        }
      }
      if ((m = /^\/me\/incidents\/([^/]+)$/.exec(path))) {
        var detail = S.details[m[1]];
        return detail ? json(200, detail) : json(404, { statusCode: 404, message: 'Incident not found' });
      }
      if ((m = /^\/me\/medications\/([^/]+)\/doses$/.exec(path))) return json(200, S.doses[m[1]] || []);
    }

    // Incidents (decision 0008): "I'm handling this", then "All clear".
    if (method === 'POST' && (m = /^\/incidents\/([^/]+)\/(acknowledge|resolve)$/.exec(path))) {
      var d = S.details[m[1]];
      if (!d) return json(404, { statusCode: 404, message: 'Incident not found' });
      if (d.outcome !== 'active') return json(409, { statusCode: 409, message: 'This incident has already resolved.' });
      var me = (S.session.user.email || 'You').split('@')[0];
      var name = me.charAt(0).toUpperCase() + me.slice(1);
      if (m[2] === 'acknowledge') appendStep(m[1], 'caregiver_acknowledged', { by: S.session.user.id, byName: name });
      else appendStep(m[1], 'stood_down', { reason: 'caregiver_all_clear' });
      save();
      return noContent();
    }

    // Care proposals from Bee (decision 0012).
    if (method === 'POST' && (m = /^\/me\/care\/proposals\/([^/]+)\/(approve|reject)$/.exec(path))) {
      var proposal = byId(S.proposals.pending, m[1]);
      if (!proposal) return json(404, { statusCode: 404, message: 'This proposal was already decided.' });
      removeId(S.proposals.pending, proposal.id);
      if (m[2] === 'reject') {
        proposal.status = 'rejected';
        S.proposals.rejected.unshift(proposal);
        log('Set aside care changes from a Bee note');
        save();
        return noContent();
      }
      var chosen = body && Array.isArray(body.itemIds) && body.itemIds.length > 0
        ? body.itemIds
        : proposal.items.map(function (i) { return i.id; });
      var recorded = F['POST /me/care/proposals/:id/approve'];
      var inChosen = function (id) { return chosen.indexOf(id) >= 0; };
      var result = {
        applied: recorded.applied.filter(inChosen),
        scheduled: (recorded.scheduled || []).filter(inChosen),
        todosCreated: chosen.length,
      };
      var after = F.__afterApprove || {};
      proposal.items.forEach(function (item) {
        if (!inChosen(item.id)) return;
        if (item.kind === 'medication_change' || item.kind === 'new_medication') {
          (after['GET /me/medications'] || []).forEach(function (am) {
            var cur = byId(S.medications, am.id);
            if (cur) cur.notes = am.notes;
          });
        } else if (item.kind === 'appointment') {
          (after['GET /me/appointments'] || []).forEach(function (ap) {
            if (!byId(S.appointments, ap.id)) S.appointments.push(clone(ap));
          });
        }
      });
      proposal.status = 'approved';
      S.proposals.approved.unshift(proposal);
      log('Approved care changes from a Bee note');
      save();
      return json(200, result);
    }

    // Ring (decision 0011).
    if (method === 'PATCH' && (m = /^\/me\/ring\/cameras\/([^/]+)$/.exec(path))) {
      var cam = byId(S.ringCameras, m[1]);
      if (!cam) return json(404, { statusCode: 404, message: 'Camera not found' });
      if (body && body.placement) {
        cam.placement = body.placement;
        S.ringActivity.forEach(function (a) {
          if (a.cameraId === cam.id) a.placement = body.placement;
        });
      }
      log('Updated a Ring camera');
      save();
      return json(200, cam);
    }
    if (method === 'POST' && /^\/me\/ring\/cameras\/[^/]+\/live$/.test(path)) {
      toast(RING_LIVE_MESSAGE);
      return json(503, { statusCode: 503, error: 'Service Unavailable', message: RING_LIVE_MESSAGE });
    }
    if (method === 'DELETE' && /^\/me\/ring\/cameras\/[^/]+\/live\/[^/]+$/.test(path)) return noContent();
    if (method === 'POST' && path === '/me/ring/cameras/sync') {
      toast(RING_LIVE_MESSAGE.replace('Live view', 'Syncing cameras'));
      return json(503, { statusCode: 503, message: 'Ring account is not connected' });
    }

    // Guardian live view (F2.5).
    if (method === 'POST' && /^\/me\/live\/[^/]+\/token$/.test(path)) {
      toast(GUARDIAN_LIVE_MESSAGE);
      return json(503, { statusCode: 503, error: 'Service Unavailable', message: 'Live view is not configured.' });
    }

    // Ask Obrigada (F3.3).
    if (method === 'POST' && path === '/me/ask') {
      log('Asked Obrigada a question');
      save();
      return json(201, { answer: answerFor(body && body.question) });
    }

    // Household settings.
    if (method === 'PATCH' && path === '/me/family') {
      Object.assign(
        S.family,
        pick(body, ['name', 'timezone', 'checkinLanguage', 'elderName', 'elderRelation']),
      );
      // Like the backend: a blank name clears it.
      if (typeof S.family.elderName === 'string') {
        S.family.elderName = S.family.elderName.trim() || null;
      }
      if (body && body.name) S.session.family.name = body.name;
      log('Updated household settings');
      save();
      return json(200, S.family);
    }

    // Contacts.
    if (method === 'POST' && path === '/me/contacts') {
      var contact = {
        id: uuid(),
        name: String((body && body.name) || 'New contact'),
        role: String((body && body.role) || 'family'),
        phone: (body && body.phone) || null,
        pushToken: null,
        priority: body && typeof body.priority === 'number' ? body.priority : S.contacts.length,
        quietHours: (body && body.quietHours) || null,
      };
      S.contacts.push(contact);
      S.contacts.sort(function (a, b) { return a.priority - b.priority; });
      log('Added a contact');
      save();
      return json(201, contact);
    }
    if ((m = /^\/me\/contacts\/([^/]+)$/.exec(path))) {
      var c = byId(S.contacts, m[1]);
      if (!c) return json(404, { statusCode: 404, message: 'Contact not found' });
      if (method === 'PATCH') {
        Object.assign(c, pick(body, ['name', 'role', 'phone', 'priority', 'quietHours']));
        S.contacts.sort(function (a, b) { return a.priority - b.priority; });
        log('Updated a contact');
        save();
        return json(200, c);
      }
      if (method === 'DELETE') {
        removeId(S.contacts, c.id);
        log('Removed a contact');
        save();
        return noContent();
      }
    }

    // Expected visits.
    if (method === 'POST' && path === '/me/visits') {
      var visit = {
        id: uuid(),
        familyId: S.session.family.id,
        visitorLabel: String((body && body.visitorLabel) || 'Visitor'),
        startsAt: (body && body.startsAt) || nowIso(),
        endsAt: (body && body.endsAt) || nowIso(),
        notes: (body && body.notes) || null,
        createdAt: nowIso(),
      };
      S.visits.push(visit);
      log('Logged an expected visit');
      save();
      return json(201, visit);
    }
    if (method === 'DELETE' && (m = /^\/me\/visits\/([^/]+)$/.exec(path))) {
      if (!removeId(S.visits, m[1])) return json(404, { statusCode: 404, message: 'Visit not found' });
      log('Removed an expected visit');
      save();
      return noContent();
    }

    // Medications and appointments.
    if (method === 'POST' && path === '/me/medications') {
      var med = {
        id: uuid(),
        familyId: S.session.family.id,
        name: String((body && body.name) || 'Medication'),
        dosage: (body && body.dosage) || null,
        times: (body && body.times) || [],
        notes: (body && body.notes) || null,
        createdAt: nowIso(),
      };
      S.medications.push(med);
      S.doses[med.id] = [];
      log('Added a medication');
      save();
      return json(201, med);
    }
    if ((m = /^\/me\/medications\/([^/]+)$/.exec(path))) {
      var md = byId(S.medications, m[1]);
      if (!md) return json(404, { statusCode: 404, message: 'Medication not found' });
      if (method === 'PATCH') {
        Object.assign(md, pick(body, ['name', 'dosage', 'times', 'notes']));
        log('Updated a medication');
        save();
        return json(200, md);
      }
      if (method === 'DELETE') {
        removeId(S.medications, md.id);
        log('Removed a medication');
        save();
        return noContent();
      }
    }
    if (method === 'POST' && path === '/me/appointments') {
      var appt = {
        id: uuid(),
        familyId: S.session.family.id,
        title: String((body && body.title) || 'Appointment'),
        at: (body && body.at) || nowIso(),
        location: (body && body.location) || null,
        notes: (body && body.notes) || null,
        createdAt: nowIso(),
      };
      S.appointments.push(appt);
      S.appointments.sort(function (a, b) { return Date.parse(a.at) - Date.parse(b.at); });
      log('Added an appointment');
      save();
      return json(201, appt);
    }
    if ((m = /^\/me\/appointments\/([^/]+)$/.exec(path))) {
      var ap = byId(S.appointments, m[1]);
      if (!ap) return json(404, { statusCode: 404, message: 'Appointment not found' });
      if (method === 'PATCH') {
        Object.assign(ap, pick(body, ['title', 'at', 'location', 'notes']));
        log('Updated an appointment');
        save();
        return json(200, ap);
      }
      if (method === 'DELETE') {
        removeId(S.appointments, ap.id);
        log('Removed an appointment');
        save();
        return noContent();
      }
    }

    // Household roster.
    if (method === 'POST' && path === '/me/people') {
      var person = {
        id: uuid(),
        familyId: S.session.family.id,
        title: String((body && body.title) || 'Someone'),
        role: (body && body.role) || 'family',
        notes: (body && body.notes) || null,
        active: true,
        createdAt: nowIso(),
      };
      S.people.push(person);
      log('Added someone to the household');
      save();
      return json(201, person);
    }
    if (method === 'DELETE' && (m = /^\/me\/people\/([^/]+)$/.exec(path))) {
      if (!removeId(S.people, m[1])) return json(404, { statusCode: 404, message: 'Person not found' });
      log('Removed someone from the household');
      save();
      return noContent();
    }

    // Zones.
    if ((m = /^\/me\/zones\/([^/]+)$/.exec(path))) {
      var z = byId(S.zones, m[1]);
      if (!z) return json(404, { statusCode: 404, message: 'Zone not found' });
      if (method === 'PATCH') {
        if (body && body.name) z.name = String(body.name);
        save();
        return json(200, z);
      }
      if (method === 'DELETE') {
        removeId(S.zones, z.id);
        save();
        return noContent();
      }
    }

    // Guardians.
    if (method === 'POST' && path === '/me/devices') {
      var dev = {
        id: uuid(),
        familyId: S.session.family.id,
        name: String((body && body.name) || 'Guardian'),
        status: 'registered',
        registeredAt: nowIso(),
      };
      S.devices.push(dev);
      S.fleet.push({
        id: dev.id, name: dev.name, status: 'registered', online: false, lastSeenAt: null,
        batteryPct: null, thermalC: null, appVersion: null, models: null,
      });
      log('Registered a guardian');
      save();
      return json(201, dev);
    }
    if (method === 'POST' && /^\/me\/devices\/[^/]+\/claim-code$/.test(path)) {
      var letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      var code = '';
      for (var i = 0; i < 8; i++) code += letters.charAt(Math.floor(Math.random() * letters.length));
      return json(201, {
        code: code.slice(0, 4) + '-' + code.slice(4),
        expiresAt: new Date(Date.now() + 15 * 60000).toISOString(),
      });
    }
    if (method === 'POST' && /^\/me\/fleet\/[^/]+\/wipe$/.test(path)) {
      toast('In the real app this wipes the guardian phone. Nothing happened in the demo.');
      return noContent();
    }

    // Push registration is native only; accept it quietly.
    if (/^\/me\/push-tokens(\/.*)?$/.test(path)) return noContent();

    return null;
  }

  /* ---------- fetch ---------- */

  function latency() {
    return 120 + Math.floor(Math.random() * 70);
  }

  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : input && input.url ? input.url : String(input);
    if (url.indexOf(API) !== 0) {
      return realFetch ? realFetch(input, init) : Promise.reject(new TypeError('fetch unavailable'));
    }
    var method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
    var parsed = new URL(url);
    var body = null;
    if (init && typeof init.body === 'string' && init.body.length > 0) {
      try {
        body = JSON.parse(init.body);
      } catch (e) {
        body = null;
      }
    }

    var result;
    try {
      result = route(method, parsed.pathname, parsed.searchParams, body);
    } catch (e) {
      console.error('[demo] mock route failed', method, parsed.pathname, e);
      result = json(500, { statusCode: 500, message: 'The demo stumbled. Reload to start over.' });
    }
    if (!result) {
      console.warn('[demo] no mock for ' + method + ' ' + parsed.pathname + parsed.search);
      result = notFound(method, parsed.pathname);
    }

    var payload = result.body === null ? null : JSON.stringify(result.body);
    return new Promise(function (resolve) {
      setTimeout(function () {
        resolve(
          new Response(payload, {
            status: result.status,
            headers: payload === null ? {} : { 'content-type': 'application/json; charset=utf-8' },
          }),
        );
      }, latency());
    });
  };

  // A small handle for the console: __obrigadaDemo.reset() starts the story over.
  window.__obrigadaDemo = {
    shiftDays: SHIFT_DAYS,
    reset: function () {
      try {
        sessionStorage.removeItem(STATE_KEY);
      } catch (e) {
        /* ignore */
      }
      location.reload();
    },
  };
})();

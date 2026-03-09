const GROQ_API_KEY = 'YOUR_GROQ_API_KEY';
const PERSONAL_CALENDAR_ID = 'YOUR_EMAIL@gmail.com';

// ─── EMAIL SCANNING ───────────────────────────────────────────────────────────

function getUnreadEmails() {
  const threads = GmailApp.search(
    'is:unread in:inbox (meet.google.com OR "Google Meet" OR "join the meeting" OR "class link" OR "lecture link")',
    0, 3
  );

  let emails = [];

  for (let i = 0; i < threads.length; i++) {
    const messages = threads[i].getMessages();
    const latest = messages[messages.length - 1];
    const body = latest.getPlainBody();

    const meetLinkMatch = body.match(/https:\/\/meet\.google\.com\/[a-z0-9\-]+/);
    const meetLink = meetLinkMatch ? meetLinkMatch[0] : null;

    if (meetLink) {
      emails.push({
        sender: latest.getFrom(),
        subject: latest.getSubject(),
        body: body.substring(0, 1000),
        meetLink: meetLink,
        date: latest.getDate()
      });

      threads[i].markRead();
    }
  }

  Logger.log('Meeting emails found: ' + emails.length);
  return emails;
}

// ─── AI ANALYSIS ─────────────────────────────────────────────────────────────

function analyzeEmailsWithAI(emails) {
  Utilities.sleep(2000);

  const emailText = emails.map(e =>
    `From: ${e.sender}\nSubject: ${e.subject}\nMeet Link: ${e.meetLink}\nBody: ${e.body}`
  ).join('\n\n---\n\n');

  const prompt = `
You are a university student's assistant. Extract ONLY university classes, lectures, or meetings that have a Google Meet link.
Ignore anything that is not a university class or meeting.

Return ONLY a JSON array like this, no other text:
[
  {
    "task": "Class or meeting name",
    "date": "YYYY-MM-DD or null if unknown",
    "time": "HH:MM in 24hr format or null if unknown",
    "duration_minutes": 60,
    "meetLink": "https://meet.google.com/xxx",
    "notes": "professor name or any other useful info"
  }
]

Emails:
${emailText}
`;

  const response = UrlFetchApp.fetch(
    'https://api.groq.com/openai/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + GROQ_API_KEY
      },
      payload: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          {
            role: 'system',
            content: 'You are a university students assistant. You extract meeting and class details from emails and return only valid JSON arrays, nothing else.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3
      })
    }
  );

  const result = JSON.parse(response.getContentText());
  const aiText = result.choices[0].message.content;
  const cleaned = aiText.replace(/```json|```/g, '').trim();
  const tasks = JSON.parse(cleaned);

  Logger.log(JSON.stringify(tasks, null, 2));
  return tasks;
}

// ─── CALENDAR HELPERS ─────────────────────────────────────────────────────────

function getCalendarByType(type) {
  if (type === 'personal') {
    return CalendarApp.getCalendarById(PERSONAL_CALENDAR_ID);
  }
  return CalendarApp.getDefaultCalendar();
}

function getUpcomingEvents() {
  const calendar = CalendarApp.getDefaultCalendar();
  const now = new Date();
  const oneWeekLater = new Date();
  oneWeekLater.setDate(now.getDate() + 7);

  const events = calendar.getEvents(now, oneWeekLater);
  return events.map(e => ({
    id: e.getId(),
    title: e.getTitle(),
    start: e.getStartTime().toISOString(),
    end: e.getEndTime().toISOString(),
    location: e.getLocation(),
    description: e.getDescription()
  }));
}

function addTasksToCalendar(tasks) {
  const calendar = CalendarApp.getDefaultCalendar();
  let skipped = 0;

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];

    let startTime;
    if (task.date && task.time) {
      startTime = new Date(task.date + 'T' + task.time + ':00');
    } else {
      startTime = new Date();
      startTime.setDate(startTime.getDate() + 1);
      startTime.setHours(9 + i, 0, 0, 0);
    }

    if (startTime < new Date()) {
      Logger.log('Skipped past event: ' + task.task + ' (' + startTime + ')');
      skipped++;
      continue;
    }

    const endTime = new Date(startTime);
    endTime.setMinutes(endTime.getMinutes() + (task.duration_minutes || 60));

    const description = [
      task.notes ? 'Notes: ' + task.notes : '',
      task.meetLink ? '🔗 Join Meet: ' + task.meetLink : '',
      '\nAuto-scheduled by AI Assistant'
    ].filter(Boolean).join('\n');

    calendar.createEvent(
      '🎓 ' + task.task,
      startTime,
      endTime,
      {
        description: description,
        location: task.meetLink || ''
      }
    );

    Logger.log('Scheduled: ' + task.task + ' at ' + startTime);
  }

  Logger.log('Skipped ' + skipped + ' past events.');
}

function addManualEvent(title, dateStr, timeStr, durationMinutes, meetLink, notes, calendarType) {
  const calendar = getCalendarByType(calendarType || 'university');

  let startTime;
  if (dateStr && timeStr) {
    startTime = new Date(dateStr + 'T' + timeStr + ':00');
  } else {
    startTime = new Date();
    startTime.setDate(startTime.getDate() + 1);
    startTime.setHours(9, 0, 0, 0);
  }

  const endTime = new Date(startTime);
  endTime.setMinutes(endTime.getMinutes() + (durationMinutes || 60));

  const description = [
    notes || '',
    meetLink ? '🔗 Join Meet: ' + meetLink : '',
    'Added via AI Chat Assistant'
  ].filter(Boolean).join('\n');

  calendar.createEvent(
    '🎓 ' + title,
    startTime,
    endTime,
    {
      description: description,
      location: meetLink || ''
    }
  );

  return 'Added: ' + title + ' on ' + dateStr + ' at ' + timeStr;
}

// ─── FIXED: addRecurringEvents now supports per-day times via dayTimesMap ─────

function addRecurringEvents(title, startDateStr, endDateStr, daysOfWeek, timeStr, durationMinutes, meetLink, notes, calendarType, dayTimesMap) {
  const calendar = getCalendarByType(calendarType || 'university');
  const endDate = new Date(endDateStr);
  let current = new Date(startDateStr);
  let added = 0;

  while (current <= endDate) {
    const dayOfWeek = current.getDay();

    if (daysOfWeek.includes(dayOfWeek)) {
      // Use per-day time from dayTimesMap if available, otherwise fall back to shared timeStr
      const resolvedTime = (dayTimesMap && dayTimesMap[String(dayOfWeek)]) ? dayTimesMap[String(dayOfWeek)] : timeStr;
      const resolvedDuration = (dayTimesMap && dayTimesMap[String(dayOfWeek) + '_duration']) ? dayTimesMap[String(dayOfWeek) + '_duration'] : (durationMinutes || 60);

      if (!resolvedTime) {
        current.setDate(current.getDate() + 1);
        continue;
      }

      const startTime = new Date(current.toISOString().split('T')[0] + 'T' + resolvedTime + ':00');

      if (startTime > new Date()) {
        const endTime = new Date(startTime);
        endTime.setMinutes(endTime.getMinutes() + resolvedDuration);

        const description = [
          notes || '',
          meetLink ? '🔗 Join Meet: ' + meetLink : '',
          'Added via AI Chat Assistant'
        ].filter(Boolean).join('\n');

        calendar.createEvent('🎓 ' + title, startTime, endTime, {
          description: description,
          location: meetLink || ''
        });

        Logger.log('Added recurring: ' + title + ' on ' + startTime);
        added++;
      }
    }
    current.setDate(current.getDate() + 1);
  }

  Logger.log('Total recurring events added: ' + added);
  return added;
}

function deleteEventById(eventId) {
  const calendar = CalendarApp.getDefaultCalendar();
  const event = calendar.getEventById(eventId);
  if (event) {
    const title = event.getTitle();
    event.deleteEvent();
    return 'Deleted: ' + title;
  }
  return 'Event not found.';
}

function deletePassedEvents() {
  const calendar = CalendarApp.getDefaultCalendar();
  const now = new Date();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(now.getDate() - 30);

  const pastEvents = calendar.getEvents(thirtyDaysAgo, now);
  let deleted = 0;

  for (let i = 0; i < pastEvents.length; i++) {
    const event = pastEvents[i];
    if (event.getDescription().includes('AI Assistant')) {
      event.deleteEvent();
      deleted++;
    }
  }

  Logger.log('Deleted ' + deleted + ' past events.');
  return deleted;
}

// ─── NOTIFICATIONS ────────────────────────────────────────────────────────────

function sendNotification(tasks) {
  if (tasks.length === 0) return;

  let emailBody = '🤖 Your AI Assistant just added the following to your calendar:\n\n';

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    emailBody += '🎓 ' + task.task + '\n';
    emailBody += '📅 Date: ' + (task.date || 'TBD') + '\n';
    emailBody += '⏰ Time: ' + (task.time || 'TBD') + '\n';
    emailBody += '⏱ Duration: ' + (task.duration_minutes || 60) + ' mins\n';
    if (task.meetLink) emailBody += '🔗 Meet Link: ' + task.meetLink + '\n';
    if (task.notes) emailBody += '📝 Notes: ' + task.notes + '\n';
    emailBody += '\n';
  }

  emailBody += 'View your calendar: https://calendar.google.com';

  GmailApp.sendEmail(
    Session.getActiveUser().getEmail(),
    '🤖 AI Assistant added ' + tasks.length + ' event(s) to your calendar',
    emailBody
  );

  Logger.log('Notification sent!');
}

// ─── MAIN RUNNER ──────────────────────────────────────────────────────────────

function runAssistant() {
  deletePassedEvents();

  const emails = getUnreadEmails();

  if (!emails || emails.length === 0) {
    Logger.log('No meeting emails found.');
    return;
  }

  const tasks = analyzeEmailsWithAI(emails);
  Logger.log('Meetings extracted: ' + tasks.length);

  if (tasks.length > 0) {
    const futureTasks = tasks.filter(task => {
      if (!task.date) return false;
      const eventTime = new Date(task.date + 'T' + (task.time || '23:59') + ':00');
      return eventTime > new Date();
    });

    addTasksToCalendar(tasks);

    if (futureTasks.length > 0) {
      sendNotification(futureTasks);
      Logger.log('Done! ' + futureTasks.length + ' upcoming meetings added.');
    } else {
      Logger.log('All extracted meetings were in the past, nothing added.');
    }
  }
}

// ─── CHAT HANDLER ─────────────────────────────────────────────────────────────

function handleChatMessage(userMessage) {
  const upcomingEvents = getUpcomingEvents();
  const eventsContext = JSON.stringify(upcomingEvents, null, 2);

  const systemPrompt = `You are a personal calendar assistant for a university student.
You manage TWO calendars:
1. "university" - for classes, lectures, university meetings
2. "personal" - for personal tasks, social events, everything else

Their upcoming events (next 7 days):
${eventsContext}

Today's date: ${new Date().toISOString()}

You MUST always respond in valid JSON. Never respond in plain text. Use this format:
{
  "action": "none" | "add" | "add_recurring" | "delete" | "scan_emails",
  "response": "Your friendly reply here. Use line breaks and numbered lists. NEVER put raw JSON here.",
  "eventDetails": {
    "title": "event title",
    "date": "YYYY-MM-DD or null",
    "time": "HH:MM in 24hr or null (used as fallback if dayTimesMap not set)",
    "duration_minutes": 60,
    "meetLink": "url or null",
    "notes": "any notes",
    "calendarType": "university or personal",
    "startDate": "YYYY-MM-DD for recurring",
    "endDate": "YYYY-MM-DD for recurring",
    "daysOfWeek": [1, 2],
    "dayTimesMap": {
      "1": "HH:MM for Monday in 24hr",
      "1_duration": 80,
      "2": "HH:MM for Tuesday in 24hr",
      "2_duration": 40
    }
  },
  "eventId": "id if deleting, otherwise null"
}

IMPORTANT RULES FOR RECURRING EVENTS:
- For recurring events use action "add_recurring".
- If different days have DIFFERENT start times or durations, you MUST populate "dayTimesMap" with the correct time and duration for each day number.
- Days of week: 0=Sunday, 1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday, 6=Saturday.
- "dayTimesMap" keys are the day number as a string (e.g. "1" for Monday), and "1_duration" for that day's duration in minutes.
- Always confirm which calendar you added to. NEVER include raw JSON in the response field.`;

  const response = UrlFetchApp.fetch(
    'https://api.groq.com/openai/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + GROQ_API_KEY
      },
      payload: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ],
        temperature: 0.3
      })
    }
  );

  const result = JSON.parse(response.getContentText());
  const aiText = result.choices[0].message.content;
  const cleaned = aiText.replace(/```json|```/g, '').trim();

  let parsed;
  try {
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[0]);
    } else {
      throw new Error('No JSON found');
    }
  } catch(e) {
    parsed = {
      action: 'none',
      response: cleaned.replace(/\{[\s\S]*\}/, '').trim() || aiText.trim(),
      eventDetails: null,
      eventId: null
    };
  }

  if (!parsed.response || typeof parsed.response !== 'string') {
    parsed.response = 'Done! Let me know if you need anything else.';
  }

  if (parsed.action === 'add' && parsed.eventDetails) {
    const d = parsed.eventDetails;
    addManualEvent(d.title, d.date, d.time, d.duration_minutes, d.meetLink, d.notes, d.calendarType);
  } else if (parsed.action === 'add_recurring' && parsed.eventDetails) {
    const d = parsed.eventDetails;
    const count = addRecurringEvents(
      d.title,
      d.startDate,
      d.endDate,
      d.daysOfWeek,
      d.time,
      d.duration_minutes,
      d.meetLink,
      d.notes,
      d.calendarType,
      d.dayTimesMap || null   // ← per-day times fix
    );
    parsed.response = '✅ Added ' + count + ' recurring events to your university calendar!';
  } else if (parsed.action === 'delete' && parsed.eventId) {
    deleteEventById(parsed.eventId);
  } else if (parsed.action === 'scan_emails') {
    try {
      runAssistant();
      parsed.response = '✅ Done scanning! Any new upcoming meetings have been added to your calendar.';
    } catch(e) {
      parsed.response = '⚠️ Scanning ran into an issue: ' + e.message;
    }
  }

  return parsed.response;
}

// ─── WEB APP ──────────────────────────────────────────────────────────────────

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Chat')
    .setTitle('AI Calendar Assistant')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function processChat(message) {
  try {
    return handleChatMessage(message);
  } catch(e) {
    return 'Error: ' + e.message + ' | Stack: ' + e.stack;
  }
}
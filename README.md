# AI Calendar Assistant for University Students 🤖📅

An intelligent Google Apps Script (GAS) assistant that manages your university schedule by scanning emails for meeting links, handling recurring classes, and providing a chat interface for manual event management.

## 🚀 Features

- **Email Scanning**: Automatically scans unread Gmail threads for Google Meet links (lectures, classes, meetings).
- **AI Analysis**: Uses Groq (LLM) to extract class names, dates, times, and notes from emails.
- **Calendar Management**: Supports two calendars: `university` and `personal`.
- **Recurring Events**: Handles complex recurring class schedules with different times for different days.
- **Interactive Chat Interface**: A modern, responsive web-based chat UI to:
  - Add manual/recurring events.
  - Delete events.
  - Trigger email scanning.
  - View upcoming events.
- **Notifications**: Sends Gmail summaries of new events added by the assistant.
- **Auto-Cleanup**: Automatically removes past events tagged by the AI assistant.

## 🛠️ Setup

1.  **Apps Script**:
    - Create a new project at [script.google.com](https://script.google.com/).
    - Copy the contents of `Code.js` and `Chat.html` into your project.
    - Set the `GROQ_API_KEY` and `PERSONAL_CALENDAR_ID` in `Code.js`.
2.  **Enable Services**:
    - In the Apps Script project settings, enable **Google Calendar API** and **Gmail API**.
3.  **Deploy**:
    - Deploy the project as a **Web App**.
    - Set "Execute as" to **User deploying** and "Who has access" to **Myself** (or as needed).
4.  **Triggers**:
    - Set up a time-driven trigger to run `runAssistant()` periodically (e.g., every hour) to scan emails.

## 📂 Project Structure

- `Code.js`: Main backend logic (AI analysis, Calendar/Gmail interaction).
- `Chat.html`: Frontend chat UI.
- `appsscript.json`: Manifest file for script settings.
- `.clasp.json`: Configuration for local development with [clasp](https://github.com/google/clasp).

## 🔑 Configuration

```javascript
const GROQ_API_KEY = 'YOUR_GROQ_API_KEY';
const PERSONAL_CALENDAR_ID = 'YOUR_EMAIL@gmail.com';
```

---
Built with ❤️ for student productivity.

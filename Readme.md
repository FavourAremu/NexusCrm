# NexusCRM — Full-Suite IT Operations CRM

![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)
![Node.js](https://img.shields.io/badge/Node.js-v18%2B-green.svg)
![Postgres](https://img.shields.io/badge/Database-Neon%20Postgres-blue.svg)
![Status](https://img.shields.io/badge/Status-Active-brightgreen.svg)

A web-based Customer Relationship Management system built specifically for IT organizations. NexusCRM covers the entire customer lifecycle — from lead capture to client conversion — with built-in support ticketing, vendor management, team collaboration, and a real-time activity feed. Backed by a serverless Postgres database (Neon) with JWT authentication.

---

## Screenshots

> Dashboard, Pipeline, Support Tickets, and Lead Conversion all in one workspace.

---

## Features

| Module                       | Description                                                                                    |
| ---------------------------- | ---------------------------------------------------------------------------------------------- |
| **Lead Capture**             | Collect leads with source tracking, estimated value, and automatic scoring (Cold / Warm / Hot) |
| **Lead → Client Conversion** | One-click conversion that creates a contact, opens a deal, and logs the event                  |
| **Contacts**                 | Full client and prospect database with status tracking                                         |
| **Sales Pipeline**           | Kanban board across 6 stages: Lead → Qualified → Proposal → Negotiation → Closed Won / Lost    |
| **Support Tickets**          | Track inquiries, complaints, and bugs with priority, assignee, and status                      |
| **Vendor Management**        | Manage supplier contracts, contacts, categories, and renewal status                            |
| **Tasks**                    | Assign and track tasks per contact with due dates and priority levels                          |
| **Notes & History**          | Log calls, emails, meetings, and notes per contact                                             |
| **Team Activity Feed**       | Real-time log of every action taken by any team member                                         |
| **Comments**                 | Threaded comments on any deal, ticket, or note                                                 |
| **Auth**                     | Secure email + password sign up / sign in with JWT tokens                                      |

---

## Tech Stack

- **Frontend** — HTML, CSS, Vanilla JavaScript (single `.html` file, zero dependencies)
- **Backend** — Node.js + Express
- **Database** — [Neon](https://neon.tech) Serverless Postgres
- **Auth** — JWT (JSON Web Tokens) + bcrypt password hashing
- **Deployment** — [Render](https://render.com) (free tier)

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org) v18 or higher
- A free [Neon](https://neon.tech) account and database
- A free [Render](https://render.com) account (for deployment)

---

### 1. Clone the repository

```bash
git clone https://github.com/YOUR_USERNAME/nexuscrm.git
cd nexuscrm
```

---

### 2. Install dependencies

```bash
npm install
```

---

### 3. Configure environment variables

Copy the example env file and fill in your values:

```bash
cp .env.example .env
```

Open `.env` and set the following:

```env
# Your Neon connection string (from Neon dashboard → Project → Connection string)
DATABASE_URL=postgresql://user:password@your-host.neon.tech/neondb?sslmode=require

# A long random secret string for signing JWT tokens
# Generate one: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
JWT_SECRET=your-long-random-secret-here

# Server port
PORT=3001
```

> ⚠️ Never commit your `.env` file to GitHub. It is already listed in `.gitignore`.

---

### 4. Start the server

```bash
npm start
```

You should see:

```
✅ Database tables ready
🚀 NexusCRM API running on http://localhost:3001
```

All database tables are created automatically on first run — no manual SQL required.

---

### 5. Open the frontend

Open `nexuscrm-app.html` in your browser. The API URL is pre-configured to `http://localhost:3001/api` for local development.

---

### 6. Create your account

Click **Create one** on the sign-in screen → enter your name, email, and password. All team members sign up individually — accounts are stored in your Neon database.

---

## Deployment (Render — Free)

### Backend

1. Push your code to GitHub (only `server.js` and `package.json` needed — do **not** push `.env`)
2. Go to [render.com](https://render.com) → **New +** → **Web Service**
3. Connect your GitHub repository
4. Configure the service:

| Setting       | Value            |
| ------------- | ---------------- |
| Runtime       | Node             |
| Build Command | `npm install`    |
| Start Command | `node server.js` |
| Instance Type | Free             |

5. Under **Environment**, add your `DATABASE_URL`, `JWT_SECRET`, and `PORT` variables
6. Click **Create Web Service** — Render deploys automatically

### Frontend

Once deployed, open `nexuscrm-app.html` and update the API constant at the top of the `<script>` block:

```js
// Change this line:
const API = "http://localhost:3001/api";

// To your Render URL:
const API = "https://your-app-name.onrender.com/api";
```

You can then host the HTML file anywhere — GitHub Pages, Netlify, or simply open it locally.

---

## Desktop App (.exe)

NexusCRM can be packaged as a Windows desktop application using Electron.

### Requirements

```bash
npm install -g electron electron-builder
```

### Project structure

```
nexuscrm-desktop/
├── index.html     ← nexuscrm-app.html renamed
├── main.js
├── package.json
```

### main.js

```js
const { app, BrowserWindow } = require("electron");

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    title: "NexusCRM",
  });
  win.loadFile("index.html");
  win.setMenuBarVisibility(false);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
```

### Build

```bash
npx electron-builder --win
```

Your installer will be output to `dist/NexusCRM Setup 1.0.0.exe`.

> Download the latest release from the [Releases](../../releases) page.

---

## Project Structure

```
nexuscrm/
├── server.js          # Express API — all routes and database logic
├── package.json       # Dependencies
├── .env.example       # Environment variable template
├── nexuscrm-app.html  # Full frontend (single file)
├── LICENSE            # MIT License
└── README.md
```

---

## API Endpoints

| Method     | Endpoint                  | Description                    | Auth |
| ---------- | ------------------------- | ------------------------------ | ---- |
| POST       | `/api/auth/signup`        | Create a new account           | No   |
| POST       | `/api/auth/signin`        | Sign in and receive a token    | No   |
| GET        | `/api/auth/me`            | Get current user               | Yes  |
| GET/POST   | `/api/contacts`           | List or create contacts        | Yes  |
| PUT/DELETE | `/api/contacts/:id`       | Update or delete a contact     | Yes  |
| GET/POST   | `/api/leads`              | List or capture leads          | Yes  |
| DELETE     | `/api/leads/:id`          | Delete a lead                  | Yes  |
| GET/POST   | `/api/deals`              | List or create deals           | Yes  |
| PUT/DELETE | `/api/deals/:id`          | Update or delete a deal        | Yes  |
| GET/POST   | `/api/tickets`            | List or create support tickets | Yes  |
| PUT/DELETE | `/api/tickets/:id`        | Update or delete a ticket      | Yes  |
| GET/POST   | `/api/vendors`            | List or create vendors         | Yes  |
| PUT/DELETE | `/api/vendors/:id`        | Update or delete a vendor      | Yes  |
| GET/POST   | `/api/tasks`              | List or create tasks           | Yes  |
| PUT/DELETE | `/api/tasks/:id`          | Update or delete a task        | Yes  |
| GET/POST   | `/api/notes`              | List or create notes           | Yes  |
| PUT/DELETE | `/api/notes/:id`          | Update or delete a note        | Yes  |
| POST       | `/api/conversions`        | Convert a lead to client       | Yes  |
| GET        | `/api/activity`           | Get team activity feed         | Yes  |
| GET/POST   | `/api/comments/:type/:id` | Get or post comments           | Yes  |
| GET        | `/api/team`               | List all team members          | Yes  |

---

## Contributing

Contributions are welcome! To get started:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit your changes: `git commit -m "Add my feature"`
4. Push to the branch: `git push origin feature/my-feature`
5. Open a Pull Request

Please open an issue first for major changes so we can discuss the approach.

---

## License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

---

## Acknowledgements

Built with [Express](https://expressjs.com), [Neon](https://neon.tech), and deployed on [Render](https://render.com).

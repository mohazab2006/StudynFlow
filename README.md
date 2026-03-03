# StudynFlow

A modern desktop todo app for students and life. Built with Tauri 2, React, and TypeScript.

---

## ✨ Features

### 🎯 Dual Workspace (School & Life)
- **School**: Courses, grade tracking, task types (assignments, quizzes, labs, exams, etc.), drop-lowest rules, course outline (prof, TAs, policies).
- **Life**: Custom categories, recurring tasks, auto-cleanup. Keep exam prep separate from groceries.

### 📊 Grade Tracking & Course Management
- Color-coded courses, weighted grade calculations, task types.
- “What do I need on the final?” and what-if grading in Command Center.
- Course rules (e.g. drop lowest N of M quizzes). Full calendar and study-plan support.

### ✅ Task Management
- Status: todo → doing → done. Subtasks, due dates, priorities, **effort estimates** (minutes).
- Recurring tasks: daily/weekly/monthly templates, 90-day horizon, edit single occurrences or series.

### 🏠 Home Dashboard (single row)
Five widgets in one horizontal row:
- **Snapshot** – Counts for today, upcoming 7d, school, life.
- **Weather** – Open-Meteo with live conditions and rain/snow/sun/cloud animations.
- **Focus** – Top tasks by due date and weight (School/Life filter).
- **Calendar** – Mini month grid: today highlighted, task count per day, link to full calendar.
- **Recurring Tasks** – Upcoming recurring templates.

Below: **Today + Overdue** and **Next 7 days** task lists.

### ⌘ Command Center (`Ctrl+K` / `⌘K`)
- **Quick add** with course, weight, type, due date (e.g. “Add assignment in COMP2401 weight 8%”).
- Queries: “What do I need on the final?”, “Drop lowest quiz in COMP2401”.
- **Voice input** (optional): `Ctrl+Shift+V`, language and auto-submit in voice settings.
- **AI settings**: Enable/disable AI, base URL, model. One API key for all users (set at build time).

### 📥 Import Outline
- Upload **PDF, image, or .txt** or paste syllabus text.
- **Rule-based** extraction of tasks (weights, types, dates). Optional **“Use AI to extract tasks”** for messy syllabi.
- When a **course is selected**, prof, TAs, office hours, textbook, attendance, submission policy, etc. are extracted and saved to that course’s **Course outline** section on the School page.
- Uploaded files stored as course assets.

### 📋 Course Outline (School page)
When a course is selected, the **Course outline** block shows:
- Professor name & email, TAs, office hours.
- Textbook/materials, technical requirements.
- Attendance, submission/late policy, exam pass rule, learning objectives.
- Filled automatically from Import Outline or from “Extract outline from pasted syllabus” in the same section.

### 🤖 AI (one key for everyone)
- **Build-time key**: Set `VITE_OPENAI_API_KEY` in `.env`; all users share it. No per-user API key; don’t commit `.env`.
- **Natural-language quick add** (top bar & Command Center): e.g. “add comp2401 assignment weight 8%”, “add quizzes 1-10 each 5% in comp2404”.
- **AI task extraction** in Import Outline when “Use AI to extract tasks” is checked.
- **Suggest effort (AI)** in the School task modal: estimates effort in minutes (15–480) from title and type.
- Toggle, base URL, and model in **Command Center → AI settings**.

### 📱 Views
- **Home** – Dashboard (widgets + today + next 7 days).
- **Today** – Due today and overdue.
- **Upcoming** – Next 7 days.
- **School** – Course dashboard, grade breakdown, course outline, rules, tasks.
- **Life** – Categories and life tasks.
- **Calendar** – Full monthly view of tasks by due date (linked from Home mini calendar).

---

## 🛠️ Tech Stack

| Layer      | Stack |
|-----------|--------|
| Frontend  | React 18, TypeScript, Tailwind CSS |
| Backend   | Tauri 2 (Rust) |
| Database  | SQLite via `@tauri-apps/plugin-sql` (local-first) |
| State     | TanStack Query, React Hook Form + Zod |
| Routing   | React Router v6 |

---

## 🚀 Getting Started

**Requirements:** Node.js 18+, Rust toolchain.

```bash
npm install
```

**Optional – enable AI for all users (no per-user key):**
1. Copy `.env.example` to `.env`.
2. Set `VITE_OPENAI_API_KEY=your-openai-key` in `.env`.
3. Do not commit `.env` (it’s in `.gitignore`).

```bash
# Development
npm run tauri:dev

# Production build
npm run tauri:build
```

**App icon:** After changing `app-icon.png`:

```bash
npx tauri icon app-icon.png
```

Keep `public/app-icon.png` in sync for the in-app logo and favicon.

---

## 📝 Credits

[rapidtables](https://www.rapidtables.com) was used as a reference for parts of the implementation.

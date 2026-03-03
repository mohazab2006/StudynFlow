# StudynFlow

StudynFlow is a desktop planner built for students who need one place to manage both school and personal life. It is built with Tauri 2, React, and TypeScript.

---

## What it does

- **Two workspaces**: Keep School and Life separate.
- **School tools**: Courses, task types (assignments, quizzes, labs, exams), grade tracking, weighted calculations, drop-lowest rules, and final-grade planning.
- **Life tools**: Categories and recurring tasks.
- **Home dashboard**: Snapshot widgets, weather, focus tasks, mini calendar, recurring tasks, and quick views for today, overdue, and next 7 days.
- **Command Center (`Ctrl+K`)**: Quick add, grade queries, and optional voice input.
- **Import Outline**: Upload a PDF/image or paste text to extract tasks and course details (rule-based or AI-assisted).
- **Views**: Today, Upcoming, School, Life, and full Calendar.

Grade-related calculations follow a [rapidtables](https://www.rapidtables.com)-style approach where appropriate.

---

## AI features

- **Natural-language quick add**  
  Example: `add comp2401 assignment weight 8%`
- **Syllabus extraction**  
  Use AI in Import Outline to pull assignments, dates, and weights from messy syllabi.
- **Effort suggestion**  
  Suggests estimated effort (minutes) in the School task modal.

To enable AI features, set `VITE_OPENAI_API_KEY` in `.env`. Do not commit `.env`.

---

## Tech stack

React 18, TypeScript, Tailwind, Tauri 2 (Rust), SQLite (local-first), TanStack Query, React Hook Form, Zod, React Router v6

---

## Run locally

Requirements: Node.js 18+ and Rust

```bash
npm install
npm run tauri:dev
```

Build production app:

```bash
npm run tauri:build
```

If you update `app-icon.png`, regenerate icons with:

```bash
npx tauri icon app-icon.png
```

Then keep `public/app-icon.png` in sync.

---

## Credits

[rapidtables](https://www.rapidtables.com) was used as a reference for grade-related logic.

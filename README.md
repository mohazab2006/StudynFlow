# StudynFlow

A modern desktop todo app that actually makes task management enjoyable. Built with Tauri 2, React, and TypeScript—because who says productivity tools have to be boring?

## ✨ What I've Built

### 🎯 Dual Workspace System
Separate your academic and personal life with dedicated **School** and **Life** workspaces. School tasks integrate with course management and grade tracking, while life tasks support custom categories and auto-cleanup. No more mixing your exam prep with grocery lists.

### 🔄 Smart Recurring Tasks
Built a template-based recurrence system that's actually flexible. Create recurring tasks with daily, weekly, or monthly patterns (think RRULE but simpler). Instances generate on-demand with a 90-day horizon, and you can edit individual occurrences or entire series. Perfect for those "every Monday morning" habits.

### 🌤️ Weather-Integrated Dashboard
Why stare at a boring dashboard when you can have animated weather? Integrated Open-Meteo API with dynamic CSS animations—particle systems for rain/snow, gradient overlays, and even starfields for clear nights. The weather widget adapts based on WMO weather codes and time of day. It's functional *and* pretty.

### 📊 Grade Tracking & Course Management
For the students: full course management with color-coded courses, grade tracking with weighted calculations, and task types (assignments, exams, labs, etc.). Know exactly where you stand in each class.

### ✅ Core Task Management
The essentials done right: status workflow (todo → doing → done), subtasks, due dates, priorities, and effort estimates. Recurring instances appear at midnight on their occurrence date, keeping your schedule clean.

### 📱 Multiple Views
- **Home**: Dashboard with recurring templates and weather
- **Today**: What needs your attention right now
- **Upcoming**: See what's coming down the pipeline
- **School/Life**: Workspace-specific views with filtering

## 🛠️ Tech Stack

- **Frontend**: React 18, TypeScript, Tailwind CSS
- **Backend**: Tauri 2 (Rust) - native performance, tiny bundle size
- **Database**: SQLite via `@tauri-apps/plugin-sql` - local-first, no cloud required
- **State**: TanStack Query for server state, React Hook Form + Zod for forms
- **Routing**: React Router v6

## 🚀 Getting Started

Requires Node.js 18+ and Rust toolchain.

```bash
# Install dependencies
npm install

# Run in development mode
npm run tauri:dev

# Build for production
npm run tauri:build
```

## 🔮 What's Coming Next

I'm actively working on some exciting features that'll make this even better:

### 🤖 AI-Powered Intelligence
The big one. I'm planning to add AI features that'll actually make your life easier:
- **Smart Prioritization**: AI that understands your deadlines, workload, and patterns to suggest what to tackle first
- **Auto-Scheduling**: Let AI figure out when you should work on tasks based on your calendar and energy levels
- **Intelligent Categorization**: Automatically organize tasks into the right categories
- **Task Recommendations**: AI-generated suggestions based on your habits and goals

### 🖥️ Desktop Widgets
Quick-access widgets so you can see and complete tasks without opening the full app. Perfect for that second monitor or when you just need a quick check-in.

### 📱 Mobile Companion (Maybe?)
If I decide to expand beyond desktop, I'll build a mobile app with widgets showing today's tasks and upcoming deadlines. Because sometimes you need to check your todos while you're away from your desk.

### 🎨 UI/UX Improvements
- Better animations and transitions
- More customization options
- Dark/light theme toggle (currently dark-only)
- Keyboard shortcuts for power users

The AI features are the main focus right now—I want to make task management genuinely intelligent, not just a fancy list.

## 📝 Credits

Used [rapidtables](https://www.rapidtables.com) as a reference for some parts of the implementation.

---

import Database from '@tauri-apps/plugin-sql';

let db: Database | null = null;
let initPromise: Promise<void> | null = null;

export async function getDatabase(): Promise<Database> {
  if (!db) {
    db = await Database.load('sqlite:studynflow.db');
    // Make SQLite more resilient in dev where multiple quick writes happen.
    // This will wait for locks instead of immediately failing with SQLITE_BUSY (database is locked).
    await db.execute('PRAGMA busy_timeout = 5000');
    await db.execute('PRAGMA foreign_keys = ON');
  }
  return db;
}

export async function initDatabase(): Promise<void> {
  // React StrictMode (dev) can run effects twice; ensure init is only executed once.
  if (!initPromise) {
    initPromise = (async () => {
      const database = await getDatabase();
      await runMigrations(database);
    })();
  }
  await initPromise;
}

function isDbLockedError(err: unknown): boolean {
  const msg = String((err as any)?.message ?? err ?? '');
  return msg.toLowerCase().includes('database is locked') || msg.toLowerCase().includes('sqlite_busy');
}

export async function executeWithRetry(
  sql: string,
  params: any[] = [],
  options: { retries?: number; delayMs?: number } = {}
): Promise<any> {
  const { retries = 8, delayMs = 150 } = options;
  const database = await getDatabase();
  let lastErr: unknown;
  for (let i = 0; i <= retries; i++) {
    try {
      return await database.execute(sql, params);
    } catch (err) {
      lastErr = err;
      if (!isDbLockedError(err) || i === retries) break;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
}

async function runMigrations(database: Database): Promise<void> {
  // Create schema version table if it doesn't exist
  await database.execute(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Get current version
  const result = await database.select<{ version: number | null }[]>(
    'SELECT MAX(version) as version FROM schema_version'
  );
  const currentVersion = result[0]?.version ?? 0;

  // Run migrations in order
  const migrations = [
    migration1_initial_schema,
    migration2_add_course_colors,
    migration3_add_life_categories,
    migration4_add_task_life_category_id,
    migration5_add_task_types,
    migration6_add_task_workspace,
    migration7_add_task_grades,
    migration8_add_recurring_tasks,
    migration9_unique_recurring_instances,
    migration10_course_assets,
    migration11_course_rules_and_profiles,
  ];

  for (let i = currentVersion; i < migrations.length; i++) {
    const targetVersion = i + 1;
    console.log(`Running migration ${targetVersion}...`);
    
    // Check if this version already exists (in case of interrupted migration)
    const existing = await database.select<{ count: number }[]>(
      'SELECT COUNT(*) as count FROM schema_version WHERE version = ?',
      [targetVersion]
    );
    
    if (existing[0]?.count === 0) {
      await migrations[i](database);
      // Avoid UNIQUE constraint errors if a second init raced us.
      await database.execute('INSERT OR IGNORE INTO schema_version (version) VALUES (?)', [
        targetVersion,
      ]);
      console.log(`Migration ${targetVersion} completed.`);
    } else {
      console.log(`Migration ${targetVersion} already applied, skipping.`);
    }
  }
}

async function migration1_initial_schema(db: Database): Promise<void> {
  // Courses table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS courses (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      term TEXT NOT NULL,
      target_grade_default REAL DEFAULT 90,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT
    )
  `);

  // Tasks table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      due_at TEXT,
      type TEXT NOT NULL DEFAULT 'other',
      course_id TEXT,
      status TEXT NOT NULL DEFAULT 'todo',
      priority_manual TEXT,
      effort_estimate_minutes INTEGER,
      tags TEXT,
      source TEXT NOT NULL DEFAULT 'manual',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT,
      FOREIGN KEY (course_id) REFERENCES courses(id)
    )
  `);

  // Subtasks table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS subtasks (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      text TEXT NOT NULL,
      done INTEGER NOT NULL DEFAULT 0,
      order_index INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    )
  `);

  // Create indices for performance
  await db.execute('CREATE INDEX IF NOT EXISTS idx_tasks_due_at ON tasks(due_at)');
  await db.execute('CREATE INDEX IF NOT EXISTS idx_tasks_course_id ON tasks(course_id)');
  await db.execute('CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)');
  await db.execute('CREATE INDEX IF NOT EXISTS idx_subtasks_task_id ON subtasks(task_id)');
}

async function migration2_add_course_colors(db: Database): Promise<void> {
  // Add color column to courses table (only if missing).
  const cols = await db.select<{ name: string }[]>("PRAGMA table_info('courses')");
  const hasColor = cols.some((c) => c.name === 'color');
  if (!hasColor) {
    await db.execute(`ALTER TABLE courses ADD COLUMN color TEXT DEFAULT '#6B7280'`);
  }
}

async function migration3_add_life_categories(db: Database): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS life_categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#6B7280',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT
    )
  `);

  await db.execute('CREATE INDEX IF NOT EXISTS idx_life_categories_name ON life_categories(name)');
}

async function migration4_add_task_life_category_id(db: Database): Promise<void> {
  const cols = await db.select<{ name: string }[]>("PRAGMA table_info('tasks')");
  const hasLifeCategoryId = cols.some((c) => c.name === 'life_category_id');
  if (!hasLifeCategoryId) {
    await db.execute(`ALTER TABLE tasks ADD COLUMN life_category_id TEXT`);
    await db.execute('CREATE INDEX IF NOT EXISTS idx_tasks_life_category_id ON tasks(life_category_id)');
  }
}

async function migration5_add_task_types(db: Database): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS task_types (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#6B7280',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT
    )
  `);

  await db.execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_task_types_name_unique ON task_types(name)');

  // Seed defaults if table is empty (ignores duplicates safely).
  const existing = await db.select<{ count: number }[]>('SELECT COUNT(*) as count FROM task_types WHERE deleted_at IS NULL');
  if ((existing[0]?.count ?? 0) === 0) {
    const now = new Date().toISOString();
    const defaults: Array<{ id: string; name: string; color: string }> = [
      { id: 'type-assignment', name: 'Assignment', color: '#16A34A' },
      { id: 'type-exam', name: 'Exam', color: '#DC2626' },
      { id: 'type-quiz', name: 'Quiz', color: '#EA580C' },
      { id: 'type-midterm', name: 'Midterm', color: '#9333EA' },
      { id: 'type-final', name: 'Final', color: '#DC2626' },
      { id: 'type-lab', name: 'Lab', color: '#0D9488' },
      { id: 'type-tutorial', name: 'Tutorial', color: '#CA8A04' },
      { id: 'type-reading', name: 'Reading', color: '#2563EB' },
      { id: 'type-project', name: 'Project', color: '#DB2777' },
      { id: 'type-other', name: 'Other', color: '#6B7280' },
    ];

    for (const t of defaults) {
      await db.execute(
        `INSERT OR IGNORE INTO task_types (id, name, color, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
        [t.id, t.name, t.color, now, now]
      );
    }
  }
}

async function migration6_add_task_workspace(db: Database): Promise<void> {
  const cols = await db.select<{ name: string }[]>("PRAGMA table_info('tasks')");
  const hasWorkspace = cols.some((c) => c.name === 'workspace');
  if (!hasWorkspace) {
    await db.execute(`ALTER TABLE tasks ADD COLUMN workspace TEXT NOT NULL DEFAULT 'life'`);
    await db.execute('CREATE INDEX IF NOT EXISTS idx_tasks_workspace ON tasks(workspace)');
    // Backfill existing rows: if a task has a course_id it belongs to school, otherwise life.
    await db.execute(`UPDATE tasks SET workspace = 'school' WHERE course_id IS NOT NULL`);
  }
}

async function migration7_add_task_grades(db: Database): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS task_grades (
      task_id TEXT PRIMARY KEY,
      grade_percent REAL NULL,          -- can exceed 100 (bonus)
      weight_percent REAL NULL,         -- % of final grade
      is_graded INTEGER NOT NULL DEFAULT 0,
      counts INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    )
  `);

  await db.execute('CREATE INDEX IF NOT EXISTS idx_task_grades_task_id ON task_grades(task_id)');
}

async function migration8_add_recurring_tasks(db: Database): Promise<void> {
  const cols = await db.select<{ name: string }[]>("PRAGMA table_info('tasks')");
  
  const addColumnIfMissing = async (colName: string, sqlType: string, defaultValue?: string) => {
    const hasCol = cols.some((c) => c.name === colName);
    if (!hasCol) {
      const defaultClause = defaultValue !== undefined ? ` DEFAULT ${defaultValue}` : '';
      await db.execute(`ALTER TABLE tasks ADD COLUMN ${colName} ${sqlType}${defaultClause}`);
    }
  };

  await addColumnIfMissing('isRecurringTemplate', 'INTEGER', '0');
  await addColumnIfMissing('recurrenceRuleJson', 'TEXT');
  await addColumnIfMissing('recurringSeriesId', 'TEXT');
  await addColumnIfMissing('parentTemplateId', 'TEXT');
  await addColumnIfMissing('occurrenceDate', 'TEXT');
  await addColumnIfMissing('isOccurrenceOverride', 'INTEGER', '0');

  // Create indices for recurring queries
  await db.execute('CREATE INDEX IF NOT EXISTS idx_tasks_parent_template_id ON tasks(parentTemplateId)');
  await db.execute('CREATE INDEX IF NOT EXISTS idx_tasks_recurring_series_id ON tasks(recurringSeriesId)');
  await db.execute('CREATE INDEX IF NOT EXISTS idx_tasks_occurrence_date ON tasks(occurrenceDate)');
  await db.execute('CREATE INDEX IF NOT EXISTS idx_tasks_is_recurring_template ON tasks(isRecurringTemplate)');
}

async function migration9_unique_recurring_instances(db: Database): Promise<void> {
  // Prevent creating duplicate recurring instances for the same template on the same day.
  // We use a partial UNIQUE index so soft-deleted rows don't block future inserts.
  await db.execute(`
    CREATE UNIQUE INDEX IF NOT EXISTS ux_tasks_recurring_instance_unique
    ON tasks(parentTemplateId, occurrenceDate)
    WHERE deleted_at IS NULL
      AND parentTemplateId IS NOT NULL
      AND occurrenceDate IS NOT NULL
  `);
}

async function migration10_course_assets(db: Database): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS course_assets (
      id TEXT PRIMARY KEY,
      course_id TEXT,
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      content_type TEXT,
      file_size INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT,
      FOREIGN KEY (course_id) REFERENCES courses(id)
    )
  `);
  await db.execute('CREATE INDEX IF NOT EXISTS idx_course_assets_course_id ON course_assets(course_id)');
}

async function migration11_course_rules_and_profiles(db: Database): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS course_rules (
      id TEXT PRIMARY KEY,
      course_id TEXT NOT NULL,
      type TEXT NOT NULL,
      target TEXT NOT NULL,
      keep INTEGER NOT NULL,
      total INTEGER NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (course_id) REFERENCES courses(id)
    )
  `);
  await db.execute('CREATE INDEX IF NOT EXISTS idx_course_rules_course_id ON course_rules(course_id)');

  await db.execute(`
    CREATE TABLE IF NOT EXISTS course_profiles (
      course_id TEXT PRIMARY KEY,
      professor_name TEXT,
      professor_email TEXT,
      ta_names_emails TEXT,
      office_hours TEXT,
      learning_objectives TEXT,
      textbook_requirements TEXT,
      technical_requirements TEXT,
      attendance_rules TEXT,
      exam_pass_requirement TEXT,
      submission_policies TEXT,
      raw_extract TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (course_id) REFERENCES courses(id)
    )
  `);
}


require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const helmet = require('helmet');
const session = require('express-session');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');
const XLSX = require('xlsx');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const dataDir = path.join(__dirname, 'data');
fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(path.join(dataDir, 'mlk-results.db'));
db.pragma('journal_mode = WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS students (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_number TEXT NOT NULL UNIQUE,
  student_name TEXT NOT NULL,
  class_name TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_number TEXT NOT NULL,
  student_name TEXT NOT NULL,
  class_name TEXT NOT NULL DEFAULT '',
  term TEXT NOT NULL DEFAULT '',
  year TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL,
  mark REAL,
  grade TEXT NOT NULL DEFAULT '',
  teacher_comment TEXT NOT NULL DEFAULT '',
  class_position TEXT NOT NULL DEFAULT '',
  imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_results_student ON results(student_number);
`);

const adminUsername = process.env.ADMIN_USERNAME || 'admin';
const adminPassword = process.env.ADMIN_PASSWORD || 'Tasper@15';
const adminPasswordHash = bcrypt.hashSync(adminPassword, 12);

app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false }));
app.use(session({
  name: 'mlk.sid',
  secret: process.env.SESSION_SECRET || 'development-only-change-me-before-deploying',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 2 * 60 * 60 * 1000 }
}));
app.use('/api/login', rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.xlsx' || ext === '.xls') return cb(null, true);
    cb(new Error('Please upload an Excel workbook with .xlsx or .xls extension.'));
  }
});

function requireStudent(req, res, next) {
  if (req.session.user?.role !== 'student') return res.status(401).json({ error: 'Please sign in as a student or parent.' });
  next();
}
function requireAdmin(req, res, next) {
  if (req.session.user?.role !== 'admin') return res.status(401).json({ error: 'Administrator sign-in required.' });
  next();
}
function norm(value) { return String(value ?? '').trim(); }
function key(value) { return norm(value).toLowerCase().replace(/[ _-]/g, ''); }
function pick(row, ...names) {
  const keys = Object.keys(row);
  for (const name of names) {
    const found = keys.find(k => key(k) === key(name));
    if (found !== undefined) return row[found];
  }
  return '';
}

app.get('/api/session', (req, res) => {
  const u = req.session.user;
  res.json({ authenticated: !!u, user: u ? { role: u.role, studentName: u.studentName || '', studentNumber: u.studentNumber || '' } : null });
});

app.post('/api/login', async (req, res) => {
  const username = norm(req.body.username);
  const password = String(req.body.password || '');
  if (!username || !password) return res.status(400).json({ error: 'Enter your student number/administrator username and password.' });

  if (username.toLowerCase() === adminUsername.toLowerCase() && await bcrypt.compare(password, adminPasswordHash)) {
    req.session.user = { role: 'admin' };
    return res.json({ ok: true, role: 'admin', redirect: '/admin.html' });
  }
  const student = db.prepare('SELECT student_number, student_name, password_hash FROM students WHERE lower(student_number)=lower(?)').get(username);
  if (!student || !(await bcrypt.compare(password, student.password_hash))) {
    return res.status(401).json({ error: 'The details entered could not be verified. Check them and try again.' });
  }
  req.session.user = { role: 'student', studentNumber: student.student_number, studentName: student.student_name };
  res.json({ ok: true, role: 'student', redirect: '/' });
});

app.post('/api/logout', (req, res) => req.session.destroy(() => res.json({ ok: true })));

app.get('/api/my-results', requireStudent, (req, res) => {
  const rows = db.prepare(`SELECT student_name AS studentName, student_number AS studentNumber, class_name AS className,
    term, year, subject, mark, grade, teacher_comment AS teacherComment, class_position AS classPosition
    FROM results WHERE lower(student_number)=lower(?) ORDER BY year DESC, term, subject`).all(req.session.user.studentNumber);
  res.json({ student: { studentName: req.session.user.studentName, studentNumber: req.session.user.studentNumber }, results: rows });
});

app.get('/api/admin/summary', requireAdmin, (_req, res) => {
  const students = db.prepare('SELECT COUNT(*) AS n FROM students').get().n;
  const results = db.prepare('SELECT COUNT(*) AS n FROM results').get().n;
  const latest = db.prepare('SELECT MAX(imported_at) AS importedAt FROM results').get().importedAt;
  res.json({ students, results, latestImport: latest });
});

app.post('/api/admin/import', requireAdmin, upload.single('workbook'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Choose an Excel workbook first.' });
  let rows;
  try {
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: false });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  } catch (_err) {
    return res.status(400).json({ error: 'The workbook could not be read. Please check that it is a valid Excel file.' });
  }
  if (!rows.length) return res.status(400).json({ error: 'The first worksheet is empty.' });
  const required = ['StudentNumber', 'StudentName', 'Password', 'Class', 'Term', 'Year', 'Subject', 'Mark'];
  const sampleKeys = Object.keys(rows[0]).map(key);
  const missing = required.filter(r => !sampleKeys.includes(key(r)));
  if (missing.length) return res.status(400).json({ error: `Missing required column(s): ${missing.join(', ')}.` });

  const insertStudent = db.prepare(`INSERT INTO students (student_number, student_name, class_name, password_hash)
    VALUES (@studentNumber, @studentName, @className, @passwordHash)
    ON CONFLICT(student_number) DO UPDATE SET student_name=excluded.student_name, class_name=excluded.class_name, password_hash=excluded.password_hash`);
  const insertResult = db.prepare(`INSERT INTO results (student_number, student_name, class_name, term, year, subject, mark, grade, teacher_comment, class_position)
    VALUES (@studentNumber, @studentName, @className, @term, @year, @subject, @mark, @grade, @teacherComment, @classPosition)`);
  let imported = 0;
  const studentMap = new Map();
  try {
    const transaction = db.transaction(() => {
      // The starter replaces the results table contents on each import, preventing stale rows from remaining.
      db.prepare('DELETE FROM results').run();
      for (const row of rows) {
        const studentNumber = norm(pick(row, 'StudentNumber'));
        const studentName = norm(pick(row, 'StudentName'));
        const plainPassword = norm(pick(row, 'Password'));
        const className = norm(pick(row, 'Class'));
        const subject = norm(pick(row, 'Subject'));
        if (!studentNumber || !studentName || !plainPassword || !subject) continue;
        if (!studentMap.has(studentNumber.toLowerCase())) {
          studentMap.set(studentNumber.toLowerCase(), { studentNumber, studentName, className, passwordHash: bcrypt.hashSync(plainPassword, 10) });
        }
        const markRaw = pick(row, 'Mark');
        const mark = markRaw === '' || markRaw === null ? null : Number(markRaw);
        if (mark !== null && !Number.isFinite(mark)) throw new Error(`Invalid mark for ${studentNumber}, subject ${subject}.`);
        insertResult.run({ studentNumber, studentName, className, term: norm(pick(row, 'Term')), year: norm(pick(row, 'Year')), subject, mark,
          grade: norm(pick(row, 'Grade')), teacherComment: norm(pick(row, 'TeacherComment')), classPosition: norm(pick(row, 'ClassPosition')) });
        imported++;
      }
      for (const s of studentMap.values()) insertStudent.run(s);
    });
    transaction();
  } catch (err) {
    return res.status(400).json({ error: `Import failed: ${err.message}` });
  }
  res.json({ ok: true, importedRows: imported, studentAccounts: studentMap.size, message: `Imported ${imported} result rows for ${studentMap.size} student accounts.` });
});

app.use(express.static(path.join(__dirname, 'public')));
app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) return res.status(400).json({ error: 'Upload failed. Maximum workbook size is 10 MB.' });
  res.status(400).json({ error: err.message || 'Request could not be completed.' });
});
app.listen(PORT, () => console.log(`MLK Results Portal running at http://localhost:${PORT}`));

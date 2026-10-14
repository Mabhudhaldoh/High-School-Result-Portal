# Martin Luther King Jnr. Family of Schools — Online Results Portal

A student/parent results page, an administrator page, and a Node.js backend. It supports `.xlsx` and `.xls` Excel workbook imports.

Branding matches the school website (www.mlkschools.ac.zw): official logo, colours, motto, and contact details. The portal includes the school letterhead, contact address, telephone and website in the header, report card and footer.

## Printing and downloading report cards
After a student signs in, the report card offers two actions:
- **Print / Save as PDF** — opens the browser print dialog with an A4 print layout (letterhead, summary, signature lines, no page chrome). Choose "Save as PDF" as the destination to download a PDF.
- **Download PDF** — generates and downloads the PDF directly (`MLK_Report_<StudentNumber>_<Term>.pdf`) using the bundled library in `public/vendor/html2pdf.bundle.min.js` (from the `html2pdf.js` package).

The print layout is defined in the `@media print` block of `public/styles.css`; adjust margins/colours there if the school wants a different print look.

## Important before real use
- This is a starter, not a fully audited production system. Test with dummy records first.
- Use HTTPS in production, set a strong `SESSION_SECRET`, change the default admin credentials, and configure secure cookies in the hosting environment.
- Student passwords must be distributed securely. This starter's first import creates/updates student accounts using the workbook's `Password` column. Do not use student names alone as passwords.
- The server never places uploaded workbooks in the public folder. It stores imported result rows in SQLite.

## 1. Requirements
Install Node.js 20 LTS or newer from https://nodejs.org/.

## 2. Setup
1. Extract this ZIP into a folder.
2. Open PowerShell/Terminal in that folder.
3. Run `npm install`.
4. Copy `.env.example` to `.env` and change `SESSION_SECRET`, `ADMIN_USERNAME`, and `ADMIN_PASSWORD`.
5. Run `npm start`.
6. Open `http://localhost:3000` for students/parents or `http://localhost:3000/admin.html` for the administrator.

## Excel workbook format
Use one row per student per subject. Required columns (column names are case-insensitive):
- `StudentNumber`
- `StudentName` (surname first is recommended)
- `Password` (used to create/update the student's login password)
- `Class`
- `Term`
- `Year`
- `Subject`
- `Mark`
Optional columns: `TeacherComment`, `ClassPosition`, `Grade`.

Example:
| StudentNumber | StudentName | Password | Class | Term | Year | Subject | Mark | Grade | TeacherComment | ClassPosition |
|---|---|---|---|---|---|---|---:|---|---|---:|
| MLK001 | Moyo Tadiwa | TempPass92 | Form 2A | Term 1 | 2026 | Mathematics | 78 | B | Good progress | 4 |
| MLK001 | Moyo Tadiwa | TempPass92 | Form 2A | Term 1 | 2026 | English | 84 | A | Excellent work | 2 |

For privacy, keep the workbook and any passwords confidential. Ideally use unique temporary passwords and have students change them through a future password-change feature before production use.

## Routes
- `GET /api/session` — current session state
- `POST /api/login` — student or admin login
- `POST /api/logout` — logout
- `GET /api/my-results` — authenticated student's own results only
- `POST /api/admin/import` — admin-only Excel import
- `GET /api/admin/summary` — admin-only import summary

This starter intentionally does not include student self-registration or public search by student name/number.

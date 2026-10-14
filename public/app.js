const byId = (id) => document.getElementById(id);
const year = byId('year');
if (year) year.textContent = new Date().getFullYear();

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ---------------- login (students / parents) ---------------- */
const loginForm = byId('login-form');
if (loginForm) {
  const message = byId('login-message');
  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    message.className = 'message';
    message.textContent = 'Signing in…';
    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: byId('username').value.trim(), password: byId('password').value })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to sign in.');
      window.location.href = data.redirect || '/';
    } catch (error) {
      message.className = 'message error';
      message.textContent = error.message || 'Could not connect to the server.';
    }
  });
  byId('toggle-password').addEventListener('click', () => {
    const input = byId('password');
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    byId('toggle-password').textContent = show ? 'Hide' : 'Show';
  });
  fetch('/api/session')
    .then(r => r.json())
    .then(data => { if (data.authenticated && data.user?.role === 'student') renderResults(data.user); })
    .catch(() => {});
}

/* ---------------- report card ---------------- */
const GRADE_SCALE = [
  { min: 80, grade: 'A', label: 'A · Outstanding (80–100)' },
  { min: 70, grade: 'B', label: 'B · Very Good (70–79)' },
  { min: 60, grade: 'C', label: 'C · Good (60–69)' },
  { min: 50, grade: 'D', label: 'D · Satisfactory (50–59)' },
  { min: 40, grade: 'E', label: 'E · Pass (40–49)' },
  { min: 0,  grade: 'U', label: 'U · Fail (below 40)' }
];
function gradeFor(mark) {
  const n = Number(mark);
  if (!Number.isFinite(n)) return '—';
  return GRADE_SCALE.find(s => n >= s.min).grade;
}
function averageOf(marks) {
  const valid = marks.map(Number).filter(Number.isFinite);
  if (!valid.length) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}
function overallRemark(avg) {
  if (avg === null) return 'No marks were recorded for this reporting period. Please contact the school administration.';
  if (avg >= 80) return 'Outstanding performance. Keep up the excellent discipline and hard work.';
  if (avg >= 70) return 'Very good performance. Continued effort will bring even better results.';
  if (avg >= 60) return 'Good performance with steady progress. Focus on weaker subjects to move higher.';
  if (avg >= 50) return 'Satisfactory performance. Regular revision and extra practice are strongly advised.';
  if (avg >= 40) return 'Fair performance. More commitment to study and teacher support is needed this term.';
  return 'Unsatisfactory performance. Serious remedial work and close parental support are required.';
}

async function renderResults(user) {
  const main = document.querySelector('main');
  if (!main) return;
  try {
    const response = await fetch('/api/my-results');
    if (response.status === 401) return;
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Unable to load results.');

    const studentName = data.student.studentName || user.studentName || '';
    const studentNumber = data.student.studentNumber || user.studentNumber || '';
    const groups = groupTerms(data.results);
    const className = data.results[0]?.className || '—';

    main.innerHTML = `
      <section class="results-toolbar no-print">
        <div>
          <span class="section-kicker">Official academic report</span>
          <h2>Welcome, ${escapeHtml(studentName)}</h2>
          <p class="muted">Student number: <strong>${escapeHtml(studentNumber)}</strong> · Class: <strong>${escapeHtml(className)}</strong></p>
        </div>
        <div class="toolbar-actions">
          <button class="secondary-button" id="print-report" type="button">⎙ Print / Save as PDF</button>
          <button class="primary-button gold-button" id="download-report" type="button">⭳ Download PDF</button>
          <button class="ghost-button" id="results-logout" type="button">Sign out</button>
        </div>
      </section>

      <article class="report-card" id="report-card">
        <header class="report-head">
          <img class="report-logo" src="/school-logo.png" alt="MLK school logo">
          <div>
            <h1>Martin Luther King Jnr. Family of Schools</h1>
            <p class="report-division">High School · Student Academic Report Card</p>
            <p class="report-motto">“Quality Education to the Total Person for the Whole Nation.”</p>
            <p class="report-contact">Warren Park 1, Along Bulawayo Road, Harare, Zimbabwe · +263 772 275 046 · www.mlkschools.ac.zw</p>
          </div>
          <span class="report-badge">OFFICIAL</span>
        </header>

        <div class="report-body">
          <section class="report-meta">
            <div class="meta-item"><span>Learner name</span><strong>${escapeHtml(studentName)}</strong></div>
            <div class="meta-item"><span>Student number</span><strong>${escapeHtml(studentNumber)}</strong></div>
            <div class="meta-item"><span>Class</span><strong>${escapeHtml(className)}</strong></div>
            <div class="meta-item"><span>Reporting period</span><strong>${escapeHtml(groups.map(g => g.label).join(' · ') || '—')}</strong></div>
            <div class="meta-item"><span>Subjects</span><strong>${new Set(data.results.map(r => r.subject)).size}</strong></div>
            <div class="meta-item"><span>Date issued</span><strong>${escapeHtml(new Date().toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }))}</strong></div>
          </section>

          ${groups.length ? groups.map(renderTerm).join('') : '<p class="empty-results">No results have been published to your account yet. Please contact the school administration.</p>'}

          ${groups.length ? `
          <div class="grade-legend">
            ${GRADE_SCALE.map(s => `<span><b>${escapeHtml(s.label.split(' · ')[0])}</b> ${escapeHtml(s.label.split(' · ')[1])}</span>`).join('')}
            <span><b>Note:</b> grade shown where the school workbook did not supply one.</span>
          </div>
          <div class="overall-remark">
            <span>Overall form tutor remark</span>
            <p>${escapeHtml(overallRemark(averageOf(data.results.map(r => r.mark))))}</p>
          </div>` : ''}

          <section class="signatures">
            <div class="signature"><div class="sig-line"></div><p><strong>Class Teacher</strong>Date: ______________</p></div>
            <div class="signature"><div class="sig-line"></div><p><strong>Head of Department</strong>Date: ______________</p></div>
            <div class="signature"><div class="sig-line"></div><p><strong>Headmaster</strong>Date: ______________</p></div>
          </section>

          <div class="report-foot">
            <span>Generated ${escapeHtml(new Date().toLocaleString())} · MLK Results Portal</span>
            <span>Verify authenticity with the school office · www.mlkschools.ac.zw</span>
          </div>
        </div>
      </article>

      <p class="report-disclaimer">This report is confidential. If any information appears incorrect, contact the school administration.</p>`;

    byId('results-logout').addEventListener('click', logout);
    byId('print-report').addEventListener('click', () => window.print());
    byId('download-report').addEventListener('click', downloadReportPdf);
  } catch (error) {
    main.insertAdjacentHTML('beforeend', `<p class="message error">${escapeHtml(error.message)}</p>`);
  }
}

function groupTerms(results) {
  const groups = new Map();
  results.forEach(r => {
    const label = `${r.term || 'Term'} ${r.year || ''}`.trim();
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(r);
  });
  return [...groups.entries()].map(([label, rows]) => ({ label, rows }));
}

function renderTerm(group) {
  const { label, rows } = group;
  const avg = averageOf(rows.map(r => r.mark));
  const marks = rows.map(r => Number(r.mark)).filter(Number.isFinite);
  const best = marks.length ? Math.max(...marks) : null;
  const position = rows.find(r => r.classPosition)?.classPosition || '';
  const className = rows.find(r => r.className)?.className || '';

  return `
    <section class="term-block">
      <div class="term-head">
        <h3>${escapeHtml(label)}</h3>
        ${className ? `<span class="term-chip">Class ${escapeHtml(className)}</span>` : ''}
      </div>
      <div class="table-scroll">
        <table class="results-table">
          <thead>
            <tr><th class="num" style="width:46px">#</th><th>Subject</th><th class="num" style="width:80px">Mark</th><th class="num" style="width:74px">Grade</th><th class="num" style="width:86px">Position</th><th>Teacher's remark</th></tr>
          </thead>
          <tbody>
            ${rows.map((r, i) => {
              const mark = r.mark === null || r.mark === undefined || r.mark === '' ? null : Math.round(Number(r.mark));
              const grade = (r.grade && String(r.grade).trim()) || gradeFor(mark);
              const gradeClass = String(grade).trim().charAt(0).toUpperCase();
              return `<tr>
                <td class="num rank-pill">${i + 1}</td>
                <td><strong>${escapeHtml(r.subject)}</strong></td>
                <td class="num mark-cell">${mark === null ? '—' : escapeHtml(mark)}</td>
                <td class="num"><span class="grade-badge grade-${escapeHtml(gradeClass)}">${escapeHtml(grade)}</span></td>
                <td class="num">${r.classPosition ? `<span class="rank-pill">${escapeHtml(r.classPosition)}</span>` : '—'}</td>
                <td class="remark ${r.teacherComment ? '' : 'empty'}">${escapeHtml(r.teacherComment || 'No remark recorded')}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
      <div class="term-summary">
        <div class="summary-card highlight"><span>Average</span><strong>${avg === null ? '—' : Math.round(avg) + '%'}</strong></div>
        <div class="summary-card"><span>Overall grade</span><strong>${escapeHtml(avg === null ? '—' : gradeFor(avg))}</strong></div>
        <div class="summary-card"><span>Highest mark</span><strong>${best === null ? '—' : best}</strong></div>
        <div class="summary-card"><span>Class position</span><strong>${position ? escapeHtml(position) : '—'}</strong></div>
      </div>
    </section>`;
}

/* ---------------- PDF download (client-side) ---------------- */
function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (window.html2pdf) return resolve();
    const script = document.createElement('script');
    script.src = src;
    script.onload = () => (window.html2pdf ? resolve() : reject(new Error('PDF library failed to load.')));
    script.onerror = () => reject(new Error('PDF library could not be downloaded.'));
    document.head.appendChild(script);
  });
}

async function downloadReportPdf() {
  const button = byId('download-report');
  const card = byId('report-card');
  if (!card) return;
  const original = button.textContent;
  try {
    button.classList.add('pdf-busy');
    button.textContent = 'Preparing PDF…';
    await loadScript('/vendor/html2pdf.bundle.min.js');
    if (document.fonts?.ready) await document.fonts.ready;

    const meta = [...card.querySelectorAll('.meta-item')];
    const valueOf = label => meta.find(m => m.querySelector('span')?.textContent.toLowerCase().includes(label))?.querySelector('strong')?.textContent || '';
    const studentNumber = (valueOf('student number') || 'student').replace(/[^A-Za-z0-9-]/g, '') || 'student';
    const period = (card.querySelector('.term-head h3')?.textContent || 'report').replace(/[^A-Za-z0-9]+/g, '-');

    await window.html2pdf().set({
      margin: [8, 8, 10, 8],
      filename: `MLK_Report_${studentNumber}_${period}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff', windowWidth: 1120 },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['css', 'legacy'], avoid: ['.term-block', '.signatures', '.report-meta'] }
    }).from(card).save();
  } catch (error) {
    alert(`${error.message || 'Could not create the PDF.'}\n\nTip: you can also use “Print / Save as PDF” and choose “Save as PDF” in the print dialog.`);
  } finally {
    button.classList.remove('pdf-busy');
    button.textContent = original;
  }
}

async function logout() {
  try { await fetch('/api/logout', { method: 'POST' }); } finally { window.location.href = '/'; }
}

/* ---------------- administrator ---------------- */
const adminLogin = byId('admin-login-form');
if (adminLogin) {
  adminLogin.addEventListener('submit', async (event) => {
    event.preventDefault();
    const msg = byId('admin-login-message');
    msg.className = 'message';
    msg.textContent = 'Signing in…';
    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: byId('admin-username').value.trim(), password: byId('admin-password').value })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Sign-in failed.');
      if (data.role !== 'admin') throw new Error('This page is for administrators. Use the student portal for student accounts.');
      await showDashboard();
    } catch (error) {
      msg.className = 'message error';
      msg.textContent = error.message || 'Could not connect to server.';
    }
  });

  byId('workbook').addEventListener('change', () => {
    byId('file-name').textContent = byId('workbook').files[0]?.name || 'Choose a workbook to upload';
  });

  byId('import-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const msg = byId('import-message');
    msg.className = 'message';
    msg.textContent = 'Uploading and checking workbook…';
    try {
      const form = new FormData();
      form.append('workbook', byId('workbook').files[0]);
      const response = await fetch('/api/admin/import', { method: 'POST', body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Import failed.');
      msg.className = 'message success';
      msg.textContent = data.message;
      byId('workbook').value = '';
      byId('file-name').textContent = 'Choose a workbook to upload';
      await loadSummary();
    } catch (error) {
      msg.className = 'message error';
      msg.textContent = error.message || 'Could not connect to server.';
    }
  });

  byId('logout-button').addEventListener('click', logout);
  fetch('/api/session')
    .then(r => r.json())
    .then(data => { if (data.authenticated && data.user?.role === 'admin') showDashboard(); })
    .catch(() => {});
}

async function showDashboard() {
  byId('admin-login-panel')?.classList.add('hidden');
  byId('admin-dashboard')?.classList.remove('hidden');
  await loadSummary();
}

async function loadSummary() {
  try {
    const response = await fetch('/api/admin/summary');
    if (response.status === 401) return;
    const data = await response.json();
    byId('student-count').textContent = data.students;
    byId('result-count').textContent = data.results;
    byId('last-import').textContent = data.latestImport ? new Date(data.latestImport + 'Z').toLocaleString() : 'Not yet imported';
  } catch (_error) {}
}

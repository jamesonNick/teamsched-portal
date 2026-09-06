const SUPABASE_URL = 'https://kheaochbnwfkmjwnyjpf.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtoZWFvY2hibndma21qd255anBmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg2MDIxNjAsImV4cCI6MjEwNDE3ODE2MH0.4DdYobqvoWR8cBpe_bC160-kSTEAI2lSlyh4h8kHtq8';
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let globalEmployees = [];
let globalSchedules = [];

function getCurrentYearMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
}

function getMonthDates(yearMonth) {
  const [year, month] = yearMonth.split('-').map(Number);
  const totalDays = new Date(year, month, 0).getDate();

  return Array.from({length: totalDays}, (_, i) => {
    const dayNum = (i + 1).toString().padStart(2, '0');
    const dateStr = `${yearMonth}-${dayNum}`;
    const dateObj = new Date(dateStr);
    const dayOfWeek = dateObj.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
    return { dateStr, dayNum, dayName, isWeekend };
  });
}

function getBadgeClass(status, isWeekend) {
  if (isWeekend) return 'badge-weekend';
  if (status === 'WFO') return 'badge-wfo';
  if (status?.startsWith('VL')) return 'badge-vl';
  if (status?.startsWith('SL')) return 'badge-sl';
  if (status === 'HOLIDAY') return 'badge-holiday';
  return 'badge-wfh';
}

// Session & Login
async function checkSession() {
  const { data: { session } } = await db.auth.getSession();
  if (!session) {
    document.getElementById('loginModal').classList.remove('hidden');
  } else {
    document.getElementById('loginModal').classList.add('hidden');
    initAdminMatrix();
    checkRequestsCount();
  }
}

async function handleLogin() {
  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;

  const { data, error } = await db.auth.signInWithPassword({ email, password });

  if (error) {
    alert('Login Failed: ' + error.message);
  } else {
    document.getElementById('loginModal').classList.add('hidden');
    initAdminMatrix();
    checkRequestsCount();
  }
}

async function handleLogout() {
  await db.auth.signOut();
  location.reload();
}

// Matrix Initialization
async function initAdminMatrix() {
  const head = document.getElementById('adminMatrixHead');
  const body = document.getElementById('adminMatrixBody');
  if (!head || !body) return;

  const monthVal = document.getElementById('adminMonthPicker')?.value || getCurrentYearMonth();
  const fullMonthDates = getMonthDates(monthVal);

  const searchVal = document.getElementById('searchInput')?.value.toLowerCase() || '';
  const teamVal = document.getElementById('teamFilter')?.value || 'ALL';
  const sortVal = document.getElementById('sortOrder')?.value || 'ASC';

  let headHTML = `<tr><th class="p-2 border-r bg-slate-900 sticky left-0 z-20 min-w-[180px]">EMPLOYEE NAME</th><th class="p-2 border-r bg-slate-900 min-w-[120px]">TEAM</th><th class="p-2 border-r bg-slate-900 min-w-[60px] text-center">ACTION</th>`;
  fullMonthDates.forEach(d => {
    const bgClass = d.isWeekend ? 'bg-slate-700 text-slate-400' : 'bg-amber-400 text-slate-900 font-extrabold';
    headHTML += `<th class="p-1 text-center border-r min-w-[65px] ${bgClass}"><div class="text-[9px] uppercase">${d.dayName}</div><div>${d.dayNum}</div></th>`;
  });
  head.innerHTML = headHTML + `</tr>`;

  let { data: employees } = await db.from('employees').select('*');
  const { data: schedules } = await db.from('schedules').select('*');

  globalEmployees = employees || [];
  globalSchedules = schedules || [];

  if (sortVal === 'ASC') {
    globalEmployees.sort((a, b) => a.name.localeCompare(b.name));
  } else {
    globalEmployees.sort((a, b) => b.name.localeCompare(a.name));
  }

  updateAdminKpis(monthVal);

  let filtered = globalEmployees.filter(emp => {
    const matchesSearch = emp.name.toLowerCase().includes(searchVal);
    const matchesTeam = teamVal === 'ALL' || emp.team === teamVal;
    return matchesSearch && matchesTeam;
  });

  body.innerHTML = filtered.map(emp => {
    let rowHTML = `<tr class="hover:bg-slate-50"><td class="p-2 border-r font-bold text-slate-800 sticky left-0 bg-white shadow-sm">${emp.name}</td><td class="p-2 border-r text-slate-500 font-medium">${emp.team}</td><td class="p-2 border-r text-center"><button onclick="openEditEmpModal(${emp.id}, '${emp.name.replace(/'/g, "\\'")}', '${emp.team}')" class="bg-indigo-100 hover:bg-indigo-200 text-indigo-700 font-bold px-2 py-0.5 rounded text-[10px]">Edit</button></td>`;
    
    fullMonthDates.forEach(d => {
      if (d.isWeekend) {
        rowHTML += `<td class="p-1 border-r text-center bg-slate-100"></td>`;
      } else {
        const sched = globalSchedules.find(s => s.employee_id === emp.id && s.date === d.dateStr);
        const status = sched ? sched.status : 'WFH';
        
        rowHTML += `
          <td class="p-1 border-r text-center">
            <select onchange="updateStatus(${emp.id}, '${d.dateStr}', this.value)" class="text-[10px] font-bold p-1 rounded w-full border text-center cursor-pointer ${getBadgeClass(status, false)}">
              <option value="WFH" ${status === 'WFH' ? 'selected' : ''}>WFH</option>
              <option value="WFO" ${status === 'WFO' ? 'selected' : ''}>WFO</option>
              <option value="VL" ${status === 'VL' ? 'selected' : ''}>VL</option>
              <option value="VL (AM)" ${status === 'VL (AM)' ? 'selected' : ''}>VL (AM)</option>
              <option value="VL (PM)" ${status === 'VL (PM)' ? 'selected' : ''}>VL (PM)</option>
              <option value="SL" ${status === 'SL' ? 'selected' : ''}>SL</option>
              <option value="SL (AM)" ${status === 'SL (AM)' ? 'selected' : ''}>SL (AM)</option>
              <option value="SL (PM)" ${status === 'SL (PM)' ? 'selected' : ''}>SL (PM)</option>
              <option value="HOLIDAY" ${status === 'HOLIDAY' ? 'selected' : ''}>HOLIDAY</option>
            </select>
          </td>
        `;
      }
    });

    return rowHTML + `</tr>`;
  }).join('');
}

async function updateStatus(employeeId, dateStr, newStatus) {
  const { error } = await db.from('schedules').upsert(
    { employee_id: employeeId, date: dateStr, status: newStatus },
    { onConflict: 'employee_id,date' }
  );

  if (error) {
    alert('Failed to update: ' + error.message);
  } else {
    const existingIndex = globalSchedules.findIndex(s => s.employee_id === employeeId && s.date === dateStr);
    if (existingIndex > -1) {
      globalSchedules[existingIndex].status = newStatus;
    } else {
      globalSchedules.push({ employee_id: employeeId, date: dateStr, status: newStatus });
    }
    const monthVal = document.getElementById('adminMonthPicker')?.value || getCurrentYearMonth();
    updateAdminKpis(monthVal);
  }
}

function updateAdminKpis(selectedMonth) {
  document.getElementById('adminKpiTotal').innerText = globalEmployees.length;

  const monthScheds = globalSchedules.filter(s => s.date.startsWith(selectedMonth));

  const totalLeaves = monthScheds.filter(s => {
    const st = s.status || '';
    return st.startsWith('VL') || st.startsWith('SL');
  }).length;

  document.getElementById('adminKpiLeaves').innerText = totalLeaves;
  document.getElementById('adminKpiHolidays').innerText = new Set(monthScheds.filter(s => s.status === 'HOLIDAY').map(s => s.date)).size;
}

// Bulk Actions
function toggleBulkInputMode() {
  const mode = document.getElementById('bulkMode').value;
  const dayCont = document.getElementById('bulkDayContainer');
  const weekCont = document.getElementById('bulkWeekContainer');

  if (mode === 'DAY') {
    dayCont.classList.remove('hidden');
    weekCont.classList.add('hidden');
  } else if (mode === 'WEEK') {
    dayCont.classList.add('hidden');
    weekCont.classList.remove('hidden');
  } else {
    dayCont.classList.add('hidden');
    weekCont.classList.add('hidden');
  }
}

async function applyBulkStatus() {
  const mode = document.getElementById('bulkMode').value;
  const status = document.getElementById('bulkStatusInput').value;
  const monthVal = document.getElementById('adminMonthPicker').value || getCurrentYearMonth();
  
  let targetDates = [];

  if (mode === 'DAY') {
    const dateVal = document.getElementById('bulkDateInput').value;
    if (!dateVal) return alert('Please select a date.');
    targetDates.push(dateVal);
  } else if (mode === 'WEEK') {
    const weekVal = document.getElementById('bulkWeekInput').value;
    if (!weekVal) return alert('Please select week starting date.');
    let start = new Date(weekVal);
    for (let i = 0; i < 5; i++) {
      let d = new Date(start);
      d.setDate(start.getDate() + i);
      targetDates.push(d.toISOString().split('T')[0]);
    }
  } else if (mode === 'MONTH') {
    const monthDates = getMonthDates(monthVal);
    targetDates = monthDates.filter(d => !d.isWeekend).map(d => d.dateStr);
  }

  if (!confirm(`Apply status "${status}" to ALL employees for ${targetDates.length} date(s)?`)) return;

  let payload = [];
  globalEmployees.forEach(emp => {
    targetDates.forEach(date => {
      payload.push({ employee_id: emp.id, date, status });
    });
  });

  const { error } = await db.from('schedules').upsert(payload, { onConflict: 'employee_id,date' });

  if (error) {
    alert('Bulk edit failed: ' + error.message);
  } else {
    alert('Bulk schedule applied successfully!');
    initAdminMatrix();
  }
}

// Employee Modals
function addNewEmployee() { document.getElementById('addEmpModal').classList.remove('hidden'); }
function closeAddEmpModal() { document.getElementById('addEmpModal').classList.add('hidden'); }

async function submitNewEmployee() {
  const name = document.getElementById('addEmpName').value;
  const team = document.getElementById('addEmpTeam').value;
  if (!name) return alert('Please enter employee name.');

  const { error } = await db.from('employees').insert([{ name, team }]);
  if (error) {
    alert('Error adding employee: ' + error.message);
  } else {
    closeAddEmpModal();
    initAdminMatrix();
  }
}

function openEditEmpModal(id, name, team) {
  document.getElementById('editEmpId').value = id;
  document.getElementById('editEmpName').value = name;
  document.getElementById('editEmpTeam').value = team;
  document.getElementById('editEmpModal').classList.remove('hidden');
}

function closeEditEmpModal() { document.getElementById('editEmpModal').classList.add('hidden'); }

async function submitEditEmployee() {
  const id = document.getElementById('editEmpId').value;
  const name = document.getElementById('editEmpName').value;
  const team = document.getElementById('editEmpTeam').value;

  const { error } = await db.from('employees').update({ name, team }).eq('id', id);
  if (error) {
    alert('Update failed: ' + error.message);
  } else {
    closeEditEmpModal();
    initAdminMatrix();
  }
}

// Requests Inbox
async function checkRequestsCount() {
  const { data: requests } = await db.from('requests').select('id');
  const badge = document.getElementById('requestBadge');
  if (badge && requests && requests.length > 0) {
    badge.innerText = requests.length;
    badge.classList.remove('hidden');
  } else if (badge) {
    badge.classList.add('hidden');
  }
}

async function openRequestsModal() {
  document.getElementById('requestsModal').classList.remove('hidden');
  const list = document.getElementById('requestsList');
  list.innerHTML = '<tr><td colspan="5" class="p-3 text-center text-slate-400">Loading requests...</td></tr>';

  const { data: requests, error } = await db.from('requests').select('*').order('id', { ascending: false });

  if (error || !requests || requests.length === 0) {
    list.innerHTML = '<tr><td colspan="5" class="p-3 text-center text-slate-400">No pending leave requests.</td></tr>';
    return;
  }

  list.innerHTML = requests.map(req => `
    <tr class="hover:bg-slate-50">
      <td class="p-2 font-bold text-slate-800">${req.employee_name}</td>
      <td class="p-2 text-slate-600">${req.date}</td>
      <td class="p-2"><span class="bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-bold text-[10px]">${req.request_type}</span></td>
      <td class="p-2 text-slate-500 italic">${req.message || '-'}</td>
      <td class="p-2 text-center"><button onclick="deleteRequest(${req.id})" class="bg-rose-100 hover:bg-rose-200 text-rose-700 font-bold px-2 py-0.5 rounded text-[10px]">Dismiss</button></td>
    </tr>
  `).join('');
}

async function deleteRequest(reqId) {
  await db.from('requests').delete().eq('id', reqId);
  openRequestsModal();
  checkRequestsCount();
}

async function clearAllRequests() {
  if (!confirm('Clear all inbox requests?')) return;
  await db.from('requests').delete().neq('id', 0);
  openRequestsModal();
  checkRequestsCount();
}

function closeRequestsModal() { document.getElementById('requestsModal').classList.add('hidden'); }

window.addEventListener('DOMContentLoaded', () => {
  const picker = document.getElementById('adminMonthPicker');
  if (picker) picker.value = getCurrentYearMonth();
  checkSession();
});

const SUPABASE_URL = 'https://kheaochbnwfkmjwnyjpf.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtoZWFvY2hibndma21qd255anBmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg2MDIxNjAsImV4cCI6MjEwNDE3ODE2MH0.4DdYobqvoWR8cBpe_bC160-kSTEAI2lSlyh4h8kHtq8';
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let globalEmployees = [];
let globalSchedules = [];

function getCurrentYearMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
}

function getTodayDateStr() {
  const now = new Date();
  const year = now.getFullYear();
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const day = now.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
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

async function checkAdminAuth() {
  const { data: { session } } = await db.auth.getSession();
  
  if (!session) {
    const modal = document.getElementById('loginModal');
    if (modal) modal.classList.remove('hidden');
    return false;
  }

  const { data: profile } = await db.from('profiles').select('role').eq('id', session.user.id).single();
  if (!profile || profile.role !== 'admin') {
    alert('Access denied. Admin privileges required.');
    await db.auth.signOut();
    window.location.href = 'index.html';
    return false;
  }

  const modal = document.getElementById('loginModal');
  if (modal) modal.classList.add('hidden');
  return true;
}

async function handleLogin() {
  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;

  const { error } = await db.auth.signInWithPassword({ email, password });
  if (error) {
    alert('Authentication failed: ' + error.message);
  } else {
    const isAuth = await checkAdminAuth();
    if (isAuth) {
      initAdminMatrix();
      loadRequests();
    }
  }
}

async function handleLogout() {
  await db.auth.signOut();
  window.location.href = 'login.html';
}

async function initAdminMatrix() {
  const isAuth = await checkAdminAuth();
  if (!isAuth) return;

  const head = document.getElementById('adminMatrixHead');
  const body = document.getElementById('adminMatrixBody');
  if (!head || !body) return;

  const monthVal = document.getElementById('adminMonthPicker')?.value || getCurrentYearMonth();
  const fullMonthDates = getMonthDates(monthVal);

  const searchVal = document.getElementById('searchInput')?.value.toLowerCase() || '';
  const teamVal = document.getElementById('teamFilter')?.value || 'ALL';
  const sortVal = document.getElementById('sortOrder')?.value || 'ASC';

  let headHTML = `<tr><th class="p-2 border-r bg-slate-900 sticky left-0 z-20 min-w-[180px]">EMPLOYEE NAME</th><th class="p-2 border-r bg-slate-900 min-w-[100px]">TEAM</th>`;
  fullMonthDates.forEach(d => {
    const bgClass = d.isWeekend ? 'bg-slate-700 text-slate-400' : 'bg-amber-400 text-slate-900 font-bold';
    headHTML += `<th class="p-1 text-center border-r min-w-[65px] ${bgClass}"><div class="text-[9px] uppercase">${d.dayName}</div><div>${d.dayNum}</div></th>`;
  });
  head.innerHTML = headHTML + `<th class="p-2 text-center bg-slate-900 sticky right-0 z-20 min-w-[80px]">ACTION</th></tr>`;

  let { data: employees } = await db.from('employees').select('*');
  const { data: schedules } = await db.from('schedules').select('*');

  if (!employees) return;

  globalEmployees = employees;
  globalSchedules = schedules || [];

  updateAdminKpis(monthVal);

  employees = employees.filter(emp => {
    const matchesSearch = emp.name.toLowerCase().includes(searchVal);
    const matchesTeam = teamVal === 'ALL' || emp.team === teamVal;
    return matchesSearch && matchesTeam;
  });

  employees.sort((a, b) => sortVal === 'ASC' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name));

  body.innerHTML = employees.map(emp => {
    let rowHTML = `<tr><td class="p-2 border-r font-bold text-slate-800 sticky left-0 bg-white shadow-sm">${emp.name}</td><td class="p-2 border-r text-slate-500">${emp.team}</td>`;

    fullMonthDates.forEach(d => {
      if (d.isWeekend) {
        rowHTML += `<td class="p-1 border-r text-center bg-slate-100"></td>`;
      } else {
        const sched = globalSchedules.find(s => s.employee_id === emp.id && s.date === d.dateStr);
        const status = sched ? sched.status : 'WFH';
        rowHTML += `
          <td class="p-1 border-r text-center">
            <select onchange="handleDropdownChange(this, ${emp.id}, '${d.dateStr}')" class="text-[9px] font-bold p-1 rounded border ${getBadgeClass(status, false)} outline-none">
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
          </td>`;
      }
    });

    return rowHTML + `
      <td class="p-1 text-center bg-white sticky right-0 shadow-sm flex items-center justify-center gap-1">
        <button onclick="openEditEmpModal(${emp.id}, '${emp.name.replace(/'/g, "\\'")}', '${emp.team}')" class="text-indigo-600 font-bold hover:bg-indigo-50 p-1.5 rounded-lg transition text-xs" title="Edit Employee">✏️</button>
        <button onclick="deleteEmployee(${emp.id})" class="text-rose-600 font-bold hover:bg-rose-50 p-1.5 rounded-lg transition text-xs" title="Delete Employee">🗑️</button>
      </td>
    </tr>`;
  }).join('');
}

function updateAdminKpis(selectedMonth) {
  const monthScheds = globalSchedules.filter(s => s.date.startsWith(selectedMonth));
  const totalElem = document.getElementById('adminKpiTotal');
  const leavesElem = document.getElementById('adminKpiLeaves');
  const holidaysElem = document.getElementById('adminKpiHolidays');

  if (totalElem) totalElem.innerText = globalEmployees.length;
  if (leavesElem) leavesElem.innerText = monthScheds.filter(s => s.status?.startsWith('VL') || s.status?.startsWith('SL')).length;
  if (holidaysElem) holidaysElem.innerText = new Set(monthScheds.filter(s => s.status === 'HOLIDAY').map(s => s.date)).size;
}

async function handleDropdownChange(selectElem, empId, date) {
  const newStatus = selectElem.value;
  
  if (!confirm(`Confirm schedule update to "${newStatus}" for date ${date}?`)) {
    initAdminMatrix();
    return;
  }

  selectElem.className = `text-[9px] font-bold p-1 rounded border ${getBadgeClass(newStatus, false)} outline-none`;

  const { error } = await db.from('schedules').upsert({ employee_id: empId, date: date, status: newStatus }, { onConflict: 'employee_id,date' });
  if (error) {
    alert('Error saving: ' + error.message);
    initAdminMatrix();
  } else {
    const monthVal = document.getElementById('adminMonthPicker').value;
    const { data: schedules } = await db.from('schedules').select('*');
    globalSchedules = schedules || [];
    updateAdminKpis(monthVal);
  }
}

function openEditEmpModal(id, name, team) {
  document.getElementById('editEmpId').value = id;
  document.getElementById('editEmpName').value = name;
  document.getElementById('editEmpTeam').value = team;
  document.getElementById('editEmpModal').classList.remove('hidden');
}

function closeEditEmpModal() {
  document.getElementById('editEmpModal').classList.add('hidden');
}

async function submitEditEmployee() {
  const id = document.getElementById('editEmpId').value;
  const name = document.getElementById('editEmpName').value;
  const team = document.getElementById('editEmpTeam').value;

  if (!name) return alert('Please enter employee name.');

  const { error } = await db.from('employees').update({ name, team }).eq('id', id);

  if (error) {
    alert('Failed to update employee: ' + error.message);
  } else {
    alert('Employee updated successfully!');
    closeEditEmpModal();
    initAdminMatrix();
  }
}

function toggleBulkInputMode() {
  const mode = document.getElementById('bulkMode').value;
  document.getElementById('bulkDayContainer').classList.toggle('hidden', mode !== 'DAY');
  document.getElementById('bulkWeekContainer').classList.toggle('hidden', mode !== 'WEEK');
}

async function applyBulkStatus() {
  const mode = document.getElementById('bulkMode').value;
  const statusVal = document.getElementById('bulkStatusInput').value;
  const monthVal = document.getElementById('adminMonthPicker').value;

  let targetDates = [];

  if (mode === 'DAY') {
    const dayVal = document.getElementById('bulkDateInput').value;
    if (!dayVal) return alert('Select a target date.');
    targetDates.push(dayVal);
  } else if (mode === 'WEEK') {
    const weekStart = document.getElementById('bulkWeekInput').value;
    if (!weekStart) return alert('Select Monday start date.');
    for (let i = 0; i < 5; i++) {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      targetDates.push(d.toISOString().split('T')[0]);
    }
  } else if (mode === 'MONTH') {
    targetDates = getMonthDates(monthVal).filter(d => !d.isWeekend).map(d => d.dateStr);
  }

  const { data: latestEmployees } = await db.from('employees').select('*');
  if (latestEmployees && latestEmployees.length > 0) {
    globalEmployees = latestEmployees;
  }

  if (!confirm(`Apply "${statusVal}" to ALL ${globalEmployees.length} employee(s) across ${targetDates.length} date(s)?`)) return;

  let records = [];
  globalEmployees.forEach(emp => {
    targetDates.forEach(date => {
      records.push({ employee_id: emp.id, date, status: statusVal });
    });
  });

  const { error } = await db.from('schedules').upsert(records, { onConflict: 'employee_id,date' });

  if (error) {
    alert('Bulk apply error: ' + error.message);
  } else {
    alert(`Applied ${statusVal} successfully!`);
    await initAdminMatrix();
  }
}

async function loadRequests() {
  const badge = document.getElementById('requestBadge');
  const list = document.getElementById('requestsList');

  const { data: requests, error } = await db.from('requests').select('*').order('created_at', { ascending: false });

  if (error || !requests || requests.length === 0) {
    if (badge) badge.classList.add('hidden');
    if (list) list.innerHTML = `<tr><td colspan="5" class="p-3 text-center text-slate-400">No pending requests found.</td></tr>`;
    return;
  }

  if (badge) {
    badge.innerText = requests.length;
    badge.classList.remove('hidden');
  }

  if (list) {
    list.innerHTML = requests.map(r => `
      <tr class="hover:bg-slate-50">
        <td class="p-2 font-bold text-slate-800">${r.employee_name}</td>
        <td class="p-2 text-slate-600">${r.date}</td>
        <td class="p-2 font-bold text-indigo-600">${r.request_type}</td>
        <td class="p-2 text-slate-500">${r.message || 'N/A'}</td>
        <td class="p-2 text-center">
          <button onclick="deleteSingleRequest(${r.id})" class="bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold px-2 py-1 rounded transition text-[10px]" title="Clear Request">Clear 🗑️</button>
        </td>
      </tr>
    `).join('');
  }
}

async function deleteSingleRequest(id) {
  if (!confirm('Mark this request as resolved/cleared?')) return;

  const { error } = await db.from('requests').delete().eq('id', id);

  if (error) {
    alert('Failed to delete request: ' + error.message);
  } else {
    await loadRequests();
  }
}

async function clearAllRequests() {
  if (!confirm('Are you sure you want to clear ALL submitted requests?')) return;

  const { error } = await db.from('requests').delete().gt('id', 0);

  if (error) {
    alert('Failed to clear all requests: ' + error.message);
  } else {
    alert('All requests have been cleared successfully.');
    await loadRequests();
  }
}

function openRequestsModal() {
  document.getElementById('requestsModal').classList.remove('hidden');
  loadRequests();
}

function closeRequestsModal() {
  document.getElementById('requestsModal').classList.add('hidden');
}

function addNewEmployee() {
  document.getElementById('addEmpName').value = '';
  document.getElementById('addEmpModal').classList.remove('hidden');
}

function closeAddEmpModal() {
  document.getElementById('addEmpModal').classList.add('hidden');
}

async function submitNewEmployee() {
  const name = document.getElementById('addEmpName').value.trim();
  const team = document.getElementById('addEmpTeam').value;

  if (!name) return alert('Please enter employee name.');

  const { error } = await db.from('employees').insert([{ name, team }]);
  if (error) {
    alert('Failed to add employee: ' + error.message);
  } else {
    alert('Added successfully');
    closeAddEmpModal();
    initAdminMatrix();
  }
}

async function deleteEmployee(id) {
  if (confirm('Delete employee record permanently?')) {
    await db.from('employees').delete().eq('id', id);
    initAdminMatrix();
  }
}

window.addEventListener('DOMContentLoaded', () => {
  const picker = document.getElementById('adminMonthPicker');
  if (picker) picker.value = getCurrentYearMonth();
  const bulkPicker = document.getElementById('bulkDateInput');
  if (bulkPicker) bulkPicker.value = getTodayDateStr();
  
  checkAdminAuth().then(isAuth => {
    if (isAuth) {
      initAdminMatrix();
      loadRequests();
    }
  });
});

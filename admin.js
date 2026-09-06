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

// Authentication Logic
async function handleAdminLogin() {
  const email = document.getElementById('adminEmail').value;
  const password = document.getElementById('adminPassword').value;

  const { data, error } = await db.auth.signInWithPassword({ email, password });

  if (error) {
    alert('Authentication failed: ' + error.message);
  } else {
    document.getElementById('authOverlay').classList.add('hidden');
    initAdminMatrix();
  }
}

async function handleAdminLogout() {
  await db.auth.signOut();
  location.reload();
}

async function checkSession() {
  const { data: { session } } = await db.auth.getSession();
  if (session) {
    document.getElementById('authOverlay').classList.add('hidden');
    initAdminMatrix();
  }
}

// Admin Attendance Matrix Render
async function initAdminMatrix() {
  const head = document.getElementById('adminMatrixHead');
  const body = document.getElementById('adminMatrixBody');
  if (!head || !body) return;

  const monthVal = document.getElementById('adminMonthPicker')?.value || getCurrentYearMonth();
  const fullMonthDates = getMonthDates(monthVal);

  const searchVal = document.getElementById('adminSearchInput')?.value.toLowerCase() || '';
  const teamVal = document.getElementById('adminTeamFilter')?.value || 'ALL';

  let headHTML = `<tr><th class="p-2 border-r bg-slate-900 sticky left-0 z-20 min-w-[180px]">EMPLOYEE NAME</th><th class="p-2 border-r bg-slate-900 min-w-[120px]">TEAM</th>`;
  fullMonthDates.forEach(d => {
    const bgClass = d.isWeekend ? 'bg-slate-700 text-slate-400' : 'bg-amber-400 text-slate-900 font-extrabold';
    headHTML += `<th class="p-1 text-center border-r min-w-[65px] ${bgClass}"><div class="text-[9px] uppercase">${d.dayName}</div><div>${d.dayNum}</div></th>`;
  });
  head.innerHTML = headHTML + `</tr>`;

  let { data: employees } = await db.from('employees').select('*').order('id');
  const { data: schedules } = await db.from('schedules').select('*');

  globalEmployees = employees || [];
  globalSchedules = schedules || [];

  updateAdminKpis(monthVal);

  let filtered = globalEmployees.filter(emp => {
    const matchesSearch = emp.name.toLowerCase().includes(searchVal);
    const matchesTeam = teamVal === 'ALL' || emp.team === teamVal;
    return matchesSearch && matchesTeam;
  });

  body.innerHTML = filtered.map(emp => {
    let rowHTML = `<tr class="hover:bg-slate-50"><td class="p-2 border-r font-bold text-slate-800 sticky left-0 bg-white shadow-sm">${emp.name}</td><td class="p-2 border-r text-slate-500 font-medium">${emp.team}</td>`;
    
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

// Real-time Single Cell Update
async function updateStatus(employeeId, dateStr, newStatus) {
  const { error } = await db.from('schedules').upsert(
    { employee_id: employeeId, date: dateStr, status: newStatus },
    { onConflict: 'employee_id,date' }
  );

  if (error) {
    alert('Failed to update schedule: ' + error.message);
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

// KPI Calculation
function updateAdminKpis(selectedMonth) {
  const todayStr = getTodayDateStr();

  document.getElementById('kpiTotal').innerText = globalEmployees.length;

  const monthScheds = globalSchedules.filter(s => s.date.startsWith(selectedMonth));
  const todayScheds = globalSchedules.filter(s => s.date === todayStr);

  const wfoToday = todayScheds.filter(s => s.status === 'WFO').length;

  document.getElementById('kpiWfo').innerText = wfoToday;
  document.getElementById('kpiWfh').innerText = Math.max(0, globalEmployees.length - wfoToday);

  const totalLeaves = monthScheds.filter(s => {
    const st = s.status || '';
    return st.startsWith('VL') || st.startsWith('SL');
  }).length;

  document.getElementById('kpiLeave').innerText = totalLeaves;
  document.getElementById('kpiHoliday').innerText = new Set(monthScheds.filter(s => s.status === 'HOLIDAY').map(s => s.date)).size;
}

// Admin KPI Modal Click Logic
function openAdminKpiModal(type) {
  const modal = document.getElementById('kpiModal');
  const title = document.getElementById('modalTitle');
  const list = document.getElementById('modalList');
  const todayStr = getTodayDateStr();

  modal.classList.remove('hidden');
  list.innerHTML = '';

  let filtered = [];
  if (type === 'ALL') {
    title.innerText = 'All Employees';
    filtered = globalEmployees.map(e => ({ name: e.name, team: e.team, status: 'Active' }));
  } else {
    title.innerText = `Today (${todayStr}) - ${type} List`;
    globalEmployees.forEach(emp => {
      const sched = globalSchedules.find(s => s.employee_id === emp.id && s.date === todayStr);
      const status = sched ? sched.status : 'WFH';

      if (type === 'WFO' && status === 'WFO') filtered.push({ name: emp.name, team: emp.team, status });
      else if (type === 'WFH' && status === 'WFH') filtered.push({ name: emp.name, team: emp.team, status });
      else if (type === 'LEAVE' && (status?.startsWith('VL') || status?.startsWith('SL'))) filtered.push({ name: emp.name, team: emp.team, status });
      else if (type === 'HOLIDAY' && status === 'HOLIDAY') filtered.push({ name: emp.name, team: emp.team, status });
    });
  }

  if (filtered.length === 0) {
    list.innerHTML = `<p class="text-xs text-slate-400 text-center py-4">No employees found for this status today.</p>`;
  } else {
    list.innerHTML = filtered.map(item => `
      <div class="flex justify-between items-center p-2.5 bg-slate-50 rounded-lg border text-xs">
        <div><p class="font-bold text-slate-800">${item.name}</p><p class="text-[10px] text-slate-400">${item.team}</p></div>
        <span class="px-2 py-0.5 rounded font-bold ${getBadgeClass(item.status, false)}">${item.status}</span>
      </div>
    `).join('');
  }
}

function closeAdminKpiModal() {
  document.getElementById('kpiModal').classList.add('hidden');
}

// Leave Requests Modal Logic
async function openRequestsModal() {
  document.getElementById('requestsModal').classList.remove('hidden');
  const list = document.getElementById('requestsList');
  list.innerHTML = '<p class="text-xs text-slate-400 text-center py-4">Loading requests...</p>';

  const { data: requests, error } = await db.from('requests').select('*').order('id', { ascending: false });

  if (error || !requests || requests.length === 0) {
    list.innerHTML = '<p class="text-xs text-slate-400 text-center py-4">No pending leave requests.</p>';
    return;
  }

  list.innerHTML = requests.map(req => `
    <div class="p-3 bg-slate-50 rounded-lg border flex justify-between items-center text-xs">
      <div>
        <p class="font-bold text-slate-800">${req.employee_name} <span class="text-[10px] text-amber-600 font-extrabold">(${req.request_type})</span></p>
        <p class="text-[11px] text-slate-500">Date Requested: <b>${req.date}</b></p>
        ${req.message ? `<p class="text-[10px] text-slate-400 italic mt-0.5">"${req.message}"</p>` : ''}
      </div>
      <button onclick="deleteRequest(${req.id})" class="bg-rose-100 hover:bg-rose-200 text-rose-700 font-bold px-2.5 py-1 rounded text-[10px]">Dismiss</button>
    </div>
  `).join('');
}

async function deleteRequest(reqId) {
  await db.from('requests').delete().eq('id', reqId);
  openRequestsModal();
}

function closeRequestsModal() {
  document.getElementById('requestsModal').classList.add('hidden');
}

window.addEventListener('DOMContentLoaded', () => {
  const picker = document.getElementById('adminMonthPicker');
  if (picker) picker.value = getCurrentYearMonth();
  checkSession();
});

function updateAdminKpis(selectedMonth) {
  const todayStr = getTodayDateStr();

  // Gumamit ng tamang IDs batay sa HTML
  const totalElem = document.getElementById('adminKpiTotal') || document.getElementById('kpiTotal');
  const leavesElem = document.getElementById('adminKpiLeaves') || document.getElementById('kpiLeave');
  const holidaysElem = document.getElementById('adminKpiHolidays') || document.getElementById('kpiHoliday');
  const wfoElem = document.getElementById('adminKpiWfo') || document.getElementById('kpiWfo');
  const wfhElem = document.getElementById('adminKpiWfh') || document.getElementById('kpiWfh');

  if (totalElem) totalElem.innerText = globalEmployees.length;

  const monthScheds = globalSchedules.filter(s => s.date.startsWith(selectedMonth));
  const todayScheds = globalSchedules.filter(s => s.date === todayStr);

  const wfoToday = todayScheds.filter(s => s.status === 'WFO').length;

  if (wfoElem) wfoElem.innerText = wfoToday;
  if (wfhElem) wfhElem.innerText = Math.max(0, globalEmployees.length - wfoToday);

  const totalLeaves = monthScheds.filter(s => {
    const st = s.status || '';
    return st.startsWith('VL') || st.startsWith('SL');
  }).length;

  if (leavesElem) leavesElem.innerText = totalLeaves;
  if (holidaysElem) holidaysElem.innerText = new Set(monthScheds.filter(s => s.status === 'HOLIDAY').map(s => s.date)).size;
}

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

async function initUserMatrix() {
  // FIX: Use correct element IDs
  const head = document.getElementById('matrixHead');
  const body = document.getElementById('matrixBody');
  if (!head || !body) {
    console.error('Table elements not found');
    return;
  }

  const monthVal = document.getElementById('userMonthPicker')?.value || getCurrentYearMonth();
  const fullMonthDates = getMonthDates(monthVal);

  // FIX: Use correct input IDs for user side
  const searchVal = document.getElementById('userSearchInput')?.value.toLowerCase() || '';
  const teamVal = document.getElementById('userTeamFilter')?.value || 'ALL';

  // Build header
  let headHTML = `<tr><th class="p-2 border-r bg-slate-900 sticky left-0 z-20 min-w-[180px]">EMPLOYEE NAME</th><th class="p-2 border-r bg-slate-900 min-w-[100px]">TEAM</th>`;
  fullMonthDates.forEach(d => {
    const bgClass = d.isWeekend ? 'bg-slate-700 text-slate-400' : 'bg-amber-400 text-slate-900 font-bold';
    headHTML += `<th class="p-1 text-center border-r min-w-[65px] ${bgClass}"><div class="text-[9px] uppercase">${d.dayName}</div><div>${d.dayNum}</div></th>`;
  });
  head.innerHTML = headHTML + `</tr>`;

  // Fetch data
  const { data: employees, error: empError } = await db.from('employees').select('*');
  const { data: schedules, error: schedError } = await db.from('schedules').select('*');

  if (empError) {
    console.error('Error fetching employees:', empError);
    body.innerHTML = `<tr><td colspan="35" class="p-4 text-center text-red-500">Error loading employees</td></tr>`;
    return;
  }

  if (!employees || employees.length === 0) {
    body.innerHTML = `<tr><td colspan="35" class="p-4 text-center text-slate-400">No employees found</td></tr>`;
    return;
  }

  globalEmployees = employees;
  globalSchedules = schedules || [];

  updateUserKpis(monthVal);

  // Filter employees
  let filteredEmployees = employees.filter(emp => {
    const matchesSearch = emp.name.toLowerCase().includes(searchVal);
    const matchesTeam = teamVal === 'ALL' || emp.team === teamVal;
    return matchesSearch && matchesTeam;
  });

  filteredEmployees.sort((a, b) => a.name.localeCompare(b.name));

  if (filteredEmployees.length === 0) {
    body.innerHTML = `<tr><td colspan="35" class="p-4 text-center text-slate-400">No employees match your filters</td></tr>`;
    return;
  }

  // Build table body
  body.innerHTML = filteredEmployees.map(emp => {
    let rowHTML = `<tr><td class="p-2 border-r font-bold text-slate-800 sticky left-0 bg-white shadow-sm">${emp.name}</td><td class="p-2 border-r text-slate-500">${emp.team}</td>`;

    fullMonthDates.forEach(d => {
      if (d.isWeekend) {
        rowHTML += `<td class="p-1 border-r text-center bg-slate-100"></td>`;
      } else {
        const sched = globalSchedules.find(s => s.employee_id === emp.id && s.date === d.dateStr);
        const status = sched ? sched.status : 'WFH';
        rowHTML += `
          <td class="p-1 border-r text-center">
            <span class="text-[9px] font-bold p-1 rounded border inline-block w-full text-center ${getBadgeClass(status, false)}">
              ${status}
            </span>
          </td>`;
      }
    });

    return rowHTML + `</tr>`;
  }).join('');
}

function updateUserKpis(selectedMonth) {
  const monthScheds = globalSchedules.filter(s => s.date.startsWith(selectedMonth));
  
  // FIX: Use correct element IDs for user KPIs
  const totalElem = document.getElementById('kpiTotal');
  const leaveElem = document.getElementById('kpiLeave');
  const holidayElem = document.getElementById('kpiHoliday');
  const wfoElem = document.getElementById('kpiWfo');
  const wfhElem = document.getElementById('kpiWfh');

  // Get today's date for WFO/WFH counts
  const today = getTodayDateStr();
  const todayScheds = globalSchedules.filter(s => s.date === today);

  if (totalElem) totalElem.innerText = globalEmployees.length;
  
  // Count leaves (VL or SL)
  if (leaveElem) {
    leaveElem.innerText = monthScheds.filter(s => 
      s.status?.startsWith('VL') || s.status?.startsWith('SL')
    ).length;
  }
  
  // Count unique holiday dates
  if (holidayElem) {
    holidayElem.innerText = new Set(monthScheds.filter(s => s.status === 'HOLIDAY').map(s => s.date)).size;
  }

  // Count today's WFO
  if (wfoElem) {
    wfoElem.innerText = todayScheds.filter(s => s.status === 'WFO').length;
  }

  // Count today's WFH
  if (wfhElem) {
    wfhElem.innerText = todayScheds.filter(s => s.status === 'WFH').length;
  }
}

async function submitLeaveRequest() {
  const name = document.getElementById('reqName').value.trim();
  const date = document.getElementById('reqDate').value;
  const type = document.getElementById('reqType').value;
  const message = document.getElementById('reqMessage').value;

  if (!name || !date) {
    alert('Please complete all required fields (Name and Date).');
    return;
  }

  try {
    const { error } = await db.from('requests').insert([{ 
      employee_name: name, 
      date, 
      request_type: type, 
      message 
    }]);

    if (error) {
      alert('Submission failed: ' + error.message);
    } else {
      alert('Request submitted successfully!');
      closeLeaveRequestModal();
      // Reset form
      document.getElementById('reqName').value = '';
      document.getElementById('reqDate').value = '';
      document.getElementById('reqMessage').value = '';
    }
  } catch (err) {
    alert('Error submitting request: ' + err.message);
  }
}

function openLeaveRequestModal() {
  document.getElementById('leaveModal').classList.remove('hidden');
  // Set default date to today
  document.getElementById('reqDate').value = getTodayDateStr();
}

function closeLeaveRequestModal() {
  document.getElementById('leaveModal').classList.add('hidden');
}

// KPI Modal functions
function openKpiModal(type) {
  const modal = document.getElementById('kpiModal');
  const title = document.getElementById('modalTitle');
  const list = document.getElementById('modalList');

  if (!modal || !title || !list) return;

  const today = getTodayDateStr();
  const todayScheds = globalSchedules.filter(s => s.date === today);
  let employees = [];

  if (type === 'ALL') {
    title.innerText = '👥 All Employees';
    employees = globalEmployees;
  } else if (type === 'WFO') {
    title.innerText = '🏢 Employees Working Onsite Today';
    const empIds = todayScheds.filter(s => s.status === 'WFO').map(s => s.employee_id);
    employees = globalEmployees.filter(e => empIds.includes(e.id));
  } else if (type === 'WFH') {
    title.innerText = '🏠 Employees Working From Home Today';
    const empIds = todayScheds.filter(s => s.status === 'WFH').map(s => s.employee_id);
    employees = globalEmployees.filter(e => empIds.includes(e.id));
  } else if (type === 'LEAVE') {
    title.innerText = '✈️ Employees On Leave Today';
    const empIds = todayScheds.filter(s => s.status?.startsWith('VL') || s.status?.startsWith('SL')).map(s => s.employee_id);
    employees = globalEmployees.filter(e => empIds.includes(e.id));
  } else if (type === 'HOLIDAY') {
    title.innerText = '🥳 Holidays This Month';
    const monthVal = document.getElementById('userMonthPicker')?.value || getCurrentYearMonth();
    const holidayDates = globalSchedules
      .filter(s => s.status === 'HOLIDAY' && s.date.startsWith(monthVal))
      .map(s => s.date);
    const uniqueDates = [...new Set(holidayDates)];
    list.innerHTML = uniqueDates.length > 0 
      ? uniqueDates.map(d => `<div class="p-2 bg-emerald-50 rounded-lg text-center font-bold text-emerald-700">${d}</div>`).join('')
      : '<div class="p-2 text-center text-slate-400">No holidays this month</div>';
    modal.classList.remove('hidden');
    return;
  }

  if (employees.length === 0) {
    list.innerHTML = '<div class="p-2 text-center text-slate-400">No employees found</div>';
  } else {
    list.innerHTML = employees.map(e => 
      `<div class="p-2 bg-slate-50 rounded-lg flex justify-between items-center">
        <span class="font-bold text-slate-800">${e.name}</span>
        <span class="text-xs text-slate-500">${e.team}</span>
      </div>`
    ).join('');
  }

  modal.classList.remove('hidden');
}

function closeKpiModal() {
  document.getElementById('kpiModal').classList.add('hidden');
}

window.addEventListener('DOMContentLoaded', () => {
  const picker = document.getElementById('userMonthPicker');
  if (picker) picker.value = getCurrentYearMonth();
  initUserMatrix();
});

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
  const head = document.getElementById('matrixHead');
  const body = document.getElementById('matrixBody');
  if (!head || !body) return;

  const monthVal = document.getElementById('userMonthPicker')?.value || getCurrentYearMonth();
  const fullMonthDates = getMonthDates(monthVal);

  const searchVal = document.getElementById('userSearchInput')?.value.toLowerCase() || '';
  const teamVal = document.getElementById('userTeamFilter')?.value || 'ALL';

  let headHTML = `<tr><th class="p-2 border-r bg-slate-900 sticky left-0 z-20 min-w-[180px]">EMPLOYEE NAME</th><th class="p-2 border-r bg-slate-900 min-w-[120px]">TEAM</th>`;
  fullMonthDates.forEach(d => {
    const bgClass = d.isWeekend ? 'bg-slate-700 text-slate-400' : 'bg-amber-400 text-slate-900 font-extrabold';
    headHTML += `<th class="p-1 text-center border-r min-w-[55px] ${bgClass}"><div class="text-[9px] uppercase">${d.dayName}</div><div>${d.dayNum}</div></th>`;
  });
  head.innerHTML = headHTML + `</tr>`;

  let { data: employees } = await db.from('employees').select('*').order('id');
  const { data: schedules } = await db.from('schedules').select('*');

  globalEmployees = employees || [];
  globalSchedules = schedules || [];

  updateUserKpis(monthVal);

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
        rowHTML += `<td class="p-1 border-r text-center"><span class="px-1.5 py-0.5 rounded text-[10px] block font-bold ${getBadgeClass(status, false)}">${status}</span></td>`;
      }
    });

    return rowHTML + `</tr>`;
  }).join('');
}

function updateUserKpis(selectedMonth) {
  const todayStr = getTodayDateStr();

  // 1. Total Employees
  const totalEmpElem = document.getElementById('kpiTotal') || document.getElementById('userKpiTotal');
  if (totalEmpElem) totalEmpElem.innerText = globalEmployees.length;

  // 2. Today's WFO & WFH
  const todayScheds = globalSchedules.filter(s => s.date === todayStr);
  const wfoCount = todayScheds.filter(s => s.status === 'WFO').length;
  
  const wfoElem = document.getElementById('kpiWfo') || document.getElementById('userKpiWfo');
  const wfhElem = document.getElementById('kpiWfh') || document.getElementById('userKpiWfh');
  if (wfoElem) wfoElem.innerText = wfoCount;
  if (wfhElem) wfhElem.innerText = Math.max(0, globalEmployees.length - wfoCount);

  // 3. Monthly Leaves Count (VL, SL, VL AM/PM, SL AM/PM)
  const monthScheds = globalSchedules.filter(s => s.date.startsWith(selectedMonth));
  const leaveCount = monthScheds.filter(s => {
    const st = s.status || '';
    return st.startsWith('VL') || st.startsWith('SL');
  }).length;

  const leaveElem = document.getElementById('kpiLeave') || document.getElementById('userKpiLeaves');
  if (leaveElem) leaveElem.innerText = leaveCount;

  // 4. Monthly Holidays Count
  const holidayElem = document.getElementById('kpiHoliday') || document.getElementById('userKpiHolidays');
  if (holidayElem) {
    holidayElem.innerText = new Set(monthScheds.filter(s => s.status === 'HOLIDAY').map(s => s.date)).size;
  }
}

function openKpiModal(type) {
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

function closeKpiModal() {
  document.getElementById('kpiModal').classList.add('hidden');
}

function openLeaveRequestModal() {
  document.getElementById('leaveModal').classList.remove('hidden');
}

function closeLeaveRequestModal() {
  document.getElementById('leaveModal').classList.add('hidden');
}

async function submitLeaveRequest() {
  const name = document.getElementById('reqName').value;
  const date = document.getElementById('reqDate').value;
  const type = document.getElementById('reqType').value;
  const message = document.getElementById('reqMessage').value;

  if (!name || !date) {
    alert('Please complete your name and date requested.');
    return;
  }

  const { error } = await db.from('requests').insert([{ employee_name: name, date, request_type: type, message }]);

  if (error) {
    alert('Failed to send request: ' + error.message);
  } else {
    alert('Your request has been submitted successfully for manager review!');
    closeLeaveRequestModal();
  }
}

window.addEventListener('DOMContentLoaded', () => {
  const picker = document.getElementById('userMonthPicker');
  if (picker) picker.value = getCurrentYearMonth();
  initUserMatrix();
});

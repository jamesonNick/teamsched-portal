const SUPABASE_URL = 'https://kheaochbnwfkmjwnyjpf.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtoZWFvYhibndma21qd255anBmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg2MDIxNjAsImV4cCI6MjEwNDE3ODE2MH0.4DdYobqvoWR8cBpe_bC160-kSTEAI2lSlyh4h8kHtq8';
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
  const head = document.getElementById('userMatrixHead');
  const body = document.getElementById('userMatrixBody');
  if (!head || !body) return;

  const monthVal = document.getElementById('userMonthPicker')?.value || getCurrentYearMonth();
  const fullMonthDates = getMonthDates(monthVal);

  const searchVal = document.getElementById('searchInput')?.value.toLowerCase() || '';
  const teamVal = document.getElementById('teamFilter')?.value || 'ALL';

  let headHTML = `<tr><th class="p-2 border-r bg-slate-900 sticky left-0 z-20 min-w-[180px]">EMPLOYEE NAME</th><th class="p-2 border-r bg-slate-900 min-w-[100px]">TEAM</th>`;
  fullMonthDates.forEach(d => {
    const bgClass = d.isWeekend ? 'bg-slate-700 text-slate-400' : 'bg-amber-400 text-slate-900 font-bold';
    headHTML += `<th class="p-1 text-center border-r min-w-[65px] ${bgClass}"><div class="text-[9px] uppercase">${d.dayName}</div><div>${d.dayNum}</div></th>`;
  });
  head.innerHTML = headHTML + `</tr>`;

  let { data: employees } = await db.from('employees').select('*');
  const { data: schedules } = await db.from('schedules')
    .select('*')
    .like('date', `${monthVal}%`);

  if (!employees) return;

  globalEmployees = employees;
  globalSchedules = schedules || [];

  updateUserKpis(monthVal);

  employees = employees.filter(emp => {
    const matchesSearch = emp.name.toLowerCase().includes(searchVal);
    const matchesTeam = teamVal === 'ALL' || emp.team === teamVal;
    return matchesSearch && matchesTeam;
  });

  employees.sort((a, b) => a.name.localeCompare(b.name));

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
  const totalElem = document.getElementById('userKpiTotal');
  const leavesElem = document.getElementById('userKpiLeaves');
  const holidaysElem = document.getElementById('userKpiHolidays');

  if (totalElem) totalElem.innerText = globalEmployees.length;
  if (leavesElem) leavesElem.innerText = monthScheds.filter(s => s.status?.startsWith('VL') || s.status?.startsWith('SL')).length;
  if (holidaysElem) holidaysElem.innerText = new Set(monthScheds.filter(s => s.status === 'HOLIDAY').map(s => s.date)).size;
}

async function submitRequest() {
  const name = document.getElementById('reqName').value.trim();
  const date = document.getElementById('reqDate').value;
  const type = document.getElementById('reqType').value;
  const message = document.getElementById('reqMessage').value;

  if (!name || !date) return alert('Please complete required fields.');

  const { error } = await db.from('requests').insert([{ employee_name: name, date, request_type: type, message }]);

  if (error) {
    alert('Submission failed: ' + error.message);
  } else {
    alert('Request submitted successfully!');
    document.getElementById('reqModal').classList.add('hidden');
  }
}

window.addEventListener('DOMContentLoaded', () => {
  const picker = document.getElementById('userMonthPicker');
  if (picker) picker.value = getCurrentYearMonth();
  initUserMatrix();
});

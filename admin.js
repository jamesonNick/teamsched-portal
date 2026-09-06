const SUPABASE_URL = 'https://kheaochbnwfkmjwnyjpf.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtoZWFvY2hibndma21qd255anBmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg2MDIxNjAsImV4cCI6MjEwNDE3ODE2MH0.4DdYobqvoWR8cBpe_bC160-kSTEAI2lSlyh4h8kHtq8';
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let globalEmployees = [];
let globalSchedules = [];

// ============ HELPER FUNCTIONS ============

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

// ============ TOAST NOTIFICATION ============

function showToast(message, type = 'success') {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.className = `toast ${type}`;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

// ============ AUTHENTICATION ============

async function checkAdminAuth() {
  try {
    const { data: { session } } = await db.auth.getSession();
    
    if (!session) {
      const modal = document.getElementById('loginModal');
      if (modal) modal.classList.remove('hidden');
      return false;
    }

    const { data: profile, error } = await db.from('profiles').select('role').eq('id', session.user.id).single();
    if (error || !profile || profile.role !== 'admin') {
      alert('Access denied. Admin privileges required.');
      await db.auth.signOut();
      window.location.href = 'login.html';
      return false;
    }

    const modal = document.getElementById('loginModal');
    if (modal) modal.classList.add('hidden');
    return true;
  } catch (err) {
    console.error('Auth check error:', err);
    return false;
  }
}

async function handleLogin() {
  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;

  if (!email || !password) {
    alert('Please enter both email and password.');
    return;
  }

  try {
    const { error } = await db.auth.signInWithPassword({ email, password });
    if (error) {
      alert('Authentication failed: ' + error.message);
    } else {
      const isAuth = await checkAdminAuth();
      if (isAuth) {
        await initAdminMatrix();
        await loadRequests();
      }
    }
  } catch (err) {
    alert('Login error: ' + err.message);
  }
}

async function handleLogout() {
  await db.auth.signOut();
  window.location.href = 'login.html';
}

// ============ ADMIN MATRIX ============

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

  // Build header
  let headHTML = `<tr><th class="p-2 border-r bg-slate-900 sticky left-0 z-20 min-w-[180px]">EMPLOYEE NAME</th><th class="p-2 border-r bg-slate-900 min-w-[100px]">TEAM</th>`;
  fullMonthDates.forEach(d => {
    const bgClass = d.isWeekend ? 'bg-slate-700 text-slate-400' : 'bg-amber-400 text-slate-900 font-bold';
    headHTML += `<th class="p-1 text-center border-r min-w-[65px] ${bgClass}"><div class="text-[9px] uppercase">${d.dayName}</div><div>${d.dayNum}</div></th>`;
  });
  head.innerHTML = headHTML + `<th class="p-2 text-center bg-slate-900 sticky right-0 z-20 min-w-[80px]">ACTION</th></tr>`;

  // Fetch ALL employees from database
  const { data: employees, error: empError } = await db.from('employees').select('*');
  const { data: schedules, error: schedError } = await db.from('schedules').select('*');

  if (empError) {
    console.error('Error fetching employees:', empError);
    body.innerHTML = `<tr><td colspan="35" class="p-4 text-center text-red-500">Error loading employees</td></tr>`;
    return;
  }

  if (!employees) {
    body.innerHTML = `<tr><td colspan="35" class="p-4 text-center text-slate-400">No employees found</td></tr>`;
    return;
  }

  // Store ALL employees in global
  globalEmployees = employees;
  globalSchedules = schedules || [];

  updateAdminKpis(monthVal);
  updateTodayStatus();

  // Apply filters ONLY for display
  let filteredEmployees = employees.filter(emp => {
    const matchesSearch = emp.name.toLowerCase().includes(searchVal);
    const matchesTeam = teamVal === 'ALL' || emp.team === teamVal;
    return matchesSearch && matchesTeam;
  });

  filteredEmployees.sort((a, b) => sortVal === 'ASC' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name));

  if (filteredEmployees.length === 0) {
    body.innerHTML = `<tr><td colspan="35" class="p-4 text-center text-slate-400">No employees match your filters</td></tr>`;
    return;
  }

  // Build table body using filtered employees (for display only)
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

// ============ KPI UPDATES ============

function updateAdminKpis(selectedMonth) {
  const monthScheds = globalSchedules.filter(s => s.date.startsWith(selectedMonth));
  const totalElem = document.getElementById('adminKpiTotal');
  const leavesElem = document.getElementById('adminKpiLeaves');
  const holidaysElem = document.getElementById('adminKpiHolidays');

  if (totalElem) totalElem.innerText = globalEmployees.length;
  if (leavesElem) leavesElem.innerText = monthScheds.filter(s => s.status?.startsWith('VL') || s.status?.startsWith('SL')).length;
  if (holidaysElem) holidaysElem.innerText = new Set(monthScheds.filter(s => s.status === 'HOLIDAY').map(s => s.date)).size;
}

function updateTodayStatus() {
  const today = getTodayDateStr();
  const todayScheds = globalSchedules.filter(s => s.date === today);
  const wfoCount = todayScheds.filter(s => s.status === 'WFO').length;
  const wfhCount = todayScheds.filter(s => s.status === 'WFH').length;
  const leaveCount = todayScheds.filter(s => s.status?.startsWith('VL') || s.status?.startsWith('SL')).length;
  
  const elem = document.getElementById('adminKpiToday');
  if (elem) {
    elem.innerText = `🏢${wfoCount} 🏠${wfhCount} ✈️${leaveCount}`;
  }
}

// ============ DROPDOWN CHANGE ============

async function handleDropdownChange(selectElem, empId, date) {
  const newStatus = selectElem.value.trim();
  
  console.log(`🔄 Updating: Employee ${empId}, Date ${date}, Status "${newStatus}"`);
  
  if (!confirm(`Confirm schedule update to "${newStatus}" for date ${date}?`)) {
    await initAdminMatrix();
    return;
  }

  selectElem.className = `text-[9px] font-bold p-1 rounded border ${getBadgeClass(newStatus, false)} outline-none`;

  try {
    const { error } = await db.from('schedules').upsert(
      { employee_id: empId, date: date, status: newStatus }, 
      { onConflict: 'employee_id,date' }
    );
    
    if (error) {
      alert('Error saving: ' + error.message);
      await initAdminMatrix();
    } else {
      console.log(`✅ Updated: Employee ${empId}, Date ${date}, Status "${newStatus}"`);
      
      const { data: schedules } = await db.from('schedules').select('*');
      globalSchedules = schedules || [];
      const monthVal = document.getElementById('adminMonthPicker').value;
      updateAdminKpis(monthVal);
      updateTodayStatus();
    }
  } catch (err) {
    alert('Error: ' + err.message);
    await initAdminMatrix();
  }
}

// ============ KPI MODAL ============

function openAdminKpiModal(type) {
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
  } else if (type === 'LEAVE') {
    const monthVal = document.getElementById('adminMonthPicker')?.value || getCurrentYearMonth();
    const monthScheds = globalSchedules.filter(s => s.date.startsWith(monthVal));
    const empIds = monthScheds.filter(s => s.status?.startsWith('VL') || s.status?.startsWith('SL')).map(s => s.employee_id);
    const uniqueIds = [...new Set(empIds)];
    employees = globalEmployees.filter(e => uniqueIds.includes(e.id));
    title.innerText = '✈️ Employees on Leave This Month';
  } else if (type === 'HOLIDAY') {
    title.innerText = '🥳 Holidays This Month';
    const monthVal = document.getElementById('adminMonthPicker')?.value || getCurrentYearMonth();
    const holidayDates = globalSchedules
      .filter(s => s.status === 'HOLIDAY' && s.date.startsWith(monthVal))
      .map(s => s.date);
    const uniqueDates = [...new Set(holidayDates)];
    list.innerHTML = uniqueDates.length > 0 
      ? uniqueDates.map(d => `<div class="p-2 bg-emerald-50 rounded-lg text-center font-bold text-emerald-700">${d}</div>`).join('')
      : '<div class="p-2 text-center text-slate-400">No holidays this month</div>';
    modal.classList.remove('hidden');
    return;
  } else if (type === 'TODAY') {
    title.innerText = '📊 Today\'s Status Summary';
    const wfoEmp = todayScheds.filter(s => s.status === 'WFO').map(s => s.employee_id);
    const wfhEmp = todayScheds.filter(s => s.status === 'WFH').map(s => s.employee_id);
    const leaveEmp = todayScheds.filter(s => s.status?.startsWith('VL') || s.status?.startsWith('SL')).map(s => s.employee_id);
    
    let html = '';
    if (wfoEmp.length > 0) {
      html += `<div class="font-bold text-red-600 mt-2">🏢 WFO (${wfoEmp.length}):</div>`;
      html += globalEmployees.filter(e => wfoEmp.includes(e.id)).map(e => 
        `<div class="p-1.5 bg-red-50 rounded-lg text-xs">${e.name}</div>`
      ).join('');
    }
    if (wfhEmp.length > 0) {
      html += `<div class="font-bold text-blue-600 mt-2">🏠 WFH (${wfhEmp.length}):</div>`;
      html += globalEmployees.filter(e => wfhEmp.includes(e.id)).map(e => 
        `<div class="p-1.5 bg-blue-50 rounded-lg text-xs">${e.name}</div>`
      ).join('');
    }
    if (leaveEmp.length > 0) {
      html += `<div class="font-bold text-amber-600 mt-2">✈️ On Leave (${leaveEmp.length}):</div>`;
      html += globalEmployees.filter(e => leaveEmp.includes(e.id)).map(e => 
        `<div class="p-1.5 bg-amber-50 rounded-lg text-xs">${e.name}</div>`
      ).join('');
    }
    if (!html) html = '<div class="p-2 text-center text-slate-400">No data for today</div>';
    list.innerHTML = html;
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

// ============ EDIT EMPLOYEE ============

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

  try {
    const { error } = await db.from('employees').update({ name, team }).eq('id', id);

    if (error) {
      alert('Failed to update employee: ' + error.message);
    } else {
      alert('Employee updated successfully!');
      closeEditEmpModal();
      await initAdminMatrix();
    }
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

// ============ BULK EDIT (FULLY FIXED) ============

function toggleBulkInputMode() {
  const mode = document.getElementById('bulkMode').value;
  const dayContainer = document.getElementById('bulkDayContainer');
  const weekContainer = document.getElementById('bulkWeekContainer');
  
  if (dayContainer) dayContainer.classList.add('hidden');
  if (weekContainer) weekContainer.classList.add('hidden');
  
  if (mode === 'DAY' && dayContainer) {
    dayContainer.classList.remove('hidden');
  } else if (mode === 'WEEK' && weekContainer) {
    weekContainer.classList.remove('hidden');
  }
}

async function applyBulkStatus() {
  const mode = document.getElementById('bulkMode').value;
  let statusVal = document.getElementById('bulkStatusInput').value;
  const monthVal = document.getElementById('adminMonthPicker').value;

  // Trim status para sure
  statusVal = statusVal.trim();
  
  console.log('🔄 Applying status:', statusVal);

  let targetDates = [];

  if (mode === 'DAY') {
    const dayVal = document.getElementById('bulkDateInput').value;
    if (!dayVal) return alert('Select a target date.');
    targetDates.push(dayVal);
  } else if (mode === 'WEEK') {
    const weekStart = document.getElementById('bulkWeekInput').value;
    if (!weekStart) return alert('Select Monday start date.');
    // Weekdays only: Mon-Fri
    for (let i = 0; i < 5; i++) {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      const dateStr = d.toISOString().split('T')[0];
      targetDates.push(dateStr);
    }
    console.log('📅 Week dates:', targetDates);
  } else if (mode === 'MONTH') {
    const allDates = getMonthDates(monthVal);
    targetDates = allDates.filter(d => !d.isWeekend).map(d => d.dateStr);
    console.log('📅 Month dates:', targetDates);
  }

  if (targetDates.length === 0) {
    alert('No dates found to update.');
    return;
  }

  // ============ FIX: Get ALL employees DIRECTLY from database ============
  const { data: allEmployees, error: empError } = await db
    .from('employees')
    .select('*');
  
  if (empError) {
    alert('Error fetching employees: ' + empError.message);
    return;
  }

  if (!allEmployees || allEmployees.length === 0) {
    alert('No employees found.');
    return;
  }

  console.log(`📊 Found ${allEmployees.length} employees to update`);

  const employeesToUpdate = allEmployees;
  const totalRecords = employeesToUpdate.length * targetDates.length;
  
  const dayType = mode === 'WEEK' ? '5 days (Mon-Fri)' : 
                  mode === 'MONTH' ? 'weekdays only' : 
                  '1 day';
  
  // Show detailed confirmation
  let confirmMessage = `⚠️ Apply "${statusVal}" to:\n\n`;
  confirmMessage += `📊 ${employeesToUpdate.length} employee(s)\n`;
  confirmMessage += `📅 ${targetDates.length} date(s) (${dayType})\n`;
  confirmMessage += `📝 ${totalRecords} total record(s)\n\n`;
  confirmMessage += `Employees:\n`;
  employeesToUpdate.slice(0, 10).forEach(e => {
    confirmMessage += `   - ${e.name} (${e.team})\n`;
  });
  if (employeesToUpdate.length > 10) {
    confirmMessage += `   ... and ${employeesToUpdate.length - 10} more\n`;
  }
  
  if (!confirm(confirmMessage)) {
    return;
  }

  // ============ FIX: Process ALL records ============
  let records = [];
  employeesToUpdate.forEach(emp => {
    targetDates.forEach(date => {
      records.push({ 
        employee_id: emp.id, 
        date: date, 
        status: statusVal 
      });
    });
  });

  console.log(`📝 Preparing ${records.length} records...`);

  // Process in chunks para iwas timeout
  const chunkSize = 50;
  let errors = [];
  let updated = 0;

  showToast(`⏳ Updating ${totalRecords} records...`, 'info');

  for (let i = 0; i < records.length; i += chunkSize) {
    const chunk = records.slice(i, i + chunkSize);
    
    try {
      const { error } = await db.from('schedules').upsert(chunk, { 
        onConflict: 'employee_id,date' 
      });
      
      if (error) {
        errors.push(`Chunk ${Math.floor(i/chunkSize) + 1}: ${error.message}`);
        console.error(`❌ Chunk ${Math.floor(i/chunkSize) + 1} error:`, error);
      } else {
        updated += chunk.length;
        console.log(`✅ Chunk ${Math.floor(i/chunkSize) + 1} completed (${chunk.length} records)`);
      }
      
    } catch (err) {
      errors.push(`Chunk ${Math.floor(i/chunkSize) + 1}: ${err.message}`);
      console.error(`❌ Chunk ${Math.floor(i/chunkSize) + 1} error:`, err);
    }
  }

  // ============ SHOW RESULTS ============
  if (errors.length > 0) {
    alert(`⚠️ Bulk update completed with ${errors.length} error(s):\n\n${errors.slice(0, 3).join('\n')}`);
  } else {
    alert(`✅ Successfully applied "${statusVal}" to:\n\n📊 ${employeesToUpdate.length} employee(s)\n📅 ${targetDates.length} date(s)\n📝 ${updated} total record(s)`);
  }

  // ============ FORCE REFRESH ============
  globalEmployees = allEmployees;
  
  // Fetch latest schedules
  const { data: schedules } = await db.from('schedules').select('*');
  globalSchedules = schedules || [];
  
  // Re-render the table
  await initAdminMatrix();
  updateTodayStatus();
  
  showToast(`✅ Applied "${statusVal}" to ${updated} records`, 'success');

  // ============ VERIFY ALL ============
  console.log('🔍 VERIFYING ALL UPDATES...');
  let allCorrect = true;
  
  for (const date of targetDates) {
    const { data: check } = await db.from('schedules')
      .select('employee_id, status')
      .eq('date', date);
    
    if (check && check.length > 0) {
      const correctCount = check.filter(s => s.status === statusVal).length;
      const total = check.length;
      console.log(`📅 ${date}: ${correctCount}/${total} records are "${statusVal}"`);
      
      if (correctCount < total) {
        allCorrect = false;
        const mismatches = check.filter(s => s.status !== statusVal);
        console.warn(`⚠️ ${date}: ${mismatches.length} mismatches`);
        mismatches.slice(0, 5).forEach(m => {
          const emp = allEmployees.find(e => e.id === m.employee_id);
          console.log(`   - ${emp?.name || 'Unknown'}: ${m.status}`);
        });
        if (mismatches.length > 5) {
          console.log(`   ... and ${mismatches.length - 5} more`);
        }
      }
    }
  }
  
  if (allCorrect) {
    console.log('🎉 ALL RECORDS VERIFIED CORRECT!');
  } else {
    console.warn('⚠️ Some records may not have been updated correctly.');
  }
}

// ============ REFRESH DATA ============

async function refreshAllData() {
  try {
    await initAdminMatrix();
    await loadRequests();
    showToast('✅ Data refreshed successfully!', 'success');
  } catch (err) {
    showToast('❌ Error refreshing data: ' + err.message, 'error');
  }
}

// ============ REQUESTS FUNCTIONS ============

async function loadRequests() {
  const badge = document.getElementById('requestBadge');
  const list = document.getElementById('requestsList');

  try {
    const { data: requests, error } = await db.from('requests').select('*').order('created_at', { ascending: false });

    if (error) {
      console.error('Error loading requests:', error);
      if (badge) badge.classList.add('hidden');
      if (list) list.innerHTML = `<tr><td colspan="5" class="p-3 text-center text-red-500">Error loading requests</td></tr>`;
      return;
    }

    if (!requests || requests.length === 0) {
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
          <td class="p-2 font-bold text-slate-800">${r.employee_name || 'Unknown'}</td>
          <td class="p-2 text-slate-600">${r.date || 'N/A'}</td>
          <td class="p-2 font-bold text-indigo-600">${r.request_type || 'N/A'}</td>
          <td class="p-2 text-slate-500">${r.message || 'N/A'}</td>
          <td class="p-2 text-center">
            <button onclick="deleteSingleRequest(${r.id})" class="bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold px-2 py-1 rounded transition text-[10px]" title="Clear Request">Clear 🗑️</button>
          </td>
        </tr>
      `).join('');
    }
  } catch (err) {
    console.error('Load requests error:', err);
    if (list) list.innerHTML = `<tr><td colspan="5" class="p-3 text-center text-red-500">Error loading requests</td></tr>`;
  }
}

async function deleteSingleRequest(id) {
  if (!confirm('Mark this request as resolved/cleared?')) return;

  try {
    const { error } = await db.from('requests').delete().eq('id', id);

    if (error) {
      alert('Failed to delete request: ' + error.message);
    } else {
      await loadRequests();
    }
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

async function clearAllRequests() {
  if (!confirm('Are you sure you want to clear ALL submitted requests?')) return;

  try {
    const { error } = await db.from('requests').delete().gt('id', 0);

    if (error) {
      alert('Failed to clear all requests: ' + error.message);
    } else {
      alert('All requests have been cleared successfully.');
      await loadRequests();
    }
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

function openRequestsModal() {
  document.getElementById('requestsModal').classList.remove('hidden');
  loadRequests();
}

function closeRequestsModal() {
  document.getElementById('requestsModal').classList.add('hidden');
}

// ============ EMPLOYEE CRUD ============

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

  try {
    const { error } = await db.from('employees').insert([{ name, team }]);
    if (error) {
      alert('Failed to add employee: ' + error.message);
    } else {
      alert('Added successfully');
      closeAddEmpModal();
      await initAdminMatrix();
    }
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

async function deleteEmployee(id) {
  if (!confirm('Delete employee record permanently? This will also delete their schedule data.')) return;

  try {
    await db.from('schedules').delete().eq('employee_id', id);
    const { error } = await db.from('employees').delete().eq('id', id);
    if (error) {
      alert('Failed to delete employee: ' + error.message);
    } else {
      await initAdminMatrix();
    }
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

// ============ KPI CLICK HANDLERS ============

function setupAdminKpiClickHandlers() {
  const kpiCards = document.querySelectorAll('[onclick^="openAdminKpiModal"]');
  kpiCards.forEach(card => {
    card.style.cursor = 'pointer';
  });
}

// ============ WINDOW LOAD ============

window.addEventListener('DOMContentLoaded', async () => {
  const picker = document.getElementById('adminMonthPicker');
  if (picker) picker.value = getCurrentYearMonth();
  
  const bulkDate = document.getElementById('bulkDateInput');
  if (bulkDate) bulkDate.value = getTodayDateStr();
  
  const bulkWeek = document.getElementById('bulkWeekInput');
  if (bulkWeek) {
    const today = new Date();
    const day = today.getDay();
    const diff = today.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(today.setDate(diff));
    bulkWeek.value = monday.toISOString().split('T')[0];
  }
  
  const isAuth = await checkAdminAuth();
  if (isAuth) {
    await initAdminMatrix();
    await loadRequests();
    setupAdminKpiClickHandlers();
  }
});

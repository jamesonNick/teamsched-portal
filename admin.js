const SUPABASE_URL = 'https://kheaochbnwfkmjwnyjpf.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtoZWFvY2hibndma21qd255anBmIiwicm9sZSI6IkFub24iLCJpYXQiOjE3ODg2MDIxNjAsImV4cCI6MjEwNDE3ODE2MH0.4DdYobqvoWR8cBpe_bC160-kSTEAI2lSlyh4h8kHtq8';

const db = supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

let globalEmployees = [];
let globalSchedules = [];


// ============================================================
// HELPER FUNCTIONS
// ============================================================

function getCurrentYearMonth() {
  const now = new Date();

  return `${now.getFullYear()}-${String(
    now.getMonth() + 1
  ).padStart(2, '0')}`;
}


function getTodayDateStr() {
  const now = new Date();

  return formatLocalDate(now);
}


function formatLocalDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}


function addDaysLocal(dateString, days) {
  const [year, month, day] = dateString
    .split('-')
    .map(Number);

  const date = new Date(
    year,
    month - 1,
    day
  );

  date.setDate(date.getDate() + days);

  return formatLocalDate(date);
}


function getMonthDates(yearMonth) {
  const [year, month] = yearMonth
    .split('-')
    .map(Number);

  const totalDays =
    new Date(year, month, 0).getDate();

  return Array.from(
    { length: totalDays },
    (_, i) => {

      const dayNum =
        String(i + 1).padStart(2, '0');

      const dateStr =
        `${yearMonth}-${dayNum}`;

      const dateObj =
        new Date(year, month - 1, i + 1);

      const dayOfWeek =
        dateObj.getDay();

      const isWeekend =
        dayOfWeek === 0 ||
        dayOfWeek === 6;

      const dayName =
        dateObj.toLocaleDateString(
          'en-US',
          {
            weekday: 'short'
          }
        );

      return {
        dateStr,
        dayNum,
        dayName,
        isWeekend
      };
    }
  );
}


function normalizeStatus(status) {
  if (!status) {
    return 'WFH';
  }

  const value =
    String(status).trim().toUpperCase();

  const validStatuses = [
    'WFH',
    'WFO',
    'VL',
    'VL (AM)',
    'VL (PM)',
    'SL',
    'SL (AM)',
    'SL (PM)',
    'HOLIDAY'
  ];

  const matched =
    validStatuses.find(
      statusValue =>
        statusValue.toUpperCase() === value
    );

  return matched || 'WFH';
}


function getBadgeClass(status, isWeekend) {

  if (isWeekend) {
    return 'badge-weekend';
  }

  status = normalizeStatus(status);

  if (status === 'WFO') {
    return 'badge-wfo';
  }

  if (status.startsWith('VL')) {
    return 'badge-vl';
  }

  if (status.startsWith('SL')) {
    return 'badge-sl';
  }

  if (status === 'HOLIDAY') {
    return 'badge-holiday';
  }

  return 'badge-wfh';
}


function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}


// ============================================================
// SUPABASE PAGINATION
// ============================================================

async function fetchAllRows(
  table,
  select = '*',
  orderColumn = 'id'
) {

  const pageSize = 1000;

  let from = 0;

  const allRows = [];

  while (true) {

    const to =
      from + pageSize - 1;

    const {
      data,
      error
    } = await db
      .from(table)
      .select(select)
      .order(
        orderColumn,
        {
          ascending: true
        }
      )
      .range(from, to);

    if (error) {

      throw new Error(
        `Failed to fetch ${table}: ${error.message}`
      );

    }

    if (
      !data ||
      data.length === 0
    ) {
      break;
    }

    allRows.push(...data);

    if (
      data.length < pageSize
    ) {
      break;
    }

    from += pageSize;
  }

  return allRows;
}


// ============================================================
// TOAST
// ============================================================

function showToast(
  message,
  type = 'success'
) {

  let toast =
    document.getElementById('toast');

  if (!toast) {

    toast =
      document.createElement('div');

    toast.id = 'toast';
    toast.className = 'toast';

    document.body.appendChild(toast);
  }

  toast.textContent = message;

  toast.className =
    `toast ${type}`;

  toast.classList.add('show');

  setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}


// ============================================================
// AUTHENTICATION
// ============================================================

async function checkAdminAuth() {

  try {

    const {
      data: {
        session
      }
    } = await db.auth.getSession();


    if (!session) {

      const modal =
        document.getElementById(
          'loginModal'
        );

      if (modal) {
        modal.classList.remove(
          'hidden'
        );
      }

      return false;
    }


    const {
      data: profile,
      error
    } = await db
      .from('profiles')
      .select('role')
      .eq(
        'id',
        session.user.id
      )
      .single();


    if (
      error ||
      !profile ||
      profile.role !== 'admin'
    ) {

      alert(
        'Access denied. Admin privileges required.'
      );

      await db.auth.signOut();

      window.location.href =
        'login.html';

      return false;
    }


    const modal =
      document.getElementById(
        'loginModal'
      );

    if (modal) {
      modal.classList.add(
        'hidden'
      );
    }

    return true;

  } catch (err) {

    console.error(
      'Auth check error:',
      err
    );

    return false;
  }
}


async function handleLogin() {

  const email =
    document.getElementById(
      'loginEmail'
    )?.value.trim();

  const password =
    document.getElementById(
      'loginPassword'
    )?.value;


  if (!email || !password) {

    alert(
      'Please enter both email and password.'
    );

    return;
  }


  try {

    const {
      error
    } = await db.auth.signInWithPassword({
      email,
      password
    });


    if (error) {

      alert(
        'Authentication failed: ' +
        error.message
      );

      return;
    }


    const isAuth =
      await checkAdminAuth();


    if (isAuth) {

      await initAdminMatrix();

      await loadRequests();

    }

  } catch (err) {

    alert(
      'Login error: ' +
      err.message
    );

  }
}


async function handleLogout() {

  await db.auth.signOut();

  window.location.href =
    'login.html';
}


// ============================================================
// ADMIN MATRIX
// ============================================================

async function initAdminMatrix() {

  const isAuth =
    await checkAdminAuth();

  if (!isAuth) {
    return;
  }


  const head =
    document.getElementById(
      'adminMatrixHead'
    );

  const body =
    document.getElementById(
      'adminMatrixBody'
    );


  if (!head || !body) {
    return;
  }


  const monthVal =
    document.getElementById(
      'adminMonthPicker'
    )?.value ||
    getCurrentYearMonth();


  const fullMonthDates =
    getMonthDates(monthVal);


  const searchVal =
    document.getElementById(
      'searchInput'
    )?.value
      .toLowerCase()
      .trim() || '';


  const teamVal =
    document.getElementById(
      'teamFilter'
    )?.value ||
    'ALL';


  const sortVal =
    document.getElementById(
      'sortOrder'
    )?.value ||
    'ASC';


  // ==========================================================
  // HEADER
  // ==========================================================

  let headHTML = `
    <tr>

      <th
        class="p-2 border-r bg-slate-900 sticky left-0 z-20 min-w-[180px]"
      >
        EMPLOYEE NAME
      </th>

      <th
        class="p-2 border-r bg-slate-900 min-w-[100px]"
      >
        TEAM
      </th>
  `;


  fullMonthDates.forEach(d => {

    const bgClass =
      d.isWeekend
        ? 'bg-slate-700 text-slate-400'
        : 'bg-amber-400 text-slate-900 font-bold';


    headHTML += `
      <th
        class="p-1 text-center border-r min-w-[65px] ${bgClass}"
      >

        <div class="text-[9px] uppercase">
          ${d.dayName}
        </div>

        <div>
          ${d.dayNum}
        </div>

      </th>
    `;
  });


  headHTML += `
      <th
        class="p-2 text-center bg-slate-900 sticky right-0 z-20 min-w-[80px]"
      >
        ACTION
      </th>

    </tr>
  `;


  head.innerHTML =
    headHTML;


  // ==========================================================
  // FETCH ALL DATA
  // ==========================================================

  let employees = [];
  let schedules = [];


  try {

    [
      employees,
      schedules
    ] = await Promise.all([
      fetchAllRows(
        'employees',
        '*',
        'id'
      ),
      fetchAllRows(
        'schedules',
        '*',
        'id'
      )
    ]);

  } catch (err) {

    console.error(
      'Error fetching admin data:',
      err
    );


    body.innerHTML = `
      <tr>
        <td
          colspan="35"
          class="p-4 text-center text-red-500"
        >
          Error loading data:
          ${escapeHtml(err.message)}
        </td>
      </tr>
    `;

    return;
  }


  // ==========================================================
  // GLOBAL CACHE
  // ==========================================================

  globalEmployees =
    employees || [];

  globalSchedules =
    schedules || [];


  updateAdminKpis(
    monthVal
  );

  updateTodayStatus();


  // ==========================================================
  // FILTER
  // ==========================================================

  let filteredEmployees =
    globalEmployees.filter(
      emp => {

        const employeeName =
          String(
            emp.name || ''
          ).toLowerCase();


        const matchesSearch =
          employeeName.includes(
            searchVal
          );


        const matchesTeam =
          teamVal === 'ALL' ||
          emp.team === teamVal;


        return (
          matchesSearch &&
          matchesTeam
        );
      }
    );


  // ==========================================================
  // SORT
  // ==========================================================

  filteredEmployees.sort(
    (a, b) => {

      const nameA =
        String(a.name || '');

      const nameB =
        String(b.name || '');


      return sortVal === 'ASC'
        ? nameA.localeCompare(
            nameB
          )
        : nameB.localeCompare(
            nameA
          );
    }
  );


  if (
    filteredEmployees.length === 0
  ) {

    body.innerHTML = `
      <tr>

        <td
          colspan="35"
          class="p-4 text-center text-slate-400"
        >
          No employees match your filters
        </td>

      </tr>
    `;

    return;
  }


  // ==========================================================
  // SCHEDULE MAP
  // ==========================================================

  const scheduleMap =
    new Map();


  globalSchedules.forEach(
    schedule => {

      const key =
        `${schedule.employee_id}_${schedule.date}`;


      scheduleMap.set(
        key,
        normalizeStatus(
          schedule.status
        )
      );

    }
  );


  // ==========================================================
  // TABLE BODY
  // ==========================================================

  body.innerHTML =
    filteredEmployees
      .map(emp => {

        let rowHTML = `
          <tr>

            <td
              class="p-2 border-r font-bold text-slate-800 sticky left-0 bg-white shadow-sm"
            >
              ${escapeHtml(
                emp.name || ''
              )}
            </td>

            <td
              class="p-2 border-r text-slate-500"
            >
              ${escapeHtml(
                emp.team || ''
              )}
            </td>
        `;


        fullMonthDates.forEach(
          d => {

            // Weekend
            if (d.isWeekend) {

              rowHTML += `
                <td
                  class="p-1 border-r text-center bg-slate-100"
                ></td>
              `;

              return;
            }


            const key =
              `${emp.id}_${d.dateStr}`;


            const status =
              scheduleMap.get(
                key
              ) || 'WFH';


            rowHTML += `
              <td
                class="p-1 border-r text-center"
              >

                <select
                  onchange="handleDropdownChange(this, ${emp.id}, '${d.dateStr}')"
                  class="text-[9px] font-bold p-1 rounded border ${getBadgeClass(
                    status,
                    false
                  )} outline-none"
                >

                  <option
                    value="WFH"
                    ${status === 'WFH' ? 'selected' : ''}
                  >
                    WFH
                  </option>

                  <option
                    value="WFO"
                    ${status === 'WFO' ? 'selected' : ''}
                  >
                    WFO
                  </option>

                  <option
                    value="VL"
                    ${status === 'VL' ? 'selected' : ''}
                  >
                    VL
                  </option>

                  <option
                    value="VL (AM)"
                    ${status === 'VL (AM)' ? 'selected' : ''}
                  >
                    VL (AM)
                  </option>

                  <option
                    value="VL (PM)"
                    ${status === 'VL (PM)' ? 'selected' : ''}
                  >
                    VL (PM)
                  </option>

                  <option
                    value="SL"
                    ${status === 'SL' ? 'selected' : ''}
                  >
                    SL
                  </option>

                  <option
                    value="SL (AM)"
                    ${status === 'SL (AM)' ? 'selected' : ''}
                  >
                    SL (AM)
                  </option>

                  <option
                    value="SL (PM)"
                    ${status === 'SL (PM)' ? 'selected' : ''}
                  >
                    SL (PM)
                  </option>

                  <option
                    value="HOLIDAY"
                    ${status === 'HOLIDAY' ? 'selected' : ''}
                  >
                    HOLIDAY
                  </option>

                </select>

              </td>
            `;
          }
        );


        const safeName =
          String(
            emp.name || ''
          ).replace(
            /'/g,
            "\\'"
          );


        const safeTeam =
          String(
            emp.team || ''
          ).replace(
            /'/g,
            "\\'"
          );


        rowHTML += `
            <td
              class="p-1 text-center bg-white sticky right-0 shadow-sm"
            >

              <div
                class="flex items-center justify-center gap-1"
              >

                <button
                  onclick="openEditEmpModal(${emp.id}, '${safeName}', '${safeTeam}')"
                  class="text-indigo-600 font-bold hover:bg-indigo-50 p-1.5 rounded-lg transition text-xs"
                  title="Edit Employee"
                >
                  ✏️
                </button>

                <button
                  onclick="deleteEmployee(${emp.id})"
                  class="text-rose-600 font-bold hover:bg-rose-50 p-1.5 rounded-lg transition text-xs"
                  title="Delete Employee"
                >
                  🗑️
                </button>

              </div>

            </td>

          </tr>
        `;


        return rowHTML;

      })
      .join('');
}


// ============================================================
// KPI
// ============================================================

function updateAdminKpis(
  selectedMonth
) {

  const monthScheds =
    globalSchedules.filter(
      s =>
        String(
          s.date || ''
        ).startsWith(
          selectedMonth
        )
    );


  const totalElem =
    document.getElementById(
      'adminKpiTotal'
    );

  const leavesElem =
    document.getElementById(
      'adminKpiLeaves'
    );

  const holidaysElem =
    document.getElementById(
      'adminKpiHolidays'
    );


  if (totalElem) {

    totalElem.innerText =
      globalEmployees.length;
  }


  if (leavesElem) {

    leavesElem.innerText =
      monthScheds.filter(
        s => {

          const status =
            normalizeStatus(
              s.status
            );

          return (
            status.startsWith(
              'VL'
            ) ||
            status.startsWith(
              'SL'
            )
          );
        }
      ).length;
  }


  if (holidaysElem) {

    holidaysElem.innerText =
      new Set(
        monthScheds
          .filter(
            s =>
              normalizeStatus(
                s.status
              ) === 'HOLIDAY'
          )
          .map(
            s => s.date
          )
      ).size;
  }
}


function updateTodayStatus() {

  const today =
    getTodayDateStr();


  const todayScheds =
    globalSchedules.filter(
      s => s.date === today
    );


  const wfoCount =
    todayScheds.filter(
      s =>
        normalizeStatus(
          s.status
        ) === 'WFO'
    ).length;


  const wfhCount =
    todayScheds.filter(
      s =>
        normalizeStatus(
          s.status
        ) === 'WFH'
    ).length;


  const leaveCount =
    todayScheds.filter(
      s => {

        const status =
          normalizeStatus(
            s.status
          );

        return (
          status.startsWith('VL') ||
          status.startsWith('SL')
        );
      }
    ).length;


  const holidayCount =
    todayScheds.filter(
      s =>
        normalizeStatus(
          s.status
        ) === 'HOLIDAY'
    ).length;


  const elem =
    document.getElementById(
      'adminKpiToday'
    );


  if (elem) {

    elem.innerText =
      `🏢${wfoCount} 🏠${wfhCount} ✈️${leaveCount} 🥳${holidayCount}`;

  }
}


// ============================================================
// SINGLE DROPDOWN UPDATE
// ============================================================

async function handleDropdownChange(
  selectElem,
  empId,
  date
) {

  const newStatus =
    normalizeStatus(
      selectElem.value
    );


  console.log(
    '🔄 Updating:',
    {
      employee_id: empId,
      date,
      status: newStatus
    }
  );


  if (
    !confirm(
      `Confirm schedule update?\n\n` +
      `Employee ID: ${empId}\n` +
      `Date: ${date}\n` +
      `Status: ${newStatus}`
    )
  ) {

    await initAdminMatrix();

    return;
  }


  selectElem.disabled = true;


  selectElem.className =
    `text-[9px] font-bold p-1 rounded border ${getBadgeClass(
      newStatus,
      false
    )} outline-none`;


  try {

    const {
      data,
      error
    } = await db
      .from('schedules')
      .upsert(
        {
          employee_id:
            empId,

          date:
            date,

          status:
            newStatus
        },
        {
          onConflict:
            'employee_id,date'
        }
      )
      .select();


    if (error) {

      console.error(
        'Schedule update error:',
        error
      );


      alert(
        'Error saving schedule:\n\n' +
        error.message
      );


      await initAdminMatrix();

      return;
    }


    console.log(
      '✅ Schedule saved:',
      data
    );


    // ========================================================
    // UPDATE LOCAL CACHE
    // ========================================================

    const existingIndex =
      globalSchedules.findIndex(
        s =>
          Number(
            s.employee_id
          ) === Number(empId) &&
          s.date === date
      );


    if (
      existingIndex >= 0
    ) {

      globalSchedules[
        existingIndex
      ] = {
        ...globalSchedules[
          existingIndex
        ],

        employee_id:
          empId,

        date:
          date,

        status:
          newStatus
      };

    } else {

      globalSchedules.push({
        employee_id:
          empId,

        date:
          date,

        status:
          newStatus
      });

    }


    const monthVal =
      document.getElementById(
        'adminMonthPicker'
      )?.value ||
      getCurrentYearMonth();


    updateAdminKpis(
      monthVal
    );

    updateTodayStatus();


    showToast(
      `✅ ${newStatus} saved for ${date}`,
      'success'
    );


  } catch (err) {

    console.error(
      'Unexpected update error:',
      err
    );


    alert(
      'Error: ' +
      err.message
    );


    await initAdminMatrix();

  } finally {

    selectElem.disabled =
      false;

  }
}


// ============================================================
// KPI MODAL
// ============================================================

function openAdminKpiModal(
  type
) {

  const modal =
    document.getElementById(
      'kpiModal'
    );

  const title =
    document.getElementById(
      'modalTitle'
    );

  const list =
    document.getElementById(
      'modalList'
    );


  if (
    !modal ||
    !title ||
    !list
  ) {
    return;
  }


  const today =
    getTodayDateStr();


  const todayScheds =
    globalSchedules.filter(
      s =>
        s.date === today
    );


  let employees = [];


  // ==========================================================
  // ALL
  // ==========================================================

  if (type === 'ALL') {

    title.innerText =
      '👥 All Employees';

    employees =
      globalEmployees;

  }


  // ==========================================================
  // LEAVE
  // ==========================================================

  else if (
    type === 'LEAVE'
  ) {

    const monthVal =
      document.getElementById(
        'adminMonthPicker'
      )?.value ||
      getCurrentYearMonth();


    const monthScheds =
      globalSchedules.filter(
        s =>
          String(
            s.date || ''
          ).startsWith(
            monthVal
          )
      );


    const empIds =
      monthScheds
        .filter(
          s => {

            const status =
              normalizeStatus(
                s.status
              );

            return (
              status.startsWith(
                'VL'
              ) ||
              status.startsWith(
                'SL'
              )
            );
          }
        )
        .map(
          s => s.employee_id
        );


    const uniqueIds =
      [
        ...new Set(empIds)
      ];


    employees =
      globalEmployees.filter(
        e =>
          uniqueIds.includes(
            e.id
          )
      );


    title.innerText =
      '✈️ Employees on Leave This Month';

  }


  // ==========================================================
  // HOLIDAY
  // ==========================================================

  else if (
    type === 'HOLIDAY'
  ) {

    title.innerText =
      '🥳 Holidays This Month';


    const monthVal =
      document.getElementById(
        'adminMonthPicker'
      )?.value ||
      getCurrentYearMonth();


    const holidayDates =
      globalSchedules
        .filter(
          s => {

            const status =
              normalizeStatus(
                s.status
              );

            return (
              status ===
                'HOLIDAY' &&
              String(
                s.date || ''
              ).startsWith(
                monthVal
              )
            );
          }
        )
        .map(
          s => s.date
        );


    const uniqueDates =
      [
        ...new Set(
          holidayDates
        )
      ];


    list.innerHTML =
      uniqueDates.length > 0
        ? uniqueDates
            .map(
              d => `
                <div
                  class="p-2 bg-emerald-50 rounded-lg text-center font-bold text-emerald-700"
                >
                  ${d}
                </div>
              `
            )
            .join('')
        : `
            <div
              class="p-2 text-center text-slate-400"
            >
              No holidays this month
            </div>
          `;


    modal.classList.remove(
      'hidden'
    );

    return;
  }


  // ==========================================================
  // TODAY
  // ==========================================================

  else if (
    type === 'TODAY'
  ) {

    title.innerText =
      "📊 Today's Status Summary";


    const wfoEmp =
      todayScheds
        .filter(
          s =>
            normalizeStatus(
              s.status
            ) === 'WFO'
        )
        .map(
          s => s.employee_id
        );


    const wfhEmp =
      todayScheds
        .filter(
          s =>
            normalizeStatus(
              s.status
            ) === 'WFH'
        )
        .map(
          s => s.employee_id
        );


    const leaveEmp =
      todayScheds
        .filter(
          s => {

            const status =
              normalizeStatus(
                s.status
              );

            return (
              status.startsWith(
                'VL'
              ) ||
              status.startsWith(
                'SL'
              )
            );
          }
        )
        .map(
          s => s.employee_id
        );


    const holidayEmp =
      todayScheds
        .filter(
          s =>
            normalizeStatus(
              s.status
            ) === 'HOLIDAY'
        )
        .map(
          s => s.employee_id
        );


    let html = '';


    if (
      wfoEmp.length > 0
    ) {

      html += `
        <div
          class="font-bold text-red-600 mt-2"
        >
          🏢 WFO (${wfoEmp.length}):
        </div>
      `;


      html +=
        globalEmployees
          .filter(
            e =>
              wfoEmp.includes(
                e.id
              )
          )
          .map(
            e => `
              <div
                class="p-1.5 bg-red-50 rounded-lg text-xs"
              >
                ${escapeHtml(
                  e.name
                )}
              </div>
            `
          )
          .join('');
    }


    if (
      wfhEmp.length > 0
    ) {

      html += `
        <div
          class="font-bold text-blue-600 mt-2"
        >
          🏠 WFH (${wfhEmp.length}):
        </div>
      `;


      html +=
        globalEmployees
          .filter(
            e =>
              wfhEmp.includes(
                e.id
              )
          )
          .map(
            e => `
              <div
                class="p-1.5 bg-blue-50 rounded-lg text-xs"
              >
                ${escapeHtml(
                  e.name
                )}
              </div>
            `
          )
          .join('');
    }


    if (
      leaveEmp.length > 0
    ) {

      html += `
        <div
          class="font-bold text-amber-600 mt-2"
        >
          ✈️ On Leave (${leaveEmp.length}):
        </div>
      `;


      html +=
        globalEmployees
          .filter(
            e =>
              leaveEmp.includes(
                e.id
              )
          )
          .map(
            e => `
              <div
                class="p-1.5 bg-amber-50 rounded-lg text-xs"
              >
                ${escapeHtml(
                  e.name
                )}
              </div>
            `
          )
          .join('');
    }


    if (
      holidayEmp.length > 0
    ) {

      html += `
        <div
          class="font-bold text-emerald-600 mt-2"
        >
          🥳 Holiday (${holidayEmp.length}):
        </div>
      `;


      html +=
        globalEmployees
          .filter(
            e =>
              holidayEmp.includes(
                e.id
              )
          )
          .map(
            e => `
              <div
                class="p-1.5 bg-emerald-50 rounded-lg text-xs"
              >
                ${escapeHtml(
                  e.name
                )}
              </div>
            `
          )
          .join('');
    }


    if (!html) {

      html = `
        <div
          class="p-2 text-center text-slate-400"
        >
          No data for today
        </div>
      `;
    }


    list.innerHTML =
      html;


    modal.classList.remove(
      'hidden'
    );

    return;
  }


  // ==========================================================
  // EMPLOYEE LIST
  // ==========================================================

  if (
    employees.length === 0
  ) {

    list.innerHTML = `
      <div
        class="p-2 text-center text-slate-400"
      >
        No employees found
      </div>
    `;

  } else {

    list.innerHTML =
      employees
        .map(
          e => `
            <div
              class="p-2 bg-slate-50 rounded-lg flex justify-between items-center"
            >

              <span
                class="font-bold text-slate-800"
              >
                ${escapeHtml(
                  e.name
                )}
              </span>

              <span
                class="text-xs text-slate-500"
              >
                ${escapeHtml(
                  e.team
                )}
              </span>

            </div>
          `
        )
        .join('');
  }


  modal.classList.remove(
    'hidden'
  );
}


function closeKpiModal() {

  document
    .getElementById(
      'kpiModal'
    )
    ?.classList.add(
      'hidden'
    );
}


// ============================================================
// EDIT EMPLOYEE
// ============================================================

function openEditEmpModal(
  id,
  name,
  team
) {

  document.getElementById(
    'editEmpId'
  ).value = id;


  document.getElementById(
    'editEmpName'
  ).value = name;


  document.getElementById(
    'editEmpTeam'
  ).value = team;


  document.getElementById(
    'editEmpModal'
  ).classList.remove(
    'hidden'
  );
}


function closeEditEmpModal() {

  document.getElementById(
    'editEmpModal'
  ).classList.add(
    'hidden'
  );
}


async function submitEditEmployee() {

  const id =
    document.getElementById(
      'editEmpId'
    ).value;


  const name =
    document.getElementById(
      'editEmpName'
    ).value.trim();


  const team =
    document.getElementById(
      'editEmpTeam'
    ).value;


  if (!name) {

    alert(
      'Please enter employee name.'
    );

    return;
  }


  try {

    const {
      error
    } = await db
      .from('employees')
      .update({
        name,
        team
      })
      .eq(
        'id',
        id
      );


    if (error) {

      alert(
        'Failed to update employee: ' +
        error.message
      );

      return;
    }


    showToast(
      '✅ Employee updated successfully!',
      'success'
    );


    closeEditEmpModal();

    await refreshAllData();


  } catch (err) {

    alert(
      'Error: ' +
      err.message
    );

  }
}


// ============================================================
// BULK MODE
// ============================================================

function toggleBulkInputMode() {

  const mode =
    document.getElementById(
      'bulkMode'
    )?.value;


  const dayContainer =
    document.getElementById(
      'bulkDayContainer'
    );


  const weekContainer =
    document.getElementById(
      'bulkWeekContainer'
    );


  if (dayContainer) {

    dayContainer.classList.add(
      'hidden'
    );
  }


  if (weekContainer) {

    weekContainer.classList.add(
      'hidden'
    );
  }


  if (
    mode === 'DAY' &&
    dayContainer
  ) {

    dayContainer.classList.remove(
      'hidden'
    );

  } else if (
    mode === 'WEEK' &&
    weekContainer
  ) {

    weekContainer.classList.remove(
      'hidden'
    );

  }
}


// ============================================================
// BULK STATUS UPDATE
// ============================================================

async function applyBulkStatus() {

  const mode =
    document.getElementById(
      'bulkMode'
    )?.value;


  const statusInput =
    document.getElementById(
      'bulkStatusInput'
    )?.value || '';


  const statusVal =
    normalizeStatus(
      statusInput
    );


  const monthVal =
    document.getElementById(
      'adminMonthPicker'
    )?.value ||
    getCurrentYearMonth();


  console.log(
    '================================'
  );

  console.log(
    '🚀 BULK UPDATE START'
  );

  console.log(
    'Mode:',
    mode
  );

  console.log(
    'Status:',
    statusVal
  );

  console.log(
    'Month:',
    monthVal
  );

  console.log(
    '================================'
  );


  // ==========================================================
  // TARGET DATES
  // ==========================================================

  let targetDates = [];


  // ==========================================================
  // DAY
  // ==========================================================

  if (
    mode === 'DAY'
  ) {

    const dayVal =
      document.getElementById(
        'bulkDateInput'
      )?.value;


    if (!dayVal) {

      alert(
        'Select a target date.'
      );

      return;
    }


    targetDates = [
      dayVal
    ];
  }


  // ==========================================================
  // WEEK
  // ==========================================================

  else if (
    mode === 'WEEK'
  ) {

    const weekStart =
      document.getElementById(
        'bulkWeekInput'
      )?.value;


    if (!weekStart) {

      alert(
        'Select Monday start date.'
      );

      return;
    }


    // Monday to Friday
    for (
      let i = 0;
      i < 5;
      i++
    ) {

      targetDates.push(
        addDaysLocal(
          weekStart,
          i
        )
      );

    }

  }


  // ==========================================================
  // MONTH
  // ==========================================================

  else if (
    mode === 'MONTH'
  ) {

    const allDates =
      getMonthDates(
        monthVal
      );


    targetDates =
      allDates
        .filter(
          d =>
            !d.isWeekend
        )
        .map(
          d =>
            d.dateStr
        );
  }


  else {

    alert(
      'Invalid bulk update mode.'
    );

    return;
  }


  // ==========================================================
  // UNIQUE DATES
  // ==========================================================

  targetDates = [
    ...new Set(
      targetDates
    )
  ];


  if (
    targetDates.length === 0
  ) {

    alert(
      'No dates found to update.'
    );

    return;
  }


  console.log(
    '📅 Target dates:',
    targetDates
  );


  // ==========================================================
  // FETCH ALL EMPLOYEES
  // ==========================================================

  let allEmployees;


  try {

    allEmployees =
      await fetchAllRows(
        'employees',
        '*',
        'id'
      );

  } catch (err) {

    alert(
      'Error fetching employees:\n\n' +
      err.message
    );

    return;
  }


  if (
    !allEmployees ||
    allEmployees.length === 0
  ) {

    alert(
      'No employees found.'
    );

    return;
  }


  // ==========================================================
  // PREPARE RECORDS
  // ==========================================================

  const records = [];


  for (
    const emp of allEmployees
  ) {

    for (
      const date of targetDates
    ) {

      records.push({
        employee_id:
          emp.id,

        date:
          date,

        status:
          statusVal
      });

    }
  }


  const totalRecords =
    records.length;


  const dayType =
    mode === 'WEEK'
      ? '5 weekdays (Mon-Fri)'
      : mode === 'MONTH'
        ? 'weekdays only'
        : '1 day';


  // ==========================================================
  // CONFIRM
  // ==========================================================

  const confirmed =
    confirm(
      `⚠️ BULK SCHEDULE UPDATE\n\n` +

      `Status: ${statusVal}\n` +

      `Employees: ${allEmployees.length}\n` +

      `Dates: ${targetDates.length} (${dayType})\n` +

      `Total records: ${totalRecords}\n\n` +

      `Continue?`
    );


  if (!confirmed) {
    return;
  }


  // ==========================================================
  // UPLOAD
  // ==========================================================

  const chunkSize =
    500;


  let successCount = 0;

  let failedCount = 0;

  const errors = [];


  for (
    let i = 0;
    i < records.length;
    i += chunkSize
  ) {

    const chunk =
      records.slice(
        i,
        i + chunkSize
      );


    console.log(
      `📦 Uploading records ${i + 1}-${i + chunk.length} of ${records.length}`
    );


    try {

      const {
        error
      } = await db
        .from('schedules')
        .upsert(
          chunk,
          {
            onConflict:
              'employee_id,date'
          }
        );


      if (error) {

        console.error(
          '❌ Chunk failed:',
          error
        );


        failedCount +=
          chunk.length;


        errors.push(
          `Records ${i + 1}-${i + chunk.length}: ${error.message}`
        );

      } else {

        successCount +=
          chunk.length;


        console.log(
          `✅ Chunk successful: ${chunk.length}`
        );

      }


    } catch (err) {

      console.error(
        '❌ Unexpected chunk error:',
        err
      );


      failedCount +=
        chunk.length;


      errors.push(
        `Records ${i + 1}-${i + chunk.length}: ${err.message}`
      );

    }
  }


  // ==========================================================
  // FETCH FRESH DATA
  // ==========================================================

  console.log(
    '🔄 Reloading schedules from database...'
  );


  try {

    globalSchedules =
      await fetchAllRows(
        'schedules',
        '*',
        'id'
      );


    console.log(
      `📊 Database contains ${globalSchedules.length} schedule records`
    );


  } catch (err) {

    console.error(
      'Failed to reload schedules:',
      err
    );


    alert(
      'Bulk update was sent, but refresh failed:\n\n' +
      err.message
    );

    return;
  }


  // ==========================================================
  // VERIFY
  // ==========================================================

  console.log(
    '🔍 VERIFYING BULK UPDATE...'
  );


  let verifySuccess = 0;

  let verifyFailed = 0;


  for (
    const emp of allEmployees
  ) {

    for (
      const date of targetDates
    ) {

      const record =
        globalSchedules.find(
          s =>
            Number(
              s.employee_id
            ) === Number(
              emp.id
            ) &&
            s.date === date
        );


      const actualStatus =
        record
          ? normalizeStatus(
              record.status
            )
          : null;


      if (
        actualStatus ===
        statusVal
      ) {

        verifySuccess++;

      } else {

        verifyFailed++;


        console.warn(
          '❌ Verification failed:',
          {
            employee_id:
              emp.id,

            employee:
              emp.name,

            date:
              date,

            expected:
              statusVal,

            actual:
              actualStatus ||
              'NO RECORD'
          }
        );
      }
    }
  }


  console.log(
    '================================'
  );

  console.log(
    '📊 BULK UPDATE RESULT'
  );

  console.log(
    'Expected:',
    totalRecords
  );

  console.log(
    'Uploaded:',
    successCount
  );

  console.log(
    'Upload failed:',
    failedCount
  );

  console.log(
    'Verified:',
    verifySuccess
  );

  console.log(
    'Verification failed:',
    verifyFailed
  );

  console.log(
    '================================'
  );


  // ==========================================================
  // RESULT
  // ==========================================================

  if (
    failedCount === 0 &&
    verifyFailed === 0 &&
    verifySuccess === totalRecords
  ) {

    showToast(
      `✅ ${statusVal} applied successfully`,
      'success'
    );


    alert(
      `✅ BULK UPDATE SUCCESSFUL\n\n` +

      `Status: ${statusVal}\n` +

      `Employees: ${allEmployees.length}\n` +

      `Dates: ${targetDates.length}\n` +

      `Records updated: ${totalRecords}\n\n` +

      `Verified: ${verifySuccess}/${totalRecords}`
    );


  } else {

    showToast(
      `⚠️ Bulk update has ${verifyFailed} issue(s)`,
      'error'
    );


    alert(
      `⚠️ BULK UPDATE COMPLETED WITH ISSUES\n\n` +

      `Expected: ${totalRecords}\n` +

      `Uploaded: ${successCount}\n` +

      `Upload failed: ${failedCount}\n` +

      `Verified: ${verifySuccess}\n` +

      `Missing/Wrong: ${verifyFailed}\n\n` +

      (
        errors.length > 0
          ? `Errors:\n${errors
              .slice(0, 5)
              .join('\n')}`
          : `Check browser console (F12) for details.`
      )
    );
  }


  // ==========================================================
  // FINAL REFRESH
  // ==========================================================

  globalEmployees =
    allEmployees;


  await initAdminMatrix();


  updateAdminKpis(
    monthVal
  );


  updateTodayStatus();


  console.log(
    '✅ BULK UPDATE FINISHED'
  );
}


// ============================================================
// REFRESH ALL DATA
// ============================================================

async function refreshAllData() {

  try {

    const [
      employees,
      schedules
    ] = await Promise.all([
      fetchAllRows(
        'employees',
        '*',
        'id'
      ),
      fetchAllRows(
        'schedules',
        '*',
        'id'
      )
    ]);


    globalEmployees =
      employees || [];


    globalSchedules =
      schedules || [];


    await initAdminMatrix();

    await loadRequests();


    showToast(
      '✅ Data refreshed successfully!',
      'success'
    );


  } catch (err) {

    console.error(
      'Refresh error:',
      err
    );


    showToast(
      '❌ Error refreshing data: ' +
      err.message,
      'error'
    );

  }
}


// ============================================================
// REQUESTS
// ============================================================

async function loadRequests() {

  const badge =
    document.getElementById(
      'requestBadge'
    );


  const list =
    document.getElementById(
      'requestsList'
    );


  try {

    const {
      data: requests,
      error
    } = await db
      .from('requests')
      .select('*')
      .order(
        'created_at',
        {
          ascending: false
        }
      );


    if (error) {

      console.error(
        'Error loading requests:',
        error
      );


      if (badge) {

        badge.classList.add(
          'hidden'
        );
      }


      if (list) {

        list.innerHTML = `
          <tr>
            <td
              colspan="5"
              class="p-3 text-center text-red-500"
            >
              Error loading requests
            </td>
          </tr>
        `;
      }

      return;
    }


    if (
      !requests ||
      requests.length === 0
    ) {

      if (badge) {

        badge.classList.add(
          'hidden'
        );
      }


      if (list) {

        list.innerHTML = `
          <tr>
            <td
              colspan="5"
              class="p-3 text-center text-slate-400"
            >
              No pending requests found.
            </td>
          </tr>
        `;
      }

      return;
    }


    if (badge) {

      badge.innerText =
        requests.length;

      badge.classList.remove(
        'hidden'
      );
    }


    if (list) {

      list.innerHTML =
        requests
          .map(
            r => `
              <tr
                class="hover:bg-slate-50"
              >

                <td
                  class="p-2 font-bold text-slate-800"
                >
                  ${escapeHtml(
                    r.employee_name ||
                    'Unknown'
                  )}
                </td>

                <td
                  class="p-2 text-slate-600"
                >
                  ${escapeHtml(
                    r.date ||
                    'N/A'
                  )}
                </td>

                <td
                  class="p-2 font-bold text-indigo-600"
                >
                  ${escapeHtml(
                    r.request_type ||
                    'N/A'
                  )}
                </td>

                <td
                  class="p-2 text-slate-500"
                >
                  ${escapeHtml(
                    r.message ||
                    'N/A'
                  )}
                </td>

                <td
                  class="p-2 text-center"
                >

                  <button
                    onclick="deleteSingleRequest(${r.id})"
                    class="bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold px-2 py-1 rounded transition text-[10px]"
                    title="Clear Request"
                  >
                    Clear 🗑️
                  </button>

                </td>

              </tr>
            `
          )
          .join('');
    }


  } catch (err) {

    console.error(
      'Load requests error:',
      err
    );


    if (list) {

      list.innerHTML = `
        <tr>
          <td
            colspan="5"
            class="p-3 text-center text-red-500"
          >
            Error loading requests
          </td>
        </tr>
      `;
    }
  }
}


async function deleteSingleRequest(
  id
) {

  if (
    !confirm(
      'Mark this request as resolved/cleared?'
    )
  ) {
    return;
  }


  try {

    const {
      error
    } = await db
      .from('requests')
      .delete()
      .eq(
        'id',
        id
      );


    if (error) {

      alert(
        'Failed to delete request: ' +
        error.message
      );

    } else {

      await loadRequests();

    }

  } catch (err) {

    alert(
      'Error: ' +
      err.message
    );
  }
}


async function clearAllRequests() {

  if (
    !confirm(
      'Are you sure you want to clear ALL submitted requests?'
    )
  ) {
    return;
  }


  try {

    const {
      error
    } = await db
      .from('requests')
      .delete()
      .gt(
        'id',
        0
      );


    if (error) {

      alert(
        'Failed to clear all requests: ' +
        error.message
      );

    } else {

      alert(
        'All requests have been cleared successfully.'
      );

      await loadRequests();

    }

  } catch (err) {

    alert(
      'Error: ' +
      err.message
    );
  }
}


function openRequestsModal() {

  document
    .getElementById(
      'requestsModal'
    )
    ?.classList.remove(
      'hidden'
    );


  loadRequests();
}


function closeRequestsModal() {

  document
    .getElementById(
      'requestsModal'
    )
    ?.classList.add(
      'hidden'
    );
}


// ============================================================
// EMPLOYEE CRUD
// ============================================================

function addNewEmployee() {

  document.getElementById(
    'addEmpName'
  ).value = '';


  document.getElementById(
    'addEmpModal'
  ).classList.remove(
    'hidden'
  );
}


function closeAddEmpModal() {

  document
    .getElementById(
      'addEmpModal'
    )
    ?.classList.add(
      'hidden'
    );
}


async function submitNewEmployee() {

  const name =
    document.getElementById(
      'addEmpName'
    ).value.trim();


  const team =
    document.getElementById(
      '

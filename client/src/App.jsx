import { useCallback, useEffect, useState } from "react";
import "./App.css";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000/api";

const request = async (path, { token, ...options } = {}) => {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || `Request failed (${response.status})`);
  }

  return data;
};

const getStoredSession = () => {
  try {
    const token = localStorage.getItem("leaveDeskToken");
    const user = JSON.parse(localStorage.getItem("leaveDeskUser") || "null");
    return token && user ? { token, user } : null;
  } catch {
    localStorage.removeItem("leaveDeskToken");
    localStorage.removeItem("leaveDeskUser");
    return null;
  }
};

const formatDate = (date) =>
  date ? new Date(date).toLocaleDateString() : "—";

const toDateKey = (date) => String(date).slice(0, 10);

const getDateKey = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const toCsvCell = (value) => {
  const text = String(value ?? "");
  const safeText = /^[\t\r ]*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safeText.replace(/"/g, '""')}"`;
};

const downloadCsv = (filename, rows) => {
  const csv = `\uFEFF${rows.map((row) => row.map(toCsvCell).join(",")).join("\r\n")}`;
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
};

const getLeaveDaysByYear = (startDate, endDate) => {
  const daysByYear = {};
  if (!startDate || !endDate) return daysByYear;

  const [startYear, startMonth, startDay] = startDate.split("-").map(Number);
  const [endYear, endMonth, endDay] = endDate.split("-").map(Number);
  let date = Date.UTC(startYear, startMonth - 1, startDay);
  const lastDate = Date.UTC(endYear, endMonth - 1, endDay);

  if (!Number.isFinite(date) || !Number.isFinite(lastDate) || lastDate < date) {
    return daysByYear;
  }

  const nationalHolidays = new Set([
    "0-26",
    "7-15",
    "9-2",
  ]);

  while (date <= lastDate) {
    const current = new Date(date);
    const weekday = current.getUTCDay();
    const holiday = nationalHolidays.has(`${current.getUTCMonth()}-${current.getUTCDate()}`);
    if (weekday !== 0 && weekday !== 6 && !holiday) {
      const year = current.getUTCFullYear();
      daysByYear[year] = (daysByYear[year] || 0) + 1;
    }
    date += 86400000;
  }

  return daysByYear;
};

const EMPTY_LEAVE_SUMMARY = {
  Casual: { entitlement: 0, used: 0, pending: 0, remaining: 0 },
  Sick: { entitlement: 0, used: 0, pending: 0, remaining: 0 },
  Earned: { entitlement: 0, used: 0, pending: 0, remaining: 0 },
};

function LeaveBalanceSummary({ summary, totalApprovedDays, isManager, teamSummary }) {
  const [isExpanded, setIsExpanded] = useState(isManager);
  const cards = [
    { label: "Casual remaining", value: summary?.Casual?.remaining ?? 0, tone: "casual" },
    { label: "Sick remaining", value: summary?.Sick?.remaining ?? 0, tone: "sick" },
    { label: "Earned remaining", value: summary?.Earned?.remaining ?? 0, tone: "earned" },
    {
      label: "Pending reserved",
      value: Object.values(summary || {}).reduce((total, item) => total + (item.pending || 0), 0),
      tone: "pending",
    },
    { label: "Used this year", value: totalApprovedDays ?? 0, tone: "used" },
  ];

  return (
    <section className="balance-section" aria-label={isManager ? "Team leave summary" : "Leave balance summary"}>
      <div className="section-heading">
        <button
          className="balance-toggle"
          type="button"
          aria-expanded={isExpanded}
          aria-controls="leave-balance-details"
          onClick={() => setIsExpanded((expanded) => !expanded)}
        >
          <span>{isManager ? "Team leave summary" : "Your leave balance"}</span>
          <span className="balance-chevron" aria-hidden="true">{isExpanded ? "−" : "+"}</span>
        </button>
        {isManager && teamSummary && (
          <span className="team-summary-label">{teamSummary.totalEmployees ?? 0} employees</span>
        )}
      </div>
      <div id="leave-balance-details" className="balance-grid" hidden={!isExpanded}>
        {cards.map(({ label, value, tone }) => (
          <article className={`balance-card ${tone}`} key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </article>
        ))}
      </div>
    </section>
  );
}

function Login({ onLogin }) {
  const [isSignup, setIsSignup] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "employee",
    managerInviteCode: "",
  });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const updateField = (event) => {
    setForm((previous) => ({ ...previous, [event.target.name]: event.target.value }));
  };

  const submit = async (event) => {
    event.preventDefault();
    setMessage("");
    setBusy(true);

    try {
      if (isSignup) {
        await request("/auth/register", {
          method: "POST",
          body: JSON.stringify({
            name: form.name,
            email: form.email,
            password: form.password,
            role: form.role,
            ...(form.role === "manager" ? { managerInviteCode: form.managerInviteCode } : {}),
          }),
        });
      }

      const data = await request("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: form.email, password: form.password }),
      });
      onLogin(data);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="logo" aria-hidden="true">L</div>
        <h1>{isSignup ? "Create your account" : "Welcome to LeaveDesk"}</h1>
        <p className="subtitle">
          {isSignup ? "Choose your role to get started. Manager signup requires an invite code." : "Sign in to manage your leave requests."}
        </p>
        <form onSubmit={submit}>
          {isSignup && (
            <>
              <div className="form-group">
                <label htmlFor="name">Full name</label>
                <input id="name" name="name" value={form.name} onChange={updateField} required autoComplete="name" />
              </div>
              <div className="form-group">
                <label htmlFor="role">Account role</label>
                <select id="role" name="role" value={form.role} onChange={updateField}>
                  <option value="employee">Employee</option>
                  <option value="manager">Manager</option>
                </select>
              </div>
              {form.role === "manager" && (
                <div className="form-group">
                  <label htmlFor="managerInviteCode">Manager invite code</label>
                  <input
                    id="managerInviteCode"
                    name="managerInviteCode"
                    type="password"
                    value={form.managerInviteCode}
                    onChange={updateField}
                    required
                    autoComplete="off"
                  />
                </div>
              )}
            </>
          )}
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input id="email" name="email" type="email" value={form.email} onChange={updateField} required autoComplete="email" />
          </div>
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <div className="password-input-wrap">
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                value={form.password}
                onChange={updateField}
                required
                minLength={8}
                autoComplete={isSignup ? "new-password" : "current-password"}
              />
              <button
                className="password-visibility-toggle"
                type="button"
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                onClick={() => setShowPassword((shown) => !shown)}
              >
                {showPassword ? (
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8" />
                    <path d="M9.9 5.2A10.8 10.8 0 0112 5c5.2 0 9 4.5 10 7-.4 1-1.3 2.2-2.5 3.3M6.2 6.2C3.9 7.7 2.5 9.8 2 12c1 2.5 4.8 7 10 7 1.5 0 2.8-.4 4-1" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </div>
          {message && <p role="status">{message}</p>}
          <button type="submit" disabled={busy}>
            {busy ? "Please wait…" : isSignup ? "Create account" : "Sign in"}
          </button>
        </form>
        <p className="signup-text">
          {isSignup ? "Already have an account? " : "New to LeaveDesk? "}
          <button className="text-button" type="button" onClick={() => { setIsSignup(!isSignup); setMessage(""); }}>
            {isSignup ? "Sign in" : "Create an account"}
          </button>
        </p>
      </section>
      <footer>LeaveDesk · Leave management made simple</footer>
    </main>
  );
}

function Summary({ leaves }) {
  const totals = [
    ["Total requests", leaves.length, "total"],
    ["Pending", leaves.filter((leave) => leave.status === "Pending").length, "pending"],
    ["Approved", leaves.filter((leave) => leave.status === "Approved").length, "approved"],
    ["Rejected", leaves.filter((leave) => leave.status === "Rejected").length, "rejected"],
  ];

  return (
    <section className="leave-summary" aria-label="Leave request summary">
      {totals.map(([label, count, style]) => (
        <article className={`summary-card ${style}`} key={label}>
          <h3>{label}</h3>
          <p>{count}</p>
        </article>
      ))}
    </section>
  );
}

function TeamDirectory({
  members,
  managers,
  loading,
  error,
  actionError,
  savingId,
  search,
  onSearchChange,
  onAssign,
}) {
  const searchTerm = search.trim().toLowerCase();
  const filteredMembers = members.filter((member) =>
    [
      member.name,
      member.email,
      member.role,
      member.phone,
      member.department,
      member.employeeId,
      member.manager?.name,
      member.manager?.email,
    ].some((value) => String(value || "").toLowerCase().includes(searchTerm))
  );

  return (
    <section className="dashboard-card team-directory" aria-labelledby="team-directory-title">
      <div className="leaves-heading">
        <div>
          <h3 id="team-directory-title">Employees and managers</h3>
          <p>Assign employees to managers. Full contact details are visible only for your assigned team.</p>
        </div>
        <label className="team-directory-search">
          <span>Search team</span>
          <input
            type="search"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Name, email, department, or ID"
          />
        </label>
      </div>
      {error ? (
        <p className="error-message" role="status">{error}</p>
      ) : loading ? (
        <p role="status">Loading team directory…</p>
      ) : filteredMembers.length ? (
        <>
          {actionError && <p className="error-message" role="status">{actionError}</p>}
          <div className="leave-table-wrapper">
            <table className="leave-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Department</th>
                  <th>Employee ID</th>
                  <th>Joining date</th>
                  <th>Assigned manager</th>
                </tr>
              </thead>
              <tbody>
                {filteredMembers.map((member) => (
                  <tr key={member._id}>
                    <td>{member.name || "—"}</td>
                    <td><span className={`directory-role ${member.role}`}>{member.role}</span></td>
                    <td>{member.email || "—"}</td>
                    <td>{member.phone || "—"}</td>
                    <td>{member.department || "—"}</td>
                    <td>{member.employeeId || "—"}</td>
                    <td>{member.joiningDate ? formatDate(member.joiningDate) : "—"}</td>
                    <td>
                      {member.role === "employee" ? (
                        <select
                          aria-label={`Assign manager for ${member.name || member.email}`}
                          value={member.manager?._id || ""}
                          disabled={savingId === member._id}
                          onChange={(event) => onAssign(member, event.target.value)}
                        >
                          <option value="">Unassigned</option>
                          {managers.map((manager) => (
                            <option value={manager._id} key={manager._id}>
                              {manager.name} ({manager.email})
                            </option>
                          ))}
                        </select>
                      ) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <p>{members.length ? "No team members match your search." : "No team members to show yet."}</p>
      )}
      {!loading && !error && (
        <p className="directory-count" aria-live="polite">
          Showing {filteredMembers.length} of {members.length} team members
        </p>
      )}
    </section>
  );
}

function LeaveCalendar({ leaves, manager }) {
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  const year = visibleMonth.getFullYear();
  const month = visibleMonth.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cellCount = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;
  const approvedLeaves = leaves.filter((leave) => leave.status === "Approved");

  return (
    <section className="dashboard-card leave-calendar" aria-label="Approved leave calendar">
      <div className="calendar-heading">
        <div>
          <h3>Leave calendar</h3>
          <p>Approved time off{manager ? " across your team" : " for you"}.</p>
        </div>
        <div className="calendar-controls">
          <button
            type="button"
            aria-label="Previous month"
            onClick={() => setVisibleMonth(new Date(year, month - 1, 1))}
          >
            ‹
          </button>
          <strong aria-live="polite">
            {visibleMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
          </strong>
          <button
            type="button"
            aria-label="Next month"
            onClick={() => setVisibleMonth(new Date(year, month + 1, 1))}
          >
            ›
          </button>
          <button
            type="button"
            className="calendar-today"
            onClick={() => {
              const today = new Date();
              setVisibleMonth(new Date(today.getFullYear(), today.getMonth(), 1));
            }}
          >
            Today
          </button>
        </div>
      </div>
      <div className="calendar-grid" role="grid" aria-label={visibleMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" })}>
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((weekday) => (
          <div className="calendar-weekday" role="columnheader" key={weekday}>{weekday}</div>
        ))}
        {Array.from({ length: cellCount }, (_, index) => {
          const day = index - firstWeekday + 1;
          if (day < 1 || day > daysInMonth) {
            return <div className="calendar-day empty" role="gridcell" aria-hidden="true" key={`empty-${index}`} />;
          }

          const date = new Date(year, month, day);
          const dateKey = getDateKey(date);
          const dayLeaves = approvedLeaves.filter(
            (leave) => toDateKey(leave.startDate) <= dateKey && toDateKey(leave.endDate) >= dateKey
          );
          const isToday = dateKey === getDateKey(new Date());

          return (
            <div className={`calendar-day${isToday ? " today" : ""}`} role="gridcell" key={dateKey}>
              <span className="calendar-day-number">{day}</span>
              <div className="calendar-events">
                {dayLeaves.slice(0, 2).map((leave) => (
                  <span
                    className={`calendar-event ${leave.leaveType?.toLowerCase() || "leave"}`}
                    key={leave._id}
                    title={`${manager ? `${leave.employee?.name || leave.employee?.email || "Employee"} · ` : ""}${leave.leaveType} leave`}
                  >
                    {manager ? leave.employee?.name || leave.employee?.email || "Employee" : leave.leaveType}
                  </span>
                ))}
                {dayLeaves.length > 2 && (
                  <span className="calendar-more">+{dayLeaves.length - 2} more</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="calendar-legend" aria-label="Leave type legend">
        <span><i className="casual" /> Casual</span>
        <span><i className="sick" /> Sick</span>
        <span><i className="earned" /> Earned</span>
      </div>
    </section>
  );
}

function LeaveTable({ leaves, manager, onCancel, onUpdate, busyId, emptyMessage, managerComments, onCommentChange }) {
  if (!leaves.length) {
    return <p>{emptyMessage}</p>;
  }

  return (
    <div className="leave-table-wrapper">
      <table className="leave-table">
        <thead>
          <tr>
            {manager && <th>Employee</th>}
            <th>Type</th>
            <th>Dates</th>
            <th>Reason</th>
            <th>Status</th>
            <th>Manager comment</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {leaves.map((leave) => (
            <tr key={leave._id}>
              {manager && <td>{leave.employee?.name || leave.employee?.email || "Employee"}</td>}
              <td>{leave.leaveType}</td>
              <td>{formatDate(leave.startDate)} – {formatDate(leave.endDate)}</td>
              <td>{leave.reason}</td>
              <td><span className={`status-badge status-${leave.status?.toLowerCase()}`}>{leave.status}</span></td>
              <td>{leave.managerComment || "—"}</td>
              <td>
                {manager && leave.status === "Pending" ? (
                  <div className="leave-review-actions">
                    <textarea
                      className="manager-comment-input"
                      aria-label={`Manager comment for ${leave.employee?.name || "employee"}`}
                      placeholder="Add a comment (optional)"
                      maxLength={500}
                      rows={2}
                      value={managerComments[leave._id] || ""}
                      onChange={(event) => onCommentChange(leave._id, event.target.value)}
                      disabled={busyId === leave._id}
                    />
                    <div className="action-buttons">
                      <button type="button" disabled={busyId === leave._id} onClick={() => onUpdate(leave, "Approved", managerComments[leave._id] || "")}>Approve</button>
                      <button type="button" className="danger-button" disabled={busyId === leave._id} onClick={() => onUpdate(leave, "Rejected", managerComments[leave._id] || "")}>Reject</button>
                    </div>
                  </div>
                ) : !manager && leave.status === "Pending" ? (
                  <button type="button" className="danger-button" disabled={busyId === leave._id} onClick={() => onCancel(leave)}>Cancel</button>
                ) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Dashboard({ session, onLogout, onProfileSaved }) {
  const { token, user } = session;
  const isManager = user.role === "manager";
  const [activeDashboardPage, setActiveDashboardPage] = useState("overview");
  const [leaves, setLeaves] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [managers, setManagers] = useState([]);
  const [directorySearch, setDirectorySearch] = useState("");
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [directoryError, setDirectoryError] = useState("");
  const [directoryActionError, setDirectoryActionError] = useState("");
  const [directorySavingId, setDirectorySavingId] = useState("");
  const [leaveFilters, setLeaveFilters] = useState({ search: "", status: "", leaveType: "", date: "" });
  const [notifications, setNotifications] = useState([]);
  const [leaveSummary, setLeaveSummary] = useState(EMPTY_LEAVE_SUMMARY);
  const [teamSummary, setTeamSummary] = useState(null);
  const [totalApprovedDays, setTotalApprovedDays] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [profile, setProfile] = useState({
    name: user.name || "",
    email: user.email || "",
    role: user.role || "employee",
    phone: "",
    department: "",
    employeeId: "",
    joiningDate: "",
    address: "",
    profilePhoto: "",
  });
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [profileLoadFailed, setProfileLoadFailed] = useState(false);
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [profileMessage, setProfileMessage] = useState("");
  const [form, setForm] = useState({ leaveType: "Casual", startDate: "", endDate: "", reason: "" });
  const [formLeaveSummaries, setFormLeaveSummaries] = useState({});
  const [formBalanceLoading, setFormBalanceLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [successToast, setSuccessToast] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [managerComments, setManagerComments] = useState({});

  const refresh = useCallback(async () => {
    setError("");
    try {
      const [leaveData, notificationData, summaryData] = await Promise.all([
        request(isManager ? "/leaves/all" : "/leaves/my-leaves", { token }),
        request("/notifications", { token }),
        request(isManager ? "/leaves/summary" : "/leaves/my-summary", { token }),
      ]);
      setLeaves(leaveData.leaves || []);
      setNotifications(notificationData.notifications || []);

      if (isManager) {
        setTeamSummary(summaryData || null);
        setTotalApprovedDays(
          summaryData?.summary
            ? Object.values(summaryData.summary).reduce((total, item) => total + (item.used || 0), 0)
            : 0
        );
      } else {
        setLeaveSummary(summaryData.summary || EMPTY_LEAVE_SUMMARY);
        setTotalApprovedDays(summaryData.totalApprovedDays || 0);
      }
    } catch (loadError) {
      setError(loadError.message);
    }
  }, [isManager, token]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!isManager || activeDashboardPage !== "directory") return undefined;

    let active = true;
    Promise.resolve()
      .then(() => {
        if (!active) return null;
        setDirectoryLoading(true);
        setDirectoryError("");
        return request("/auth/directory", { token });
      })
      .then((data) => {
        if (active && data) {
          setTeamMembers(data.members || []);
          setManagers(data.managers || []);
        }
      })
      .catch((loadError) => {
        if (active) setDirectoryError(loadError.message);
      })
      .finally(() => {
        if (active) setDirectoryLoading(false);
      });

    return () => {
      active = false;
    };
  }, [activeDashboardPage, isManager, token]);

  const assignManager = async (employee, managerId) => {
    setDirectorySavingId(employee._id);
    setDirectoryActionError("");
    try {
      const data = await request(`/auth/directory/${employee._id}/manager`, {
        token,
        method: "PATCH",
        body: JSON.stringify({ managerId: managerId || null }),
      });
      setTeamMembers((members) =>
        members.map((member) =>
          member._id === employee._id
            ? {
                ...member,
                manager: data.manager,
                ...(managerId === user.id
                  ? {}
                  : { phone: "", department: "", employeeId: "", joiningDate: "" }),
              }
            : member
        )
      );
      const directoryData = await request("/auth/directory", { token });
      setTeamMembers(directoryData.members || []);
      setManagers(directoryData.managers || []);
      setSuccessToast(data.message);
      await refresh();
    } catch (assignError) {
      setDirectoryActionError(assignError.message);
    } finally {
      setDirectorySavingId("");
    }
  };

  useEffect(() => {
    if (!successToast) return undefined;

    const timeoutId = window.setTimeout(() => setSuccessToast(""), 4000);
    return () => window.clearTimeout(timeoutId);
  }, [successToast]);

  useEffect(() => {
    if (isManager || activeDashboardPage !== "apply" || !form.startDate) {
      return undefined;
    }

    const daysByYear = getLeaveDaysByYear(form.startDate, form.endDate);
    const years = Object.keys(daysByYear);
    if (years.length === 0) years.push(form.startDate.slice(0, 4));
    let active = true;

    Promise.resolve()
      .then(() => {
        if (!active) return null;
        setFormBalanceLoading(true);
        setFormLeaveSummaries({});
        return Promise.all(
          years.map(async (year) => {
            const data = await request(`/leaves/my-summary?year=${year}`, { token });
            return [year, data.summary];
          })
        );
      })
      .then((yearSummaries) => {
        if (active && yearSummaries) {
          setFormLeaveSummaries(Object.fromEntries(yearSummaries));
        }
      })
      .catch((loadError) => {
        if (active) setError(loadError.message);
      })
      .finally(() => {
        if (active) setFormBalanceLoading(false);
      });

    return () => {
      active = false;
    };
  }, [activeDashboardPage, form.endDate, form.startDate, isManager, token]);

  useEffect(() => {
    if (!showProfile || profileLoaded) return undefined;

    let active = true;
    setProfileBusy(true);
    setProfileError("");
    setProfileLoadFailed(false);
    request("/auth/profile", { token })
      .then((data) => {
        if (active) setProfile(data.profile);
      })
      .catch((loadError) => {
        if (active) {
          setProfileError(loadError.message);
          setProfileLoadFailed(true);
          setProfileLoaded(true);
        }
      })
      .finally(() => {
        if (active) {
          setProfileLoaded(true);
          setProfileBusy(false);
        }
      });

    return () => {
      active = false;
    };
  }, [showProfile, profileLoaded, token]);

  const updateProfileField = (event) => {
    const { name, value } = event.target;
    setProfile((current) => ({ ...current, [name]: value }));
    setProfileMessage("");
  };

  const selectProfilePhoto = (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setProfileError("Choose a PNG, JPEG, or WebP image.");
      return;
    }

    if (file.size > 1024 * 1024) {
      setProfileError("Photo must be 1 MB or smaller.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setProfile((current) => ({ ...current, profilePhoto: reader.result }));
        setProfileError("");
        setProfileMessage("");
      } else {
        setProfileError("Could not read the selected photo.");
      }
    };
    reader.onerror = () => setProfileError("Could not read the selected photo.");
    reader.readAsDataURL(file);
  };

  const saveProfile = async (event) => {
    event.preventDefault();
    setProfileBusy(true);
    setProfileError("");
    setProfileMessage("");

    try {
      const data = await request("/auth/profile", {
        token,
        method: "PATCH",
        body: JSON.stringify(profile),
      });
      setProfile(data.profile);
      setProfileMessage(data.message || "Profile updated successfully.");
      onProfileSaved(data.profile);
    } catch (saveError) {
      setProfileError(saveError.message);
    } finally {
      setProfileBusy(false);
    }
  };

  const submitLeave = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const data = await request("/leaves", {
        token,
        method: "POST",
        body: JSON.stringify(form),
      });
      setSuccessToast(data.message || "Leave applied successfully.");
      setForm({ leaveType: "Casual", startDate: "", endDate: "", reason: "" });
      await refresh();
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setBusy(false);
    }
  };

  const cancelLeave = async (leave) => {
    setBusyId(leave._id);
    setError("");
    setMessage("");
    try {
      const data = await request(`/leaves/${leave._id}`, { token, method: "DELETE" });
      setMessage(data.message || "Leave request cancelled.");
      await refresh();
    } catch (cancelError) {
      setError(cancelError.message);
    } finally {
      setBusyId("");
    }
  };

  const updateLeave = async (leave, status, managerComment) => {
    setBusyId(leave._id);
    setError("");
    setMessage("");
    try {
      const data = await request(`/leaves/${leave._id}/status`, {
        token,
        method: "PATCH",
        body: JSON.stringify({ status, managerComment }),
      });
      setMessage(data.message || `Leave ${status.toLowerCase()}.`);
      setManagerComments((comments) => {
        const nextComments = { ...comments };
        delete nextComments[leave._id];
        return nextComments;
      });
      await refresh();
    } catch (updateError) {
      setError(updateError.message);
    } finally {
      setBusyId("");
    }
  };

  const markNotificationsRead = async () => {
    try {
      await request("/notifications/read", { token, method: "PATCH" });
      setNotifications((items) => items.map((item) => ({ ...item, readAt: item.readAt || new Date().toISOString() })));
    } catch (readError) {
      setError(readError.message);
    }
  };

  const unreadCount = notifications.filter((item) => !item.readAt).length;
  const pendingCount = leaves.filter((leave) => leave.status === "Pending").length;
  const requestedLeaveDaysByYear = getLeaveDaysByYear(form.startDate, form.endDate);
  const requestedLeaveDays = Object.values(requestedLeaveDaysByYear).reduce((total, days) => total + days, 0);
  const formLeaveBalanceReady = Object.keys(requestedLeaveDaysByYear).every(
    (year) => formLeaveSummaries[year]
  );
  const formLeaveBalanceExceeded = Object.entries(requestedLeaveDaysByYear).some(
    ([year, days]) => days > (formLeaveSummaries[year]?.[form.leaveType]?.remaining ?? 0)
  );
  const filteredLeaves = leaves.filter((leave) => {
    const search = leaveFilters.search.trim().toLowerCase();
    const employee = `${leave.employee?.name || ""} ${leave.employee?.email || ""}`.toLowerCase();
    const searchableText = `${employee} ${leave.reason || ""} ${leave.leaveType || ""}`.toLowerCase();
    const matchesDate = !leaveFilters.date || (
      toDateKey(leave.startDate) <= leaveFilters.date && toDateKey(leave.endDate) >= leaveFilters.date
    );

    return (
      (!search || searchableText.includes(search)) &&
      (!leaveFilters.status || leave.status === leaveFilters.status) &&
      (!leaveFilters.leaveType || leave.leaveType === leaveFilters.leaveType) &&
      matchesDate
    );
  });

  const exportLeaveRequests = () => {
    const headers = [
      ...(isManager ? ["Employee", "Employee email"] : []),
      "Leave type",
      "Start date",
      "End date",
      "Reason",
      "Status",
      "Manager comment",
    ];
    const rows = filteredLeaves.map((leave) => [
      ...(isManager ? [leave.employee?.name || "Employee", leave.employee?.email || ""] : []),
      leave.leaveType,
      toDateKey(leave.startDate),
      toDateKey(leave.endDate),
      leave.reason,
      leave.status,
      leave.managerComment,
    ]);

    downloadCsv(`leave-requests-${getDateKey(new Date())}.csv`, [headers, ...rows]);
  };

  const exportLeaveBalances = () => {
    const headers = [
      ...(isManager ? ["Employee"] : []),
      "Leave type",
      "Entitlement",
      "Used",
      "Pending reserved",
      "Remaining",
    ];
    const employees = isManager
      ? teamSummary?.employees || []
      : [{ employee: user, summary: leaveSummary }];
    const rows = employees.flatMap(({ employee, summary }) =>
      ["Casual", "Sick", "Earned"].map((leaveType) => [
        ...(isManager ? [employee?.name || employee?.email || "Employee"] : []),
        leaveType,
        summary?.[leaveType]?.entitlement ?? 0,
        summary?.[leaveType]?.used ?? 0,
        summary?.[leaveType]?.pending ?? 0,
        summary?.[leaveType]?.remaining ?? 0,
      ])
    );

    downloadCsv(`leave-balances-${getDateKey(new Date())}.csv`, [headers, ...rows]);
  };

  return (
    <main className={`dashboard-page ${isManager ? "manager-layout" : "employee-layout"}`}>
      {successToast && (
        <div className="success-toast" role="status" aria-live="polite">
          <span className="success-toast-icon" aria-hidden="true">✓</span>
          <span>{successToast}</span>
          <button type="button" aria-label="Dismiss success message" onClick={() => setSuccessToast("")}>×</button>
        </div>
      )}
      <aside className={`manager-sidebar${isManager ? "" : " employee-sidebar"}`}>
        <div className="sidebar-brand">
          <h2>LeaveDesk</h2>
          <p>{isManager ? "Manager workspace" : "Employee workspace"}</p>
        </div>
        <nav className="sidebar-nav" aria-label={`${isManager ? "Manager" : "Employee"} dashboard`}>
          {isManager ? (
            [
              ["overview", "Overview"],
              ["requests", `Review requests${pendingCount > 0 ? ` (${pendingCount})` : ""}`],
              ["calendar", "Leave calendar"],
              ["directory", "Team directory"],
            ].map(([page, label]) => (
              <button
                type="button"
                key={page}
                className={activeDashboardPage === page ? "active" : ""}
                aria-current={activeDashboardPage === page ? "page" : undefined}
                onClick={() => setActiveDashboardPage(page)}
              >
                {label}
              </button>
            ))
          ) : (
            <>
              {[
                ["overview", "Overview"],
                ["apply", "Apply for leave"],
                ["requests", "My requests"],
                ["calendar", "Leave calendar"],
              ].map(([page, label]) => (
                <button
                  type="button"
                  key={page}
                  className={activeDashboardPage === page ? "active" : ""}
                  aria-current={activeDashboardPage === page ? "page" : undefined}
                  onClick={() => setActiveDashboardPage(page)}
                >
                  {label}
                </button>
              ))}
            </>
          )}
        </nav>
      </aside>
      <section className={isManager ? "manager-main" : "employee-main"}>
        <header className="dashboard-header">
          <h2>LeaveDesk</h2>
          <div>
            <span>{user.name} · {isManager ? "Manager" : "Employee"}</span>
            <div className="notification-area">
              <button className="notification-toggle" type="button" onClick={() => setShowNotifications(!showNotifications)}>
                Notifications {unreadCount > 0 && <span className="notification-count">{unreadCount}</span>}
              </button>
              {showNotifications && (
                <div className="notification-panel">
                  <div className="notification-panel-heading">
                    <strong>Notifications</strong>
                    <button type="button" onClick={markNotificationsRead}>Mark all read</button>
                  </div>
                  {notifications.length ? notifications.map((notification) => (
                    <article className={`notification-item${notification.readAt ? "" : " unread"}`} key={notification._id}>
                      <strong>{notification.title}</strong>
                      <p>{notification.message}</p>
                      <time>{formatDate(notification.createdAt)}</time>
                    </article>
                  )) : <p>No notifications.</p>}
                </div>
              )}
            </div>
            <button type="button" onClick={() => setShowProfile((shown) => !shown)}>
              {showProfile ? "Dashboard" : "My profile"}
            </button>
            <button type="button" onClick={onLogout}>Sign out</button>
          </div>
        </header>
        <div className="dashboard-content" id="overview">
          {showProfile ? (
            <section className="dashboard-card profile-card" aria-labelledby="profile-title">
              <div className="profile-heading">
                {profile.profilePhoto ? (
                  <img className="profile-avatar" src={profile.profilePhoto} alt="Your profile" />
                ) : (
                  <div className="profile-avatar" aria-hidden="true">
                    {(profile.name || profile.email || "U").trim().charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <p className="profile-eyebrow">ACCOUNT</p>
                  <h1 id="profile-title">Your profile</h1>
                  <p>Keep your account and contact information up to date.</p>
                </div>
              </div>
              {profileBusy && !profileLoaded ? (
                <p role="status">Loading profile…</p>
              ) : profileLoadFailed ? (
                <div>
                  <p className="error-message" role="status">{profileError}</p>
                  <button type="button" onClick={() => setProfileLoaded(false)}>Retry loading profile</button>
                </div>
              ) : (
                <form className="profile-form" onSubmit={saveProfile}>
                  <div className="profile-photo-controls">
                    <label className="profile-photo-button">
                      Choose photo
                      <input type="file" accept="image/png,image/jpeg,image/webp" onChange={selectProfilePhoto} />
                    </label>
                    {profile.profilePhoto && (
                      <button
                        type="button"
                        className="profile-remove-photo"
                        onClick={() => setProfile((current) => ({ ...current, profilePhoto: "" }))}
                      >
                        Remove photo
                      </button>
                    )}
                    <span>PNG, JPEG or WebP · up to 1 MB</span>
                  </div>
                  <div className="profile-details">
                    <label className="profile-field">
                      <span>Full name</span>
                      <input name="name" value={profile.name || ""} onChange={updateProfileField} maxLength={100} required />
                    </label>
                    <div className="profile-field">
                      <span>Email address</span>
                      <strong>{profile.email || "—"}</strong>
                    </div>
                    <div className="profile-field">
                      <span>Account role</span>
                      <strong className="profile-role">{isManager ? "Manager" : "Employee"}</strong>
                    </div>
                    <label className="profile-field">
                      <span>Phone number</span>
                      <input name="phone" type="tel" value={profile.phone || ""} onChange={updateProfileField} maxLength={30} />
                    </label>
                    <label className="profile-field">
                      <span>Department</span>
                      <input name="department" value={profile.department || ""} onChange={updateProfileField} maxLength={100} />
                    </label>
                    <label className="profile-field">
                      <span>Employee ID</span>
                      <input name="employeeId" value={profile.employeeId || ""} onChange={updateProfileField} maxLength={50} />
                    </label>
                    <label className="profile-field">
                      <span>Joining date</span>
                      <input name="joiningDate" type="date" value={profile.joiningDate || ""} onChange={updateProfileField} />
                    </label>
                    <label className="profile-field profile-address">
                      <span>Address</span>
                      <textarea name="address" value={profile.address || ""} onChange={updateProfileField} maxLength={500} rows={3} />
                    </label>
                  </div>
                  {(profileError || profileMessage) && (
                    <p className={profileError ? "error-message" : "profile-success"} role="status">
                      {profileError || profileMessage}
                    </p>
                  )}
                  <div className="profile-actions">
                    <button type="submit" disabled={profileBusy}>
                      {profileBusy ? "Saving…" : "Save profile"}
                    </button>
                    <button type="button" className="profile-cancel" onClick={() => setShowProfile(false)}>
                      Back to dashboard
                    </button>
                  </div>
                </form>
              )}
            </section>
          ) : (
          <>
          <h1>
            {isManager
              ? activeDashboardPage === "overview"
                ? "Manager dashboard"
                : activeDashboardPage === "requests"
                  ? "Review leave requests"
                  : activeDashboardPage === "calendar"
                    ? "Team leave calendar"
                    : "Team directory"
              : activeDashboardPage === "overview"
                ? `Hello, ${user.name}`
                : activeDashboardPage === "apply"
                  ? "Apply for leave"
                  : activeDashboardPage === "requests"
                    ? "My leave requests"
                    : "Leave calendar"}
          </h1>
          <p>
            {isManager
              ? activeDashboardPage === "overview"
                ? "Your team's leave activity and balances at a glance."
                : activeDashboardPage === "requests"
                  ? "Review, filter, and manage your team's leave requests."
                  : activeDashboardPage === "calendar"
                    ? "See approved leaves across your team."
                    : "View employee and manager contact and work profile information."
              : activeDashboardPage === "overview"
                ? "Your personal leave balance and request status at a glance."
                : activeDashboardPage === "apply"
                  ? "Submit a new leave request for your manager to review."
                  : activeDashboardPage === "requests"
                    ? "View and manage your leave request history."
                    : "See approved leaves on the calendar."}
          </p>
          {(message || error) && <p role="status" className={error ? "error-message" : ""}>{error || message}</p>}
          {activeDashboardPage === "overview" && (
            <>
              <LeaveBalanceSummary
                summary={isManager ? teamSummary?.summary || EMPTY_LEAVE_SUMMARY : leaveSummary}
                totalApprovedDays={totalApprovedDays}
                isManager={isManager}
                teamSummary={teamSummary}
              />
              <Summary leaves={leaves} />
            </>
          )}
          <div id="calendar" hidden={activeDashboardPage !== "calendar"}>
            <LeaveCalendar leaves={leaves} manager={isManager} />
          </div>
          {isManager && activeDashboardPage === "directory" && (
            <TeamDirectory
              members={teamMembers}
              managers={managers}
              loading={directoryLoading}
              error={directoryError}
              actionError={directoryActionError}
              savingId={directorySavingId}
              search={directorySearch}
              onSearchChange={setDirectorySearch}
              onAssign={assignManager}
            />
          )}
          {!isManager && activeDashboardPage === "apply" && (
            <section className="dashboard-card" id="apply">
              <h3>Apply for leave</h3>
              <form onSubmit={submitLeave}>
                <div className="form-group">
                  <label htmlFor="leaveType">Leave type</label>
                  <select id="leaveType" value={form.leaveType} onChange={(event) => setForm({ ...form, leaveType: event.target.value })}>
                    <option>Casual</option><option>Sick</option><option>Earned</option>
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="startDate">Start date</label>
                  <input id="startDate" type="date" required value={form.startDate} onChange={(event) => setForm({ ...form, startDate: event.target.value })} />
                </div>
                <div className="form-group">
                  <label htmlFor="endDate">End date</label>
                  <input id="endDate" type="date" required min={form.startDate || undefined} value={form.endDate} onChange={(event) => setForm({ ...form, endDate: event.target.value })} />
                  <small className="leave-date-help">Weekends and India’s national holidays (Jan 26, Aug 15, Oct 2) are not counted.</small>
                </div>
                {form.startDate && form.endDate && (
                  <div className="leave-balance-check" role="status">
                    {formBalanceLoading || !formLeaveBalanceReady ? (
                      <p>Checking your {form.leaveType.toLowerCase()} leave balance…</p>
                    ) : requestedLeaveDays === 0 ? (
                      <p>The selected dates contain no working days.</p>
                    ) : (
                      <>
                        <p>
                          This request uses {requestedLeaveDays} working day(s).
                          {Object.entries(requestedLeaveDaysByYear).map(([year, days]) => (
                            <span key={year}>
                              {" "}{year}: {days} requested, {formLeaveSummaries[year][form.leaveType].remaining} available.
                            </span>
                          ))}
                        </p>
                        {formLeaveBalanceExceeded && (
                          <p className="error-message">This request is more than your available {form.leaveType.toLowerCase()} leave balance.</p>
                        )}
                      </>
                    )}
                  </div>
                )}
                <div className="form-group">
                  <label htmlFor="reason">Reason</label>
                  <textarea id="reason" required maxLength={1000} value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} />
                </div>
                <button
                  type="submit"
                  disabled={
                    busy ||
                    (Boolean(form.startDate && form.endDate) &&
                      (formBalanceLoading || !formLeaveBalanceReady || requestedLeaveDays === 0 || formLeaveBalanceExceeded))
                  }
                >
                  {busy ? "Submitting…" : "Submit request"}
                </button>
              </form>
            </section>
          )}
          {activeDashboardPage === "requests" && (
          <section className="dashboard-card" id="requests">
            <div className="leaves-heading">
              <h3>{isManager ? "All leave requests" : "My leave requests"}</h3>
              <div className="leave-report-actions">
                <button className="export-button" type="button" onClick={exportLeaveRequests}>Export requests CSV</button>
                <button className="export-button" type="button" onClick={exportLeaveBalances}>Export balances CSV</button>
                <button className="refresh-button" type="button" onClick={refresh}>Refresh</button>
              </div>
            </div>
            <div className="leave-filters" aria-label="Filter leave requests">
              <div className="form-group">
                <label htmlFor="leaveSearch">{isManager ? "Search requests or employees" : "Search requests"}</label>
                <input
                  id="leaveSearch"
                  type="search"
                  placeholder={isManager ? "Name, email, reason, or type" : "Reason or leave type"}
                  value={leaveFilters.search}
                  onChange={(event) => setLeaveFilters({ ...leaveFilters, search: event.target.value })}
                />
              </div>
              <div className="form-group">
                <label htmlFor="leaveStatusFilter">Status</label>
                <select
                  id="leaveStatusFilter"
                  value={leaveFilters.status}
                  onChange={(event) => setLeaveFilters({ ...leaveFilters, status: event.target.value })}
                >
                  <option value="">All statuses</option>
                  <option value="Pending">Pending</option>
                  <option value="Approved">Approved</option>
                  <option value="Rejected">Rejected</option>
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="leaveTypeFilter">Leave type</label>
                <select
                  id="leaveTypeFilter"
                  value={leaveFilters.leaveType}
                  onChange={(event) => setLeaveFilters({ ...leaveFilters, leaveType: event.target.value })}
                >
                  <option value="">All types</option>
                  <option value="Casual">Casual</option>
                  <option value="Sick">Sick</option>
                  <option value="Earned">Earned</option>
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="leaveDateFilter">Includes date</label>
                <input
                  id="leaveDateFilter"
                  type="date"
                  value={leaveFilters.date}
                  onChange={(event) => setLeaveFilters({ ...leaveFilters, date: event.target.value })}
                />
              </div>
              <button
                type="button"
                className="clear-filters-button"
                onClick={() => setLeaveFilters({ search: "", status: "", leaveType: "", date: "" })}
                disabled={!Object.values(leaveFilters).some(Boolean)}
              >
                Clear filters
              </button>
            </div>
            <p className="filter-result-count" aria-live="polite">
              Showing {filteredLeaves.length} of {leaves.length} requests
            </p>
            <LeaveTable
              leaves={filteredLeaves}
              manager={isManager}
              onCancel={cancelLeave}
              onUpdate={updateLeave}
              busyId={busyId}
              managerComments={managerComments}
              onCommentChange={(leaveId, comment) =>
                setManagerComments((comments) => ({ ...comments, [leaveId]: comment }))
              }
              emptyMessage={leaves.length ? "No leave requests match these filters." : "No leave requests to show yet."}
            />
          </section>
          )}
          </>
          )}
        </div>
      </section>
    </main>
  );
}

export default function App() {
  const [session, setSession] = useState(getStoredSession);

  const updateSessionUser = (updatedUser) => {
    setSession((current) => {
      if (!current) return current;
      const nextSession = { ...current, user: { ...current.user, ...updatedUser } };
      const storedUser = { ...nextSession.user };
      delete storedUser.profilePhoto;
      localStorage.setItem("leaveDeskUser", JSON.stringify(storedUser));
      return nextSession;
    });
  };

  const login = (data) => {
    const nextSession = { token: data.token, user: data.user };
    localStorage.setItem("leaveDeskToken", nextSession.token);
    localStorage.setItem("leaveDeskUser", JSON.stringify(nextSession.user));
    setSession(nextSession);
  };

  const logout = () => {
    localStorage.removeItem("leaveDeskToken");
    localStorage.removeItem("leaveDeskUser");
    setSession(null);
  };

  return session ? (
    <Dashboard session={session} onLogout={logout} onProfileSaved={updateSessionUser} />
  ) : <Login onLogin={login} />;
}

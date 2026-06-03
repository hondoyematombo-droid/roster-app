import { useState, useEffect } from 'react';
import type { Employee } from '../types';
import { getShiftForDate } from '../utils/rotationEngine';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, LogOut, Cpu, ShieldAlert, Check, Ban, UserMinus, UserPlus, Edit2, Save, X, MessageSquare, AlignLeft, Wifi, WifiOff, RefreshCw, Bell, Plus, Trash2, Lock, Unlock, Key, ShieldCheck, AlertTriangle } from 'lucide-react';

interface LeaveRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  dateString: string;
  status: 'PENDING' | 'APPROVED' | 'DENIED';
}

interface AdminNote {
  id: string;
  employeeId: string;
  dateString: string;
  text: string;
}

interface OvertimeClaim {
  id: string;
  leaveRequestId: string | null; 
  dateString: string;
  shiftCode: string;
  shiftLabel: string;
  shiftTime: string;
  claimedBy: string; 
  claimedByName: string;
  assignedByAdmin?: boolean;
}

interface ManagerNotification {
  id: string;
  text: string;
  dateString: string;
  timestamp: number;
}

interface SyncAction {
  type: 'LEAVE_REQUEST' | 'LEAVE_STATUS' | 'LEAVE_CANCEL' | 'ADD_NOTE' | 'CLAIM_OVERTIME' | 'ADMIN_OVERTIME' | 'SECURITY_UPDATE';
  payload: any;
  timestamp: number;
}

interface EmployeePortalProps {
  user: Employee;
  allEmployees: Employee[];
  onLogout: () => void;
  onUpdateEmployees?: (updatedList: Employee[]) => void;
}

const OVERTIME_TEMPLATES = [
  { code: 'DS', label: 'Day Shift', time: '07:00 - 19:00' },
  { code: 'NS', label: 'Night Shift', time: '19:00 - 07:00' },
  { code: 'M1', label: 'Morning Overtime', time: '06:00 - 14:00' },
  { code: 'E1', label: 'Evening Overtime', time: '14:00 - 22:00' }
];

export default function EmployeePortal({ user, allEmployees, onLogout, onUpdateEmployees }: EmployeePortalProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);

  // --- SECURITY & AUTHENTICATION STATES ---
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [confirmPasswordInput, setConfirmPasswordInput] = useState('');
  const [securityMessage, setSecurityMessage] = useState({ text: '', type: 'info' });
  const [showSecuritySettings, setShowSecuritySettings] = useState(false);
  
  // Internal password vaults managed via securely isolated localStorage keys
  const [credentialVault, setCredentialVault] = useState<Record<string, string>>(() => {
    const saved = localStorage.getItem('roster_secure_vault');
    return saved ? JSON.parse(saved) : { 'emp-01': 'password123' }; // Default mock password for Alice
  });

  const [recoveryQueue, setRecoveryQueue] = useState<Record<string, boolean>>(() => {
    const saved = localStorage.getItem('roster_recovery_queue');
    return saved ? JSON.parse(saved) : {};
  });

  // --- CORE ROSTER ENGINE STATES ---
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>(() => {
    const saved = localStorage.getItem('roster_leave_requests');
    return saved ? JSON.parse(saved) : [
      { id: 'req-1', employeeId: 'emp-01', employeeName: 'Alice Smith', dateString: '2026-06-15', status: 'PENDING' }
    ];
  });

  const [adminNotes, setAdminNotes] = useState<AdminNote[]>(() => {
    const saved = localStorage.getItem('roster_admin_notes');
    return saved ? JSON.parse(saved) : [
      { id: 'note-1', employeeId: 'emp-01', dateString: '2026-06-10', text: 'Mandatory Delta Wing safety briefing at 0800 hours.' }
    ];
  });

  const [overtimeClaims, setOvertimeClaims] = useState<OvertimeClaim[]>(() => {
    const saved = localStorage.getItem('roster_overtime_claims');
    return saved ? JSON.parse(saved) : [];
  });

  const [removedOvertimeIds, setRemovedOvertimeIds] = useState<string[]>(() => {
    const saved = localStorage.getItem('roster_removed_ot_ids');
    return saved ? JSON.parse(saved) : [];
  });

  const [managerNotifications, setManagerNotifications] = useState<ManagerNotification[]>(() => {
    const saved = localStorage.getItem('roster_manager_notifications');
    return saved ? JSON.parse(saved) : [];
  });

  const [syncQueue, setSyncQueue] = useState<SyncAction[]>(() => {
    const saved = localStorage.getItem('roster_sync_queue');
    return saved ? JSON.parse(saved) : [];
  });

  // Modals & Dashboard Controls
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [noteInput, setNoteInput] = useState('');
  const [editingSlotId, setEditingSlotId] = useState<string | null>(null);
  const [editNameInput, setEditNameInput] = useState('');
  const [activeViewedEmployee, setActiveViewedEmployee] = useState<Employee>(
    user.role === 'MANAGER' ? allEmployees.find(e => e.role !== 'MANAGER') || user : user
  );

  // --- PERSISTENCE SYNCHRONIZERS ---
  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  useEffect(() => { localStorage.setItem('roster_secure_vault', JSON.stringify(credentialVault)); }, [credentialVault]);
  useEffect(() => { localStorage.setItem('roster_recovery_queue', JSON.stringify(recoveryQueue)); }, [recoveryQueue]);
  useEffect(() => { localStorage.setItem('roster_leave_requests', JSON.stringify(leaveRequests)); }, [leaveRequests]);
  useEffect(() => { localStorage.setItem('roster_admin_notes', JSON.stringify(adminNotes)); }, [adminNotes]);
  useEffect(() => { localStorage.setItem('roster_overtime_claims', JSON.stringify(overtimeClaims)); }, [overtimeClaims]);
  useEffect(() => { localStorage.setItem('roster_removed_ot_ids', JSON.stringify(removedOvertimeIds)); }, [removedOvertimeIds]);
  useEffect(() => { localStorage.setItem('roster_manager_notifications', JSON.stringify(managerNotifications)); }, [managerNotifications]);
  useEffect(() => { localStorage.setItem('roster_sync_queue', JSON.stringify(syncQueue)); }, [syncQueue]);

  useEffect(() => {
    if (isOnline && syncQueue.length > 0) processSyncQueue();
  }, [isOnline, syncQueue]);

  const processSyncQueue = async () => {
    setIsSyncing(true);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    setSyncQueue([]);
    setIsSyncing(false);
  };

  const queueAction = (type: SyncAction['type'], payload: any) => {
    if (!isOnline) setSyncQueue(prev => [...prev, { type, payload, timestamp: Date.now() }]);
  };

  // --- AUTHENTICATION ENGINE LOGIC ---
  const userHasPassword = !!credentialVault[user.id];
  const isUserInRecovery = !!recoveryQueue[user.id];

  const handleTerminalAuth = (e: React.FormEvent) => {
    e.preventDefault();
    setSecurityMessage({ text: '', type: 'info' });

    if (!userHasPassword) {
      // Configuration loop for completely new keys
      if (passwordInput.length < 4) {
        setSecurityMessage({ text: 'Security Key must contain at least 4 alphanumeric entities.', type: 'error' });
        return;
      }
      if (passwordInput !== confirmPasswordInput) {
        setSecurityMessage({ text: 'Credential check match failure.', type: 'error' });
        return;
      }
      setCredentialVault(prev => ({ ...prev, [user.id]: passwordInput }));
      setIsAuthenticated(true);
      setPasswordInput('');
      setConfirmPasswordInput('');
    } else {
      // Standard authentication parsing
      if (credentialVault[user.id] === passwordInput) {
        setIsAuthenticated(true);
        setSecurityMessage({ text: '', type: 'info' });
        setPasswordInput('');
      } else {
        setSecurityMessage({ text: 'Access Denied. Terminal passkey mismatch.', type: 'error' });
      }
    }
  };

  const handleTriggerRecovery = () => {
    setRecoveryQueue(prev => ({ ...prev, [user.id]: true }));
    const log: ManagerNotification = {
      id: `notif-${Date.now()}`,
      text: `CRITICAL SEC: Operative ${user.name} issued a terminal password recovery request.`,
      dateString: formatDateString(new Date()),
      timestamp: Date.now()
    };
    setManagerNotifications(prev => [log, ...prev]);
    setSecurityMessage({ text: 'Recovery request pushed to network logs. Contact management to authorize clear.', type: 'info' });
  };

  const handleChangePasswordInternal = (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordInput !== confirmPasswordInput) {
      alert("Error: New password parameters do not match.");
      return;
    }
    if (passwordInput.length < 4) {
      alert("Security Protocol: Passwords must be at least 4 characters long.");
      return;
    }
    setCredentialVault(prev => ({ ...prev, [user.id]: passwordInput }));
    setPasswordInput('');
    setConfirmPasswordInput('');
    setShowSecuritySettings(false);
    alert("System confirmation: Security clearance passkey altered successfully.");
    queueAction('SECURITY_UPDATE', { employeeId: user.id });
  };

  const handleAdminResetPassword = (targetEmpId: string) => {
    const updatedVault = { ...credentialVault };
    delete updatedVault[targetEmpId]; // Removing key forces a fresh setup prompt on their next login
    setCredentialVault(updatedVault);

    setRecoveryQueue(prev => {
      const copy = { ...prev };
      delete copy[targetEmpId];
      return copy;
    });

    const target = allEmployees.find(e => e.id === targetEmpId);
    const log: ManagerNotification = {
      id: `notif-${Date.now()}`,
      text: `Management cleared credentials and purged access tokens for ${target?.name || 'Unknown Operator'}.`,
      dateString: formatDateString(new Date()),
      timestamp: Date.now()
    };
    setManagerNotifications(prev => [log, ...prev]);
  };

  // --- TIME CALCULATIONS ---
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const totalDaysInMonth = new Date(year, month + 1, 0).getDate();
  const startDayOfWeek = new Date(year, month, 1).getDay(); 

  const blanks = Array(startDayOfWeek === 0 ? 6 : startDayOfWeek - 1).fill(null);
  const days = Array.from({ length: totalDaysInMonth }, (_, i) => new Date(year, month, i + 1));
  const calendarGrid = [...blanks, ...days];

  const handleMonthChange = (direction: 'next' | 'prev') => {
    setCurrentDate(new Date(year, month + (direction === 'next' ? 1 : -1), 1));
  };

  const formatDateString = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  // --- CORE ROSTER ACTION INTERFACES ---
  const handleApproveLeave = (reqId: string) => {
    setLeaveRequests(prev => prev.map(r => r.id === reqId ? { ...r, status: 'APPROVED' } : r));
    queueAction('LEAVE_STATUS', { id: reqId, status: 'APPROVED' });
  };

  const handleDenyLeave = (reqId: string) => {
    setLeaveRequests(prev => prev.map(r => r.id === reqId ? { ...r, status: 'DENIED' } : r));
    queueAction('LEAVE_STATUS', { id: reqId, status: 'DENIED' });
  };

  const handleToggleVacancy = (empId: string) => {
    const updated = allEmployees.map(emp => {
      if (emp.id === empId) {
        return { ...emp, isVacant: !emp.isVacant, name: !emp.isVacant ? `Vacant Slot ${emp.baseWeek}` : `Assigned Operator ${emp.baseWeek}` };
      }
      return emp;
    });
    if (onUpdateEmployees) onUpdateEmployees(updated);
  };

  const saveEditedName = (empId: string) => {
    const updated = allEmployees.map(emp => emp.id === empId ? { ...emp, name: editNameInput, isVacant: false } : emp);
    if (onUpdateEmployees) onUpdateEmployees(updated);
    setEditingSlotId(null);
  };

  const handleSaveNote = () => {
    if (!selectedDate) return;
    const dateStr = formatDateString(selectedDate);
    const filteredNotes = adminNotes.filter(n => !(n.dateString === dateStr && n.employeeId === activeViewedEmployee.id));
    
    if (noteInput.trim()) {
      const newNote = { id: `note-${Date.now()}`, employeeId: activeViewedEmployee.id, dateString: dateStr, text: noteInput.trim() };
      filteredNotes.push(newNote);
      queueAction('ADD_NOTE', newNote);
    }
    setAdminNotes(filteredNotes);
    setSelectedDate(null);
  };

  const handleRequestLeave = (dateStr: string) => {
    if (leaveRequests.some(r => r.dateString === dateStr && r.employeeId === user.id)) return;
    const baseShift = getShiftForDate(user.baseWeek, new Date(dateStr));
    if (baseShift.code === 'OFF') {
      alert("Operational Guard: Leave requests cannot be configured on rest days.");
      return;
    }
    const newRequest: LeaveRequest = { id: `req-${Date.now()}`, employeeId: user.id, employeeName: user.name, dateString: dateStr, status: 'PENDING' };
    setLeaveRequests([...leaveRequests, newRequest]);
    queueAction('LEAVE_REQUEST', newRequest);
  };

  const handleCancelLeave = (reqId: string) => {
    setLeaveRequests(prev => prev.filter(r => r.id !== reqId));
    setOvertimeClaims(prev => prev.filter(c => c.leaveRequestId !== reqId)); 
    queueAction('LEAVE_CANCEL', { id: reqId });
  };

  const handleClaimOvertime = (leaveReq: LeaveRequest, shift: any) => {
    const newClaim: OvertimeClaim = {
      id: `ot-${Date.now()}`,
      leaveRequestId: leaveReq.id,
      dateString: leaveReq.dateString,
      shiftCode: shift.code,
      shiftLabel: shift.label,
      shiftTime: shift.time,
      claimedBy: user.id,
      claimedByName: user.name
    };
    setOvertimeClaims(prev => [...prev, newClaim]);

    const newNotification: ManagerNotification = {
      id: `notif-${Date.now()}`,
      text: `${user.name} claimed open Marketplace Overtime for ${leaveReq.dateString} (${shift.code}).`,
      dateString: leaveReq.dateString,
      timestamp: Date.now()
    };
    setManagerNotifications(prev => [newNotification, ...prev]);
    queueAction('CLAIM_OVERTIME', newClaim);
  };

  const handleAdminInjectOvertime = (dateStr: string, template: typeof OVERTIME_TEMPLATES[0]) => {
    const clearedClaims = overtimeClaims.filter(c => !(c.dateString === dateStr && c.claimedBy === activeViewedEmployee.id));
    const adminAssignment: OvertimeClaim = {
      id: `ot-adm-${Date.now()}`,
      leaveRequestId: null, 
      dateString: dateStr,
      shiftCode: template.code,
      shiftLabel: template.label,
      shiftTime: template.time,
      claimedBy: activeViewedEmployee.id,
      claimedByName: activeViewedEmployee.name,
      assignedByAdmin: true
    };
    setOvertimeClaims([...clearedClaims, adminAssignment]);
    
    const log: ManagerNotification = {
      id: `notif-${Date.now()}`,
      text: `Management manually assigned Overtime (${template.code}) to ${activeViewedEmployee.name} on ${dateStr}.`,
      dateString: dateStr,
      timestamp: Date.now()
    };
    setManagerNotifications(prev => [log, ...prev]);
    queueAction('ADMIN_OVERTIME', adminAssignment);
    setSelectedDate(null);
  };

  const handleAdminRemoveOvertime = (claimId: string) => {
    const claim = overtimeClaims.find(c => c.id === claimId);
    setOvertimeClaims(prev => prev.filter(c => c.id !== claimId));
    if (claim) {
      const log: ManagerNotification = {
        id: `notif-${Date.now()}`,
        text: `Management revoked Overtime allocation for ${claim.claimedByName} on ${claim.dateString}.`,
        dateString: claim.dateString,
        timestamp: Date.now()
      };
      setManagerNotifications(prev => [log, ...prev]);
    }
    setSelectedDate(null);
  };

  const handleDismissUnstaffedShift = (reqId: string) => {
    // Adds the shift ID to the array that filters them out of the marketplace view
    setRemovedOvertimeIds(prev => [...prev, reqId]);
    
    // Log the action to the manager activity feed
    const log: ManagerNotification = {
      id: `notif-${Date.now()}`,
      text: `Management dismissed an unstaffed shift vacancy from the marketplace pool.`,
      dateString: formatDateString(new Date()),
      timestamp: Date.now()
    };
    setManagerNotifications(prev => [log, ...prev]);
  };

  const openDayModal = (date: Date) => {
    const dateStr = formatDateString(date);
    const existingNote = adminNotes.find(n => n.dateString === dateStr && n.employeeId === activeViewedEmployee.id);
    setNoteInput(existingNote ? existingNote.text : '');
    setSelectedDate(date);
  };

  // --- RENDER SECURITY ACCREDITATION GUARD WRAPPER ---
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#040610] text-slate-100 flex items-center justify-center p-4 relative antialiased">
        <div className="absolute top-1/4 left-1/3 w-[350px] h-[350px] bg-indigo-600/10 rounded-full blur-[100px] pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/3 w-[350px] h-[350px] bg-cyan-600/5 rounded-full blur-[120px] pointer-events-none" />
        
        <div className="w-full max-w-md bg-[#0b0e1a] border border-slate-800/80 rounded-2xl shadow-2xl p-6 relative z-10 backdrop-blur-xl">
          <div className="text-center mb-6">
            <div className="inline-flex bg-gradient-to-tr from-indigo-600 to-cyan-500 p-3 rounded-2xl text-white mb-3 shadow-[0_0_20px_rgba(79,70,229,0.2)]">
              <Lock size={24} />
            </div>
            <h2 className="text-xl font-black tracking-wider uppercase">Terminal Lock</h2>
            <p className="text-xs text-slate-500 font-mono mt-1">Identity Node: <span className="text-cyan-400 font-bold">{user.name}</span></p>
          </div>

          <form onSubmit={handleTerminalAuth} className="space-y-4">
            {!userHasPassword ? (
              <>
                <div className="bg-cyan-950/20 border border-cyan-800/40 p-3 rounded-xl text-xs text-cyan-300 font-mono mb-2 leading-relaxed flex items-start space-x-2">
                  <ShieldCheck size={16} className="mt-0.5 flex-shrink-0" />
                  <span><strong>Initial Security Handshake Required:</strong> No passkey detected for this operative. Construct your terminal access token below.</span>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-slate-400 uppercase tracking-widest block">Create Access Key</label>
                  <input type="password" value={passwordInput} onChange={(e) => setPasswordInput(e.target.value)} placeholder="••••••••" className="w-full bg-black/50 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500 transition-colors" required />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-slate-400 uppercase tracking-widest block">Confirm Access Key</label>
                  <input type="password" value={confirmPasswordInput} onChange={(e) => setConfirmPasswordInput(e.target.value)} placeholder="••••••••" className="w-full bg-black/50 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500 transition-colors" required />
                </div>
              </>
            ) : (
              <div className="space-y-1">
                <div className="flex justify-between items-center mb-1">
                  <label className="text-[10px] font-mono text-slate-400 uppercase tracking-widest block">Input Passkey</label>
                  {isUserInRecovery && <span className="text-[8px] font-mono bg-amber-950 text-amber-400 border border-amber-800 px-1.5 py-0.2 rounded animate-pulse">RECOVERY FLAG ACTIVE</span>}
                </div>
                <input type="password" value={passwordInput} onChange={(e) => setPasswordInput(e.target.value)} placeholder="••••••••" className="w-full bg-black/50 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500 transition-colors font-mono tracking-widest" required autoFocus />
              </div>
            )}

            {securityMessage.text && (
              <div className={`p-2.5 rounded-lg text-xs font-mono border ${securityMessage.type === 'error' ? 'bg-red-950/20 text-red-400 border-red-900/50' : 'bg-indigo-950/30 text-indigo-300 border-indigo-900/40'}`}>
                {securityMessage.text}
              </div>
            )}

            <button type="submit" className="w-full bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 text-white font-mono text-xs font-bold uppercase tracking-widest py-3 rounded-xl transition-all shadow-lg flex items-center justify-center space-x-2">
              <Unlock size={14} /> <span>{userHasPassword ? 'Unshackle Terminal' : 'Register & Initialize'}</span>
            </button>
          </form>

          {userHasPassword && !isUserInRecovery && (
            <div className="mt-4 pt-4 border-t border-slate-900 text-center">
              <button type="button" onClick={handleTriggerRecovery} className="text-[10px] font-mono text-slate-500 hover:text-amber-400 uppercase tracking-wider transition-colors">
                Bypass Lost? Signal Recover Protocol
              </button>
            </div>
          )}
          
          <div className="mt-2 text-center">
            <button onClick={onLogout} className="text-[10px] font-mono text-slate-600 hover:text-red-400 uppercase transition-colors">
              Return to Core Link Selection
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#060814] text-slate-100 p-4 sm:p-6 font-sans antialiased relative">
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-indigo-600/5 rounded-full blur-[140px] pointer-events-none" />
      
      {/* GLOBAL TELEMETRY HEADER */}
      <header className="max-w-7xl mx-auto mb-6 border border-slate-800/60 bg-[#0c1122]/90 backdrop-blur-xl p-4 rounded-xl flex items-center justify-between shadow-2xl relative z-20">
        <div className="flex items-center space-x-3">
          <div className="bg-gradient-to-tr from-indigo-600 to-cyan-500 p-2.5 rounded-xl text-white">
            <CalendarIcon size={20} />
          </div>
          <div>
            <h1 className="font-black text-xl tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-400 uppercase">
              ROSTER<span className="text-cyan-400 font-medium">.OS</span>
            </h1>
            <div className="flex items-center space-x-2 mt-0.5">
              <span className="text-[10px] text-slate-500 font-mono tracking-widest uppercase">Lvl: {user.role}</span>
              <span className="text-slate-700 font-mono text-[9px]">•</span>
              {isSyncing ? (
                <span className="flex items-center space-x-1 text-[9px] font-mono text-cyan-400 uppercase tracking-wider bg-cyan-950/30 border border-cyan-800 px-1.5 py-0.5 rounded animate-pulse">
                  <RefreshCw size={10} className="animate-spin" /> <span>Syncing telemetry...</span>
                </span>
              ) : isOnline ? (
                <span className="flex items-center space-x-1 text-[9px] font-mono text-emerald-400 uppercase tracking-wider bg-emerald-950/30 border border-emerald-900/50 px-1.5 py-0.5 rounded">
                  <Wifi size={10} /> <span>Link Online</span>
                </span>
              ) : (
                <span className="flex items-center space-x-1 text-[9px] font-mono text-red-400 uppercase tracking-wider bg-red-950/30 border border-red-900/50 px-1.5 py-0.5 rounded">
                  <WifiOff size={10} /> <span>Link Offline ({syncQueue.length} Queued)</span>
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <button onClick={() => { setShowSecuritySettings(!showSecuritySettings); setPasswordInput(''); setConfirmPasswordInput(''); }} className="p-2 bg-slate-900 text-slate-400 hover:text-cyan-400 rounded-xl border border-slate-800 transition-colors" title="Security Settings">
            <Key size={14} />
          </button>
          <button onClick={onLogout} className="flex items-center space-x-2 text-xs font-mono uppercase bg-slate-900 text-slate-400 hover:text-red-400 px-4 py-2 rounded-xl border border-slate-800 hover:border-red-500/40 transition-all">
            <LogOut size={14} /> <span>Terminate</span>
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto relative z-10 space-y-6">
        
        {/* PERSONAL SECURITY CONFIGURATION MODAL */}
        {showSecuritySettings && (
          <div className="bg-[#0b1021] border border-cyan-500/20 p-5 rounded-xl max-w-md mx-auto mb-6 shadow-2xl">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-xs font-mono font-bold text-cyan-400 uppercase tracking-widest flex items-center space-x-1">
                <Key size={14} /> <span>Modify Security Credentials</span>
              </h3>
              <button onClick={() => setShowSecuritySettings(false)} className="text-slate-500 hover:text-white"><X size={14} /></button>
            </div>
            <form onSubmit={handleChangePasswordInternal} className="space-y-3">
              <div>
                <label className="text-[9px] font-mono text-slate-400 uppercase block mb-1">New Terminal Password</label>
                <input type="password" value={passwordInput} onChange={(e) => setPasswordInput(e.target.value)} className="w-full bg-black p-2 rounded text-xs border border-slate-800 focus:border-cyan-500 text-white" placeholder="••••" required />
              </div>
              <div>
                <label className="text-[9px] font-mono text-slate-400 uppercase block mb-1">Confirm New Password</label>
                <input type="password" value={confirmPasswordInput} onChange={(e) => setConfirmPasswordInput(e.target.value)} className="w-full bg-black p-2 rounded text-xs border border-slate-800 focus:border-cyan-500 text-white" placeholder="••••" required />
              </div>
              <button type="submit" className="w-full bg-cyan-950/60 border border-cyan-500/40 hover:bg-cyan-900/40 text-cyan-400 text-xs font-mono font-bold py-1.5 rounded uppercase tracking-wider transition-colors">
                Apply Passkey Re-Configuration
              </button>
            </form>
          </div>
        )}

        {/* MANAGER ADMINISTRATIVE OPERATIONS CONSOLE */}
        {user.role === 'MANAGER' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="space-y-6">
              
              {/* SECURITY EXPLOIT & RECOVERY ACTION QUEUE */}
              <div className="bg-slate-950/80 border border-red-500/20 rounded-xl p-5 shadow-2xl">
                <h3 className="text-sm font-mono font-bold text-red-400 flex items-center space-x-2 mb-4 uppercase tracking-widest">
                  <ShieldAlert size={16} /> <span>Security Override Pipeline</span>
                </h3>
                <div className="space-y-3 max-h-[140px] overflow-y-auto pr-2 custom-scrollbar">
                  {Object.keys(recoveryQueue).length === 0 ? (
                    <p className="text-xs text-slate-500 font-mono italic">No pending identity recovery flags across nodes.</p>
                  ) : (
                    Object.keys(recoveryQueue).map(empId => {
                      const targetEmp = allEmployees.find(e => e.id === empId);
                      return (
                        <div key={empId} className="bg-red-950/10 border border-red-900/30 rounded-lg p-3 flex justify-between items-center">
                          <div>
                            <p className="text-xs font-bold text-white">{targetEmp?.name || 'Unknown Node'}</p>
                            <p className="text-[9px] font-mono text-red-400">STATUS: TERMINAL LOCKOUT</p>
                          </div>
                          <button onClick={() => handleAdminResetPassword(empId)} className="bg-red-950/60 hover:bg-red-900 text-red-400 border border-red-500/40 px-2.5 py-1.5 rounded font-mono text-[10px] font-bold uppercase transition-all">
                            Purge & Clear
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* LEAVE MANAGEMENT INFRASTRUCTURE */}
              <div className="bg-indigo-950/20 border border-indigo-500/30 rounded-xl p-5 shadow-2xl">
                <h3 className="text-sm font-mono font-bold text-indigo-400 flex items-center space-x-2 mb-4 uppercase tracking-widest">
                  <AlertTriangle size={16} /> <span>Pending Leave Queue</span>
                </h3>
                <div className="space-y-3 max-h-[150px] overflow-y-auto pr-2 custom-scrollbar">
                  {leaveRequests.filter(req => req.status === 'PENDING').length === 0 ? (
                    <p className="text-xs text-slate-500 font-mono italic">No pending leave requests.</p>
                  ) : (
                    leaveRequests.filter(req => req.status === 'PENDING').map(req => (
                      <div key={req.id} className="bg-black/40 border border-slate-800 rounded-lg p-3">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <p className="text-xs font-bold text-white">{req.employeeName}</p>
                            <p className="text-[10px] font-mono text-cyan-400">{req.dateString}</p>
                          </div>
                          <span className="text-[8px] font-mono bg-amber-950/50 text-amber-400 border border-amber-500/30 px-1.5 py-0.5 rounded">AL REQ</span>
                        </div>
                        <div className="flex space-x-2 mt-3">
                          <button onClick={() => handleApproveLeave(req.id)} className="flex-1 bg-emerald-950/50 hover:bg-emerald-900/60 text-emerald-400 border border-emerald-500/40 py-1.5 rounded text-[10px] font-mono font-bold flex items-center justify-center space-x-1">
                            <Check size={12} /> <span>Approve</span>
                          </button>
                          <button onClick={() => handleDenyLeave(req.id)} className="flex-1 bg-red-950/50 hover:bg-red-900/60 text-red-400 border border-red-500/40 py-1.5 rounded text-[10px] font-mono font-bold flex items-center justify-center space-x-1">
                            <Ban size={12} /> <span>Deny</span>
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* MARKETPLACE DESK */}
              <div className="bg-[#0b1021]/80 border border-purple-500/20 rounded-xl p-5 shadow-2xl space-y-4">
                <h3 className="text-sm font-mono font-bold text-purple-400 flex items-center space-x-2 mb-2 uppercase tracking-widest">
                  <Bell size={16} /> <span>Marketplace Desk</span>
                </h3>
                
                <div>
                  <span className="text-[10px] font-mono uppercase text-slate-400 tracking-wider block mb-2 font-bold">Unclaimed Shifts Pool</span>
                  <div className="space-y-1.5 max-h-[110px] overflow-y-auto pr-2 custom-scrollbar">
                    {leaveRequests.filter(r => r.status === 'APPROVED' && !overtimeClaims.some(c => c.leaveRequestId === r.id) && !removedOvertimeIds.includes(r.id)).length === 0 ? (
                      <p className="text-[11px] text-slate-500 font-mono italic">No shifts currently awaiting coverage.</p>
                    ) : (
                      leaveRequests.filter(r => r.status === 'APPROVED' && !overtimeClaims.some(c => c.leaveRequestId === r.id) && !removedOvertimeIds.includes(r.id)).map(req => {
                        const targetEmp = allEmployees.find(e => e.id === req.employeeId);
                        const targetShift = targetEmp ? getShiftForDate(targetEmp.baseWeek, new Date(req.dateString)) : null;
                        return (
                          <div key={req.id} className="bg-purple-950/10 border border-purple-900/30 rounded-lg p-2 flex justify-between items-center text-[11px] font-mono">
                            <div>
                              <span className="text-purple-300 font-bold">{req.dateString}</span>
                              <span className="text-slate-600 mx-1.5">|</span>
                              <span className="text-slate-300">{targetShift?.code || 'SHIFT'}</span>
                            </div>
                            <div className="flex items-center space-x-2">
                              <span className="text-[8px] bg-purple-900/40 text-purple-400 border border-purple-500/30 px-1.5 py-0.5 rounded font-bold tracking-wider uppercase">
                                UNSTAFFED
                              </span>
                              <button 
                                onClick={() => handleDismissUnstaffedShift(req.id)} 
                                className="p-1 bg-slate-900 hover:bg-red-950 text-slate-500 hover:text-red-400 rounded border border-slate-800 hover:border-red-900/50 transition-all"
                                title="Dismiss Shift Vacancy"
                              >
                                <X size={12} />
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                <hr className="border-slate-800/40" />

                <div>
                  <span className="text-[10px] font-mono uppercase text-slate-400 tracking-wider block mb-2 font-bold">Activity Log</span>
                  <div className="space-y-2 max-h-[110px] overflow-y-auto pr-2 custom-scrollbar">
                    {managerNotifications.length === 0 ? (
                      <p className="text-xs text-slate-500 font-mono italic">No operational modifications logged.</p>
                    ) : (
                      managerNotifications.map(notif => (
                        <div key={notif.id} className="bg-black/30 border border-slate-900 rounded-lg p-2.5 text-[11px] font-mono text-slate-300 flex items-start space-x-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-purple-400 mt-1.5 flex-shrink-0" />
                          <div className="flex-1">
                            <p className="leading-relaxed text-slate-400">{notif.text}</p>
                            <span className="text-[9px] text-slate-600 block mt-0.5">{new Date(notif.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* MATRIX GRID ALLOCATION PANEL */}
            <div className="bg-[#0b0f1d]/80 border border-slate-800 rounded-xl p-5 shadow-2xl col-span-1 lg:col-span-2">
              <h3 className="text-sm font-mono font-bold text-cyan-400 flex items-center space-x-2 mb-4 uppercase tracking-widest">
                <Cpu size={16} /> <span>Matrix Allocation Board</span>
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[580px] overflow-y-auto pr-2 custom-scrollbar">
                {allEmployees.filter(e => e.role !== 'MANAGER').map(emp => {
                  const nodeHasCreds = !!credentialVault[emp.id];
                  return (
                    <div key={emp.id} className={`flex items-center justify-between p-3 rounded-lg border transition-all ${emp.isVacant ? 'bg-red-950/10 border-red-900/30' : 'bg-slate-900/40 border-slate-800'}`}>
                      <div className="flex-1 mr-3">
                        <div className="flex items-center space-x-2">
                          <span className="text-[9px] font-mono text-slate-500 uppercase tracking-wider">Slot Base {emp.baseWeek}</span>
                          <span className={`text-[8px] font-mono px-1 rounded ${nodeHasCreds ? 'text-emerald-400/70 bg-emerald-950/20' : 'text-amber-400/70 bg-amber-950/20'}`}>
                            {nodeHasCreds ? 'Secured' : 'No Passkey'}
                          </span>
                        </div>
                        {editingSlotId === emp.id ? (
                          <div className="flex items-center space-x-2 mt-1">
                            <input type="text" value={editNameInput} onChange={(e) => setEditNameInput(e.target.value)} className="w-full bg-black border border-cyan-500/50 text-xs text-white px-2 py-1 rounded focus:outline-none" />
                            <button onClick={() => saveEditedName(emp.id)} className="text-emerald-400"><Save size={14} /></button>
                            <button onClick={() => setEditingSlotId(null)} className="text-slate-500"><X size={14} /></button>
                          </div>
                        ) : (
                          <div className="flex items-center space-x-2 group mt-0.5">
                            <p className={`text-sm font-bold ${emp.isVacant ? 'text-red-400/60 italic' : 'text-slate-200'}`}>{emp.name}</p>
                            <button onClick={() => { setEditingSlotId(emp.id); setEditNameInput(emp.isVacant ? '' : emp.name); }} className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-cyan-400 transition-opacity"><Edit2 size={12} /></button>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center space-x-1.5">
                        <button onClick={() => setActiveViewedEmployee(emp)} className={`px-2 py-1.5 rounded text-[9px] font-mono uppercase border ${activeViewedEmployee.id === emp.id ? 'bg-cyan-950/40 border-cyan-500/50 text-cyan-400' : 'bg-slate-900 border-slate-700 text-slate-400 hover:bg-slate-800'}`}>Track</button>
                        <button onClick={() => handleToggleVacancy(emp.id)} className={`p-1.5 rounded-lg border transition-all ${emp.isVacant ? 'bg-emerald-950/20 text-emerald-400 border-emerald-500/30' : 'bg-slate-900 text-slate-500 hover:text-red-400 hover:border-red-500/30 border-slate-800'}`}>
                          {emp.isVacant ? <UserPlus size={14} /> : <UserMinus size={14} />}
                        </button>
                        {nodeHasCreds && (
                          <button onClick={() => handleAdminResetPassword(emp.id)} className="p-1.5 bg-slate-900 border border-slate-800 rounded-lg text-slate-500 hover:text-red-400 hover:border-red-500/30 transition-all" title="Force Wipe Passkey Credentials">
                            <Key size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* TIME CONSOLE / CALENDAR DISPLAY TERMINAL */}
        <div className="bg-[#0b0e1a]/95 border border-slate-800/80 rounded-xl shadow-2xl overflow-hidden backdrop-blur-md">
          <div className="flex items-center justify-between p-4 border-b border-slate-800/60 bg-slate-900/10">
            <h3 className="text-sm font-mono font-bold text-white tracking-widest uppercase flex items-center space-x-2">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 shadow-[0_0_8px_#06b6d4]" />
              <span>{currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>
              {user.role === 'MANAGER' && <span className="ml-2 text-[9px] font-mono text-cyan-400 bg-cyan-950/30 border border-cyan-900 px-2 py-0.5 rounded uppercase font-normal">Tracking Operative Node: {activeViewedEmployee.name}</span>}
            </h3>
            <div className="flex space-x-1.5">
              <button onClick={() => handleMonthChange('prev')} className="p-2 bg-slate-900 hover:bg-slate-800 text-slate-400 rounded-lg border border-slate-800"><ChevronLeft size={14} /></button>
              <button onClick={() => handleMonthChange('next')} className="p-2 bg-slate-900 hover:bg-slate-800 text-slate-400 rounded-lg border border-slate-800"><ChevronRight size={14} /></button>
            </div>
          </div>

          <div className="grid grid-cols-7 border-b border-slate-800/40 bg-black/30 font-mono text-center">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => <div key={day} className="py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">{day}</div>)}
          </div>

          <div className="grid grid-cols-7 bg-slate-950/20 gap-[1px] p-[1px]">
            {calendarGrid.map((dateItem, idx) => {
              if (!dateItem) return <div key={`blank-${idx}`} className="bg-[#060810]/40 min-h-[100px]" />;

              const isToday = new Date().toDateString() === dateItem.toDateString();
              const dateStr = formatDateString(dateItem);
              
              let baseShift = getShiftForDate(activeViewedEmployee.baseWeek, dateItem);
              let shiftCode = baseShift.code;
              let shiftLabel = baseShift.label;
              let isOvertime = false;

              const dayLeaveReq = leaveRequests.find(r => r.dateString === dateStr && r.employeeId === activeViewedEmployee.id);
              const dayNote = adminNotes.find(n => n.dateString === dateStr && n.employeeId === activeViewedEmployee.id);
              const personalClaim = overtimeClaims.find(c => c.dateString === dateStr && c.claimedBy === activeViewedEmployee.id);

              if (dayLeaveReq?.status === 'APPROVED') {
                shiftCode = 'AL';
                shiftLabel = 'Annual Leave';
              } else if (personalClaim) {
                shiftCode = personalClaim.shiftCode;
                shiftLabel = `${personalClaim.shiftLabel} ${personalClaim.assignedByAdmin ? '(DIR)' : '(OT)'}`;
                isOvertime = true;
              }

              let openOvertimeAvailable = false;
              if (shiftCode === 'OFF') {
                const approvedLeavesOnDay = leaveRequests.filter(r => r.dateString === dateStr && r.status === 'APPROVED' && r.employeeId !== activeViewedEmployee.id);
                const unclaimedLeave = approvedLeavesOnDay.find(l => !overtimeClaims.some(c => c.leaveRequestId === l.id) && !removedOvertimeIds.includes(l.id));
                if (unclaimedLeave) {
                  const vacatedEmployee = allEmployees.find(e => e.id === unclaimedLeave.employeeId);
                  if (vacatedEmployee && getShiftForDate(vacatedEmployee.baseWeek, dateItem).code !== 'OFF') {
                    openOvertimeAvailable = true;
                  }
                }
              }

              return (
                <div key={dateItem.toISOString()} onClick={() => openDayModal(dateItem)} className={`p-2 min-h-[120px] flex flex-col justify-between border relative group cursor-pointer transition-colors ${isToday ? 'border-transparent bg-[#0e1426]' : 'border-slate-900/60 bg-[#0b0e1a] hover:bg-slate-900/80'}`}>
                  {isToday && (
                    <div className="absolute inset-0 p-[2px] overflow-hidden pointer-events-none z-0">
                      <div className="absolute inset-0 w-[200%] h-[200%] top-[-50%] left-[-50%] animate-chaser bg-gradient-to-r from-cyan-400 via-indigo-500 to-pink-500" />
                      <div className="absolute inset-[2px] bg-[#0e1426]" />
                    </div>
                  )}
                  <div className="flex justify-between relative z-10 w-full items-start">
                    <span className={`text-[10px] font-mono font-bold ${isToday ? 'text-cyan-400' : 'text-slate-400'}`}>{dateItem.getDate().toString().padStart(2, '0')}</span>
                    <div className="flex items-center space-x-1">
                      {openOvertimeAvailable && <div className="text-purple-400 bg-purple-950/50 px-1 py-0.5 rounded text-[8px] font-mono font-bold tracking-wider border border-purple-500/30 animate-pulse">+OT</div>}
                      {dayNote && <div className="text-amber-400 bg-amber-950/40 p-1 rounded-md animate-bounce"><MessageSquare size={10} /></div>}
                    </div>
                  </div>
                  
                  {/* SYSTEM DISPATCH DIRECTIVES PREVIEW INSIDE CELL */}
                  {dayNote && (
                    <p className="text-[9px] font-mono text-amber-400/80 bg-amber-950/20 border border-amber-900/30 px-1.5 py-0.5 rounded mt-1 truncate z-10 max-w-full">
                      Note: {dayNote.text}
                    </p>
                  )}

                  <div className="relative z-10 mt-1.5 w-full">
                    {dayLeaveReq?.status === 'APPROVED' ? (
                      <div className="rounded-md border border-emerald-500/40 bg-emerald-950/30 p-1.5 text-emerald-300">
                        <div className="text-[10px] font-mono font-bold tracking-widest text-emerald-400">AL</div>
                        <div className="text-[8px] opacity-60 truncate uppercase mt-0.5">Annual Leave</div>
                      </div>
                    ) : dayLeaveReq?.status === 'DENIED' ? (
                      <div className="rounded-md border border-red-500/30 bg-red-950/20 p-1.5 text-red-300">
                        <div className="text-[10px] font-mono font-bold tracking-widest text-red-400">AL DENIED</div>
                        <div className="text-[8px] opacity-60 truncate uppercase mt-0.5">{shiftLabel}</div>
                      </div>
                    ) : (
                      <div className={`rounded-md border p-1.5 relative transition-all ${
                        dayLeaveReq?.status === 'PENDING'
                          ? 'bg-amber-950/10 border-amber-500/40'
                          : activeViewedEmployee.isVacant 
                            ? 'bg-red-950/10 border-red-900/30 opacity-40' 
                            : isOvertime 
                              ? personalClaim?.assignedByAdmin 
                                ? 'bg-indigo-950/40 border-indigo-500/50 text-indigo-300 shadow-[0_0_15px_rgba(99,102,241,0.15)]'
                                : 'bg-purple-950/40 border-purple-500/50 text-purple-300' 
                              : shiftCode === 'OFF' 
                                ? 'bg-black/40 border-slate-900/80 opacity-40 text-slate-500' 
                                : 'bg-[#12182e]/60 border-indigo-500/20 text-indigo-200'
                      }`}>
                        <div className="flex justify-between items-center w-full">
                          <div className={`text-[10px] font-mono font-bold tracking-widest ${
                            dayLeaveReq?.status === 'PENDING' ? 'text-amber-400' : isOvertime ? personalClaim?.assignedByAdmin ? 'text-indigo-400' : 'text-purple-400' : shiftCode === 'OFF' ? 'text-slate-600' : 'text-cyan-400'
                          }`}>
                            {activeViewedEmployee.isVacant ? 'VACANT' : shiftCode}
                          </div>
                          {dayLeaveReq?.status === 'PENDING' && <span className="text-[7px] font-mono bg-amber-500/20 text-amber-400 border border-amber-500/30 px-1 rounded">PENDING</span>}
                        </div>
                        <div className="text-[8px] truncate uppercase mt-0.5 opacity-60">
                          {shiftLabel}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </main>

      {/* MODAL CONFIGURATION HUB OVERLAY */}
      {selectedDate && (() => {
        const dateStr = formatDateString(selectedDate);
        const dayNote = adminNotes.find(n => n.dateString === dateStr && n.employeeId === activeViewedEmployee.id);
        const baseShift = getShiftForDate(activeViewedEmployee.baseWeek, selectedDate);
        const dayLeaveReq = leaveRequests.find(r => r.dateString === dateStr && r.employeeId === activeViewedEmployee.id);
        const personalClaim = overtimeClaims.find(c => c.dateString === dateStr && c.claimedBy === activeViewedEmployee.id);

        let finalShiftLabel = baseShift.label;
        let finalShiftCode = baseShift.code;
        let finalShiftTime = baseShift.time;

        if (dayLeaveReq?.status === 'APPROVED') {
          finalShiftCode = 'AL'; finalShiftLabel = 'Annual Leave';
        } else if (personalClaim) {
          finalShiftCode = personalClaim.shiftCode; finalShiftLabel = `${personalClaim.shiftLabel} ${personalClaim.assignedByAdmin ? '(Direct Allocation)' : '(Marketplace Claimed)'}`; finalShiftTime = personalClaim.shiftTime;
        }

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-[#0f1424] border border-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden relative">
              <div className="flex justify-between items-center p-4 border-b border-slate-800 bg-slate-900/40">
                <h3 className="font-mono font-bold text-white text-sm uppercase tracking-wider flex items-center space-x-2">
                  <CalendarIcon size={16} className="text-cyan-400" />
                  <span>{selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })}</span>
                </h3>
                <button onClick={() => setSelectedDate(null)} className="text-slate-500"><X size={18} /></button>
              </div>
              <div className="p-5 space-y-5 max-h-[80vh] overflow-y-auto custom-scrollbar">
                
                {/* ACTIVE NODE MATRIX STATUS CARD */}
                <div className="flex justify-between items-center bg-black/40 border border-slate-800/80 p-4 rounded-xl">
                  <div>
                    <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest mb-1">Roster Matrix ({activeViewedEmployee.name})</p>
                    <p className="text-base font-bold text-cyan-400">{finalShiftLabel} ({finalShiftCode})</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest mb-1">Schedule Block</p>
                    <p className="text-xs font-mono text-slate-300">{finalShiftTime}</p>
                  </div>
                </div>

                {/* MANAGER ADMINISTRATIVE CONTROLS */}
                {user.role === 'MANAGER' ? (
                  <div className="space-y-4">
                    
                    {/* DIRECT OVERTIME CONTROLS (INJECT OR REVOKE ANY OVERTIME) */}
                    <div className="bg-slate-900/40 border border-slate-800 p-3.5 rounded-xl space-y-3">
                      <h4 className="text-[10px] font-mono text-purple-400 uppercase tracking-widest font-bold flex items-center space-x-1">
                        <span>⚡ Administrative Overtime Manager</span>
                      </h4>
                      
                      {personalClaim ? (
                        <div className="bg-purple-950/20 border border-purple-500/30 p-3 rounded-lg flex items-center justify-between">
                          <div className="text-xs font-mono text-slate-300">
                            <span className="text-purple-400 font-bold block">{personalClaim.shiftLabel} ({personalClaim.shiftCode})</span>
                            {personalClaim.assignedByAdmin ? 'Forced Admin Allocation' : `Claimed by operative`}
                          </div>
                          <button 
                            onClick={() => handleAdminRemoveOvertime(personalClaim.id)}
                            className="bg-red-950/60 hover:bg-red-950 text-red-400 border border-red-800/50 p-2 rounded-lg transition-all flex items-center space-x-1 font-mono text-[10px] uppercase tracking-wider font-bold"
                          >
                            <Trash2 size={13} /> <span>Revoke</span>
                          </button>
                        </div>
                      ) : (
                        <div>
                          <p className="text-[11px] font-mono text-slate-500 mb-2">Inject an absolute overtime schedule override block:</p>
                          <div className="grid grid-cols-2 gap-2">
                            {OVERTIME_TEMPLATES.map(tmpl => (
                              <button
                                key={tmpl.code}
                                onClick={() => handleAdminInjectOvertime(dateStr, tmpl)}
                                className="bg-slate-950 border border-slate-800 hover:border-purple-500/50 hover:bg-purple-950/10 p-2 rounded-lg text-left transition-all"
                              >
                                <div className="flex justify-between items-center">
                                  <span className="text-xs font-bold text-white font-mono">{tmpl.code}</span>
                                  <Plus size={12} className="text-purple-400" />
                                </div>
                                <span className="text-[9px] text-slate-400 block mt-0.5 truncate">{tmpl.label}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* COMPLETE DAILY OPERATIONAL GRID RECONCILIATION */}
                    <div className="bg-slate-900/40 border border-slate-800 p-3.5 rounded-xl space-y-2.5 shadow-inner">
                      <h4 className="text-[10px] font-mono text-cyan-400 uppercase tracking-widest flex items-center space-x-1.5 font-bold">
                        <Cpu size={12} /> <span>Daily Operational Roster</span>
                      </h4>
                      <div className="space-y-1.5 max-h-[140px] overflow-y-auto pr-1 custom-scrollbar">
                        {allEmployees.filter(e => e.role !== 'MANAGER').map(emp => {
                          const empLeave = leaveRequests.find(r => r.dateString === dateStr && r.employeeId === emp.id);
                          const empClaim = overtimeClaims.find(c => c.dateString === dateStr && c.claimedBy === emp.id);
                          
                          let currentCode = ''; let currentStyle = '';

                          if (empLeave?.status === 'APPROVED') {
                            currentCode = 'AL (Annual Leave)'; currentStyle = 'bg-emerald-950/20 text-emerald-400 border-emerald-900/30';
                          } else if (empClaim) {
                            currentCode = `${empClaim.shiftCode} ${empClaim.assignedByAdmin ? '(DIR)' : '(OT)'}`; currentStyle = 'bg-purple-950/20 text-purple-400 border-purple-900/30';
                          } else {
                            const structural = getShiftForDate(emp.baseWeek, selectedDate);
                            currentCode = structural.code === 'OFF' ? 'OFF' : `${structural.code} (${structural.time})`;
                            currentStyle = structural.code === 'OFF' ? 'bg-black/30 text-slate-600 border-slate-900/40 opacity-50' : 'bg-indigo-950/20 text-indigo-300 border-indigo-900/30';
                          }

                          return (
                            <div key={emp.id} className={`flex justify-between items-center px-3 py-1.5 rounded-lg border text-xs ${currentStyle}`}>
                              <span className="font-bold tracking-wide truncate max-w-[160px]">{emp.name}</span>
                              <span className="font-mono text-[9px] uppercase tracking-wider font-semibold">{currentCode}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* HIGH LEVEL TELEMETRY COMPONENT NOTE DISPATCHER */}
                    <div className="space-y-2">
                      <label className="text-[10px] font-mono text-amber-400 flex items-center space-x-1.5 uppercase tracking-widest"><AlignLeft size={12} /> <span>Operative Dispatch Note</span></label>
                      <textarea value={noteInput} onChange={(e) => setNoteInput(e.target.value)} placeholder="Transmit system directives visible directly on this worker's calendar view..." className="w-full h-22 bg-black/50 border border-slate-800 rounded-xl p-3 text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50 resize-none" />
                      <div className="flex justify-end">
                        <button onClick={handleSaveNote} className="bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-mono text-[10px] font-bold uppercase tracking-widest px-4 py-2 rounded-lg flex items-center space-x-2"><Save size={14} /> <span>Transmit Note</span></button>
                      </div>
                    </div>
                  </div>
                ) : (
                  // --- OPERATIVE USER CONSOLE VIEW ---
                  <div className="space-y-4">
                    {dayNote && (
                      <div className="bg-amber-950/20 border border-amber-900/40 p-4 rounded-xl relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-1 h-full bg-amber-500" />
                        <h4 className="text-[10px] font-mono text-amber-400 uppercase tracking-widest flex items-center space-x-2 mb-2"><MessageSquare size={12} /> <span>Direct Communication Log</span></h4>
                        <p className="text-sm text-slate-300 font-sans leading-relaxed">{dayNote.text}</p>
                      </div>
                    )}
                    
                    {/* Marketplace Open Overtime Scanner Element */}
                    {(() => {
                      if (dayLeaveReq || personalClaim || baseShift.code !== 'OFF') return null;
                      const approvedLeavesOnDay = leaveRequests.filter(r => r.dateString === dateStr && r.status === 'APPROVED' && r.employeeId !== activeViewedEmployee.id);
                      const unclaimedLeave = approvedLeavesOnDay.find(l => !overtimeClaims.some(c => c.leaveRequestId === l.id) && !removedOvertimeIds.includes(l.id));
                      if (!unclaimedLeave) return null;

                      const vacatedEmployee = allEmployees.find(e => e.id === unclaimedLeave.employeeId);
                      if (!vacatedEmployee) return null;
                      const originalShift = getShiftForDate(vacatedEmployee.baseWeek, selectedDate);
                      if (originalShift.code === 'OFF') return null;

                      return (
                        <div className="border border-purple-500/40 bg-purple-950/20 p-4 rounded-xl space-y-3 shadow-[0_0_15px_rgba(168,85,247,0.15)]">
                          <div className="flex items-center space-x-2 text-purple-400 font-mono text-xs font-bold uppercase tracking-wider">
                            <Bell size={14} className="animate-bounce" /> <span>Overtime Premium Available</span>
                          </div>
                          <p className="text-xs text-slate-300">
                            <strong>{vacatedEmployee.name}</strong> has been granted leave. Shift block <span className="text-purple-300 font-bold">{originalShift.code} ({originalShift.time})</span> is unstaffed.
                          </p>
                          <button 
                            onClick={() => { handleClaimOvertime(unclaimedLeave, originalShift); setSelectedDate(null); }}
                            className="w-full bg-purple-600 hover:bg-purple-500 text-white font-mono text-[10px] font-bold uppercase tracking-widest py-2.5 rounded-lg transition-all"
                          >
                            Accept Overtime Assignment
                          </button>
                        </div>
                      );
                    })()}

                    {dayLeaveReq ? (
                      dayLeaveReq.status === 'PENDING' ? (
                        <button onClick={() => { handleCancelLeave(dayLeaveReq.id); setSelectedDate(null); }} className="w-full bg-red-950/40 hover:bg-red-900/50 text-red-400 font-mono text-[10px] font-bold uppercase tracking-widest py-3 rounded-xl border border-red-500/30 transition-all flex items-center justify-center space-x-2">
                          <X size={14} /> <span>Cancel Leave Request</span>
                        </button>
                      ) : (
                        <div className="w-full bg-emerald-950/20 text-emerald-400 font-mono text-[10px] font-bold uppercase tracking-widest py-3 rounded-xl border border-emerald-500/30 text-center select-none">
                          Leave Request Approved
                        </div>
                      )
                    ) : (
                      !personalClaim && (
                        baseShift.code === 'OFF' ? (
                          <div className="w-full bg-slate-900/60 text-slate-500 font-mono text-[9px] font-bold uppercase tracking-widest py-3 rounded-xl border border-slate-800/40 text-center select-none italic">
                            Leave Request Disabled • Scheduled Rest Day
                          </div>
                        ) : (
                          user.id === activeViewedEmployee.id && (
                            <button 
                              onClick={() => { handleRequestLeave(dateStr); setSelectedDate(null); }} 
                              className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-mono text-[10px] font-bold uppercase tracking-widest py-3 rounded-xl transition-all flex items-center justify-center space-x-2"
                            >
                              <CalendarIcon size={14} /> <span>Request Annual Leave</span>
                            </button>
                          )
                        )
                      )
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
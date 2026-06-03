export type ShiftCode = 'OFF' | 'PH' | 'PEF' | 'XPH' | 'ED' | 'NX' | 'TH' | 'X_SHIFT' | 'AL';

export interface ShiftDetails {
  code: ShiftCode;
  label: string;
  time: string;
}

export interface Employee {
  id: string;
  name: string;
  baseWeek: number;
  role: 'OPERATIVE' | 'MANAGER';
  department: string;
  isVacant?: boolean; // If true, this slot is active but currently lacks an allocated operative
}

export interface LeaveRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  dateString: string; // YYYY-MM-DD
  status: 'PENDING' | 'APPROVED' | 'DENIED';
  denialReason?: string;
}

export interface AdminNote {
  dateString: string; // YYYY-MM-DD
  note: string;
  type: 'INFO' | 'DENIAL';
}
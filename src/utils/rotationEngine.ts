import type { ShiftCode, ShiftDetails } from '../types';

export const SHIFTS: Record<ShiftCode, ShiftDetails> = {
  OFF: { code: 'OFF', label: 'OFF DAY', time: 'No Shift', colorClass: 'bg-slate-100 text-slate-600 border-slate-300' },
  PH: { code: 'PH', label: 'PH Shift', time: '12:00 – 20:00', colorClass: 'bg-amber-100 text-amber-800 border-amber-300' },
  PEF: { code: 'PEF', label: 'PEF Shift', time: '09:00 – 18:00', colorClass: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  XPH: { code: 'XPH', label: 'XPH Shift', time: '12:30 – 20:30', colorClass: 'bg-cyan-100 text-cyan-800 border-cyan-300' },
  ED: { code: 'ED', label: 'ED Shift', time: '14:00 – 22:00', colorClass: 'bg-indigo-100 text-indigo-800 border-indigo-300' },
  NX: { code: 'NX', label: 'NX Shift', time: '08:00 – 16:00', colorClass: 'bg-purple-100 text-purple-800 border-purple-300' },
  TH: { code: 'TH', label: 'TH Shift', time: '08:30 – 17:00', colorClass: 'bg-pink-100 text-pink-800 border-pink-300' },
  X_SHIFT: { code: 'X_SHIFT', label: 'X Shift', time: '08:30 – 16:30', colorClass: 'bg-blue-100 text-blue-800 border-blue-300' }
};

export const MASTER_PATTERN: Record<number, ShiftCode[]> = {
  1: ['OFF', 'OFF', 'OFF', 'PH', 'PH', 'PEF', 'PEF'],
  2: ['OFF', 'OFF', 'XPH', 'XPH', 'XPH', 'OFF', 'OFF'],
  3: ['OFF', 'OFF', 'OFF', 'ED', 'ED', 'ED', 'ED'],
  4: ['OFF', 'OFF', 'PH', 'OFF', 'OFF', 'X_SHIFT', 'X_SHIFT'],
  5: ['PH', 'PH', 'OFF', 'OFF', 'OFF', 'ED', 'ED'],
  6: ['ED', 'XPH', 'NX', 'OFF', 'OFF', 'OFF', 'OFF'],
  7: ['XPH', 'ED', 'ED', 'OFF', 'OFF', 'OFF', 'OFF'],
  8: ['NX', 'NX', 'OFF', 'OFF', 'OFF', 'TH', 'TH'],
  9: ['OFF', 'OFF', 'OFF', 'NX', 'NX', 'X_SHIFT', 'X_SHIFT']
};

export const SYSTEM_ANCHOR_DATE = new Date('2026-06-01');

export function getPatternWeekForDate(baseWeek: number, targetDate: Date): number {
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  const elapsedWeeks = Math.floor((targetDate.getTime() - SYSTEM_ANCHOR_DATE.getTime()) / msPerWeek);
  
  let currentWeek = (baseWeek + (elapsedWeeks % 9)) % 9;
  if (currentWeek <= 0) currentWeek += 9;
  
  return currentWeek;
}

export function getShiftForDate(baseWeek: number, targetDate: Date): ShiftDetails {
  const currentPatternWeek = getPatternWeekForDate(baseWeek, targetDate);
  let dayIndex = targetDate.getDay() - 1; 
  if (dayIndex === -1) dayIndex = 6; 

  const shiftCode = MASTER_PATTERN[currentPatternWeek][dayIndex];
  return SHIFTS[shiftCode];
}
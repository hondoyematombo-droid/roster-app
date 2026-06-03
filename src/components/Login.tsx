import React, { useState } from 'react';
import type { Employee } from '../types';
import { ShieldAlert, Cpu } from 'lucide-react';

interface LoginProps {
  employees: Employee[];
  onLoginSuccess: (employee: Employee) => void;
}

export default function Login({ employees, onLoginSuccess }: LoginProps) {
  const [inputSignature, setInputSignature] = useState('');
  const [error, setError] = useState('');

  const handleIdentitySubmission = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Scan the database for a matching signature string
    const authenticatedUser = employees.find(
      (emp) => emp.name.trim().toLowerCase() === inputSignature.trim().toLowerCase()
    );

    if (authenticatedUser) {
      setError('');
      // The parent component handles the routing transparently based on the user's role property.
      // If the role is 'MANAGER', it fires the admin deck. If 'OPERATIVE', it fires the normal grid.
      onLoginSuccess(authenticatedUser);
    } else {
      // We use a completely generic security message so failed attempts don't reveal user configurations
      setError('ACCESS DENIED: Identity signature unregistered in current cycle parameters.');
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#070a13] px-4 font-sans relative overflow-hidden selection:bg-indigo-500/30">
      {/* Background Ambient Aesthetics */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-indigo-600/10 rounded-full blur-[120px]" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-cyan-600/10 rounded-full blur-[120px]" />

      <div className="w-full max-w-md rounded-2xl bg-[#0f1424]/80 border border-slate-800/80 p-6 sm:p-8 shadow-2xl backdrop-blur-xl relative">
        
        {/* Central Core Emblem */}
        <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-gradient-to-tr from-indigo-600 to-cyan-500 p-3 rounded-xl shadow-[0_0_25px_rgba(6,182,212,0.4)] text-white">
          <Cpu size={24} />
        </div>

        {/* Clean, Non-Suggestive Header Text */}
        <div className="text-center mt-4">
          <h2 className="text-2xl font-black tracking-widest text-white uppercase bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-200 to-slate-400">
            ROSTERPORTAL<span className="text-cyan-400 font-medium">.OS</span>
          </h2>
          <p className="mt-2 text-xs font-mono tracking-wider text-slate-400 uppercase">
            Input authorization identifier key
          </p>
        </div>
        
        {/* Single Stream Login Form */}
        <form className="mt-8 space-y-6" onSubmit={handleIdentitySubmission}>
          <div>
            <label htmlFor="signature" className="block text-[10px] font-mono tracking-widest text-cyan-400 uppercase">
              Operator Full Identity Signature
            </label>
            <div className="relative mt-2">
              <input
                id="signature"
                type="text"
                required
                value={inputSignature}
                onChange={(e) => setInputSignature(e.target.value)}
                placeholder="e.g., Alice Smith"
                className="w-full rounded-xl border border-slate-800 bg-black/40 px-4 py-3 text-sm text-slate-200 font-mono placeholder-slate-600 focus:border-cyan-500/60 focus:outline-none focus:ring-1 focus:ring-cyan-500/30 transition-all duration-300"
              />
            </div>
          </div>

          {error && (
            <div className="flex items-start space-x-2 text-xs font-mono text-red-400 bg-red-950/20 border border-red-900/50 p-3 rounded-xl">
              <ShieldAlert size={16} className="shrink-0 text-red-400" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            className="w-full rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 px-4 py-3 text-xs font-mono font-bold tracking-widest text-white uppercase transition-all duration-300 shadow-[0_4px_20px_rgba(79,70,229,0.2)] hover:shadow-[0_0_25px_rgba(6,182,212,0.4)] active:scale-[0.98]"
          >
            Initiate System Grid Load
          </button>
        </form>
      </div>
    </div>
  );
}
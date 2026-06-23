'use strict';
'use client';

import { useState, useEffect } from 'react';

export default function Home() {
  const [pods, setPods] = useState([]);
  const [status, setStatus] = useState({ status: 'Unknown', summary: { total: 0, running: 0, pending: 0, failed: 0 } });
  const [selectedPod, setSelectedPod] = useState(null);
  const [investigation, setInvestigation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  const [errorMsg, setErrorMsg] = useState(null);
  const [backendConnected, setBackendConnected] = useState(true);

  const API_BASE = 'http://localhost:3001/api';

  // Fetch status and pods list
  const fetchData = async () => {
    try {
      const [statusRes, podsRes] = await Promise.all([
        fetch(`${API_BASE}/status`),
        fetch(`${API_BASE}/pods`)
      ]);

      if (!statusRes.ok || !podsRes.ok) {
        throw new Error('Failed to fetch data from backend');
      }

      const statusData = await statusRes.json();
      const podsData = await podsRes.json();

      setStatus(statusData);
      setPods(podsData);
      setBackendConnected(true);
      setErrorMsg(null);
    } catch (err) {
      console.error('Error fetching cluster data:', err);
      setBackendConnected(false);
    }
  };

  // Poll for pod status every 4 seconds
  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 4000);
    return () => clearInterval(interval);
  }, []);

  // Run deep investigation on a pod
  const handleInvestigate = async (podName) => {
    setSelectedPod(podName);
    setLoading(true);
    setInvestigation(null);
    
    // Simulate diagnostic steps for UI polish
    const steps = [
      'Locating pod in default namespace...',
      'Retrieving container state & exit codes...',
      'Extracting logs (checking current and crashed states)...',
      'Harvesting cluster warning events...',
      'Mapping owner ReplicaSets & Deployment metadata...',
      'Sending diagnostics to AI SRE Engine...'
    ];

    for (let i = 0; i < steps.length; i++) {
      setLoadingStep(steps[i]);
      await new Promise(r => setTimeout(r, 600));
    }

    try {
      const res = await fetch(`${API_BASE}/investigate/${podName}`);
      if (!res.ok) {
        throw new Error(`Failed to investigate pod ${podName}`);
      }
      const data = await res.json();
      setInvestigation(data);
      setErrorMsg(null);
    } catch (err) {
      console.error(err);
      setErrorMsg(`Failed to run investigation: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-teal-500 selection:text-black">
      {/* Top Banner for connection warning */}
      {!backendConnected && (
        <div className="bg-red-950 border-b border-red-800 text-red-200 text-center py-2.5 px-4 text-sm font-medium flex items-center justify-center gap-2 animate-pulse">
          <span className="h-2 w-2 rounded-full bg-red-500"></span>
          Cannot connect to Backend API (running on localhost:3001). Please make sure the backend Express server is running.
        </div>
      )}

      {/* Main Container */}
      <div className="max-w-7xl mx-auto p-6 md:p-8">
        
        {/* Header */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8 pb-6 border-b border-zinc-800">
          <div>
            <div className="flex items-center gap-2 text-teal-400 text-sm font-semibold tracking-wider uppercase mb-1">
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-teal-500"></span>
              </span>
              Live Monitoring
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-white bg-clip-text text-transparent bg-gradient-to-r from-white via-zinc-200 to-zinc-500">
              K8s Health Investigator
            </h1>
          </div>

          <div className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 shadow-xl">
            <span className="text-sm text-zinc-400">Cluster Status:</span>
            <div className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${
                status.status === 'Healthy' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]' :
                status.status === 'Degraded' ? 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.6)]' :
                'bg-zinc-600'
              }`}></span>
              <span className="font-semibold text-sm text-white uppercase">{status.status}</span>
            </div>
          </div>
        </header>

        {/* Stats Grid */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Total Pods', val: status.summary.total, color: 'text-zinc-400', bg: 'bg-zinc-900' },
            { label: 'Running', val: status.summary.running, color: 'text-emerald-400', bg: 'bg-emerald-950/20 border-emerald-900/30' },
            { label: 'Pending', val: status.summary.pending, color: 'text-amber-400', bg: 'bg-amber-950/20 border-amber-900/30' },
            { label: 'Failed / Crashed', val: status.summary.failed, color: 'text-rose-400', bg: 'bg-rose-950/20 border-rose-900/30' }
          ].map((card, i) => (
            <div key={i} className={`p-5 rounded-xl border border-zinc-800 ${card.bg} shadow-md transition hover:border-zinc-700`}>
              <div className="text-sm font-medium text-zinc-400">{card.label}</div>
              <div className={`text-3xl font-bold mt-1.5 ${card.color}`}>{card.val}</div>
            </div>
          ))}
        </section>

        {/* Workspace Columns */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Pods List (Left Column) */}
          <section className="lg:col-span-5 bg-zinc-900 border border-zinc-800 rounded-2xl shadow-xl overflow-hidden flex flex-col h-[600px]">
            <div className="p-5 border-b border-zinc-800 bg-zinc-900/50 flex justify-between items-center">
              <h2 className="font-bold text-white tracking-wide">Cluster Pods</h2>
              <button 
                onClick={fetchData}
                className="text-xs font-semibold px-2.5 py-1.5 rounded-md bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 text-zinc-300 transition"
              >
                Refresh
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto divide-y divide-zinc-800/60">
              {pods.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-zinc-500 p-6 text-center">
                  <svg className="w-12 h-12 mb-3 text-zinc-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                  <p className="font-medium text-zinc-400">No active pods found</p>
                  <p className="text-xs text-zinc-600 mt-1">Deploy Kubernetes resources to get started</p>
                </div>
              ) : (
                pods.map((pod, i) => (
                  <div key={i} className="p-4 flex items-center justify-between hover:bg-zinc-800/40 transition">
                    <div className="flex-1 min-w-0 pr-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-white truncate block">{pod.name}</span>
                        {pod.restartCount > 0 && (
                          <span className="bg-rose-950/80 border border-rose-900 text-rose-300 text-[10px] font-bold px-1.5 py-0.5 rounded">
                            {pod.restartCount} restart{pod.restartCount > 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                      <div className="flex gap-2 items-center text-xs text-zinc-500 mt-1 font-mono">
                        <span className={`inline-block h-1.5 w-1.5 rounded-full ${
                          pod.status === 'Running' ? 'bg-emerald-500' :
                          pod.status === 'Pending' || pod.status === 'Waiting' ? 'bg-amber-500' :
                          'bg-rose-500'
                        }`}></span>
                        <span>{pod.status}</span>
                        <span>•</span>
                        <span className="text-zinc-400 truncate max-w-[150px]">{pod.reason}</span>
                      </div>
                    </div>

                    <button
                      onClick={() => handleInvestigate(pod.name)}
                      disabled={loading}
                      className={`text-xs font-semibold px-3 py-2 rounded-lg flex items-center gap-1.5 transition ${
                        pod.status === 'Running'
                          ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700'
                          : 'bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-black shadow-lg font-bold'
                      }`}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                      </svg>
                      {pod.status === 'Running' ? 'Inspect' : 'Investigate'}
                    </button>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* Investigation & Diagnostics Panel (Right Column) */}
          <section className="lg:col-span-7 flex flex-col min-h-[600px]">
            
            {!selectedPod ? (
              <div className="flex-1 bg-zinc-900/40 border border-zinc-800/80 rounded-2xl p-8 flex flex-col items-center justify-center text-center text-zinc-500">
                <svg className="w-16 h-16 text-zinc-800 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <h3 className="text-white font-bold text-lg mb-1">Diagnostic Dashboard</h3>
                <p className="max-w-sm text-sm text-zinc-400 mt-1 leading-relaxed">
                  Select a pod from the list and click <strong>Investigate</strong> to analyze crash logs, describe variables, and invoke the AI diagnostics engine.
                </p>
              </div>
            ) : loading ? (
              // Loading Skeleton with Step Progress
              <div className="flex-1 bg-zinc-900 border border-zinc-800 rounded-2xl p-8 flex flex-col items-center justify-center">
                <div className="h-10 w-10 border-4 border-teal-500 border-t-transparent rounded-full animate-spin mb-6"></div>
                <h3 className="text-white font-bold text-lg mb-2">Analyzing Pod '{selectedPod}'</h3>
                <div className="text-zinc-400 text-sm font-mono text-center flex items-center gap-2">
                  <span className="inline-block h-2 w-2 rounded-full bg-teal-400 animate-ping"></span>
                  {loadingStep}
                </div>
                <div className="w-64 bg-zinc-800 h-1.5 rounded-full overflow-hidden mt-6">
                  <div className="bg-gradient-to-r from-teal-500 to-emerald-500 h-full animate-[loading_4s_ease-in-out_infinite] rounded-full w-full"></div>
                </div>
              </div>
            ) : errorMsg ? (
              <div className="flex-1 bg-zinc-900 border border-red-900/40 rounded-2xl p-8 flex flex-col items-center justify-center text-center">
                <div className="text-rose-500 text-4xl mb-4">⚠️</div>
                <h3 className="text-white font-bold text-lg">Investigation Failed</h3>
                <p className="text-red-400 text-sm mt-2 max-w-md font-mono bg-red-950/30 p-3 rounded-lg border border-red-900/30">
                  {errorMsg}
                </p>
                <button 
                  onClick={() => handleInvestigate(selectedPod)}
                  className="mt-6 text-sm font-semibold px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg border border-zinc-700 transition"
                >
                  Retry Analysis
                </button>
              </div>
            ) : investigation ? (
              // Results Display
              <div className="space-y-6 flex-1">
                
                {/* AI Root Cause Card */}
                <div className="bg-zinc-900 border border-teal-500/30 rounded-2xl shadow-[0_0_20px_rgba(20,184,166,0.05)] overflow-hidden">
                  <div className="bg-gradient-to-r from-teal-950/30 to-zinc-900 border-b border-zinc-800 px-6 py-4 flex justify-between items-center">
                    <div className="flex items-center gap-2.5">
                      <span className="text-teal-400 text-lg">✨</span>
                      <h3 className="font-bold text-white">AI Diagnostics & RCA</h3>
                    </div>
                    <span className="bg-zinc-800 text-zinc-300 text-[11px] font-mono font-medium px-2.5 py-1 rounded-md border border-zinc-700">
                      AI Powered
                    </span>
                  </div>

                  <div className="p-6 space-y-5">
                    {/* Incident Summary */}
                    <div>
                      <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Incident Summary</div>
                      <div className="mt-1 text-lg font-bold text-rose-400">
                        {investigation.analysis.incident}
                      </div>
                    </div>

                    {/* Root Cause */}
                    <div>
                      <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Root Cause Analysis</div>
                      <p className="mt-1.5 text-sm text-zinc-300 leading-relaxed bg-zinc-950/40 border border-zinc-800/80 p-4 rounded-xl font-mono">
                        {investigation.analysis.rootCause}
                      </p>
                    </div>

                    {/* Actionable Fix */}
                    <div>
                      <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Suggested Fix</div>
                      <div className="mt-2 bg-zinc-950 border border-zinc-800 rounded-xl p-4 overflow-x-auto relative">
                        <pre className="text-emerald-400 text-xs font-mono whitespace-pre-wrap leading-relaxed">
                          {investigation.analysis.fix}
                        </pre>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Collapsible raw diagnostics drawers */}
                <div className="space-y-4">
                  <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider pl-1">Raw Diagnostics Collected</h4>
                  
                  {/* Container Logs */}
                  <details className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden group">
                    <summary className="p-4 text-sm font-semibold text-zinc-300 hover:text-white cursor-pointer select-none flex justify-between items-center group-open:border-b group-open:border-zinc-800">
                      <span>Crashed Container Logs</span>
                      <svg className="w-4 h-4 text-zinc-500 transition-transform group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </summary>
                    <div className="p-4 bg-zinc-950 font-mono text-[11px] text-zinc-400 overflow-x-auto max-h-[300px]">
                      <pre className="whitespace-pre">{investigation.diagnostics.logsExerpt || 'No log data fetched.'}</pre>
                    </div>
                  </details>

                  {/* K8s Events */}
                  <details className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden group">
                    <summary className="p-4 text-sm font-semibold text-zinc-300 hover:text-white cursor-pointer select-none flex justify-between items-center group-open:border-b group-open:border-zinc-800">
                      <span>Recent Namespace Events</span>
                      <svg className="w-4 h-4 text-zinc-500 transition-transform group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </summary>
                    <div className="p-4 bg-zinc-950 font-mono text-[11px] text-zinc-400 overflow-x-auto max-h-[300px]">
                      {investigation.diagnostics.events && investigation.diagnostics.events.length > 0 ? (
                        <pre className="whitespace-pre-wrap">{investigation.diagnostics.events.join('\n')}</pre>
                      ) : (
                        <p className="text-zinc-600">No events found.</p>
                      )}
                    </div>
                  </details>
                </div>
              </div>
            ) : null}

          </section>

        </div>

      </div>
    </div>
  );
}

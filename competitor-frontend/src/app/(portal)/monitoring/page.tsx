"use client";

import React, { useState, useEffect } from "react";
import {
  ShieldAlert,
  ShieldCheck,
  Activity,
  AlertTriangle,
  RefreshCw,
  Search,
  UserCheck,
  UserX,
  ExternalLink,
  Cpu,
  Wifi,
  FileCode,
} from "lucide-react";

interface CompetitorRisk {
  userId: string;
  username: string;
  displayName: string;
  proctorExempt: boolean;
  score: number;
  severity: "HIGH" | "MEDIUM" | "LOW";
  findingCount: number;
  lastPingAt: string | null;
}

interface EvidenceFinding {
  id: string;
  ruleId: string;
  title: string;
  category: string;
  weight: number;
  evidence: any;
  createdAt: string;
}

export default function ProctoringMonitoringPage() {
  const [competitors, setCompetitors] = useState<CompetitorRisk[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterSeverity, setFilterSeverity] = useState<string>("ALL");
  const [selectedUser, setSelectedUser] = useState<CompetitorRisk | null>(null);
  const [findings, setFindings] = useState<EvidenceFinding[]>([]);
  const [loadingFindings, setLoadingFindings] = useState(false);

  const fetchRiskData = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/admin/proctor/risk");
      if (res.ok) {
        const data = await res.json();
        setCompetitors(data.risk || []);
      }
    } catch (err) {
      console.error("Failed to fetch proctor risk data", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchUserFindings = async (user: CompetitorRisk) => {
    setSelectedUser(user);
    setLoadingFindings(true);
    try {
      const res = await fetch(`/api/v1/admin/proctor/findings/${user.userId}`);
      if (res.ok) {
        const data = await res.json();
        setFindings(data.findings || []);
      }
    } catch (err) {
      console.error("Failed to fetch user findings", err);
    } finally {
      setLoadingFindings(false);
    }
  };

  const toggleExemption = async (userId: string, currentExempt: boolean) => {
    try {
      const res = await fetch(`/api/v1/admin/users/${userId}/exemption`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exempt: !currentExempt }),
      });
      if (res.ok) {
        fetchRiskData();
        if (selectedUser?.userId === userId) {
          setSelectedUser((prev) => (prev ? { ...prev, proctorExempt: !currentExempt } : null));
        }
      }
    } catch (err) {
      console.error("Failed to toggle exemption", err);
    }
  };

  useEffect(() => {
    fetchRiskData();
    const interval = setInterval(fetchRiskData, 15000);
    return () => clearInterval(interval);
  }, []);

  const filteredCompetitors = competitors.filter((c) => {
    const matchesSearch =
      c.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.displayName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesSeverity = filterSeverity === "ALL" || c.severity === filterSeverity;
    return matchesSearch && matchesSeverity;
  });

  const highRiskCount = competitors.filter((c) => c.severity === "HIGH").length;
  const mediumRiskCount = competitors.filter((c) => c.severity === "MEDIUM").length;

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 bg-zinc-950 text-zinc-100 min-h-screen">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-zinc-800 pb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
            <ShieldAlert className="w-8 h-8 text-amber-500" />
            Proctoring & Risk Control Center
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Real-time local desktop signal analysis, LLM inference port probes, and non-intrusive risk scoring.
          </p>
        </div>
        <button
          onClick={fetchRiskData}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-zinc-900 border border-zinc-700 hover:border-zinc-500 rounded-lg transition"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          Refresh Signals
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Total Contestants</span>
            <Activity className="w-5 h-5 text-blue-400" />
          </div>
          <p className="text-3xl font-bold mt-2 text-white">{competitors.length}</p>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">High Risk Alerts</span>
            <AlertTriangle className="w-5 h-5 text-red-500" />
          </div>
          <p className="text-3xl font-bold mt-2 text-red-400">{highRiskCount}</p>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Medium Risk</span>
            <AlertTriangle className="w-5 h-5 text-amber-400" />
          </div>
          <p className="text-3xl font-bold mt-2 text-amber-400">{mediumRiskCount}</p>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Proctor Exempt</span>
            <UserCheck className="w-5 h-5 text-emerald-400" />
          </div>
          <p className="text-3xl font-bold mt-2 text-emerald-400">
            {competitors.filter((c) => c.proctorExempt).length}
          </p>
        </div>
      </div>

      {/* Controls & Search */}
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-3 text-zinc-500" />
          <input
            type="text"
            placeholder="Search competitor by username or name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-9 pr-4 py-2 text-sm text-zinc-200 focus:outline-none focus:border-zinc-600"
          />
        </div>
        <div className="flex items-center gap-2">
          {["ALL", "HIGH", "MEDIUM", "LOW"].map((sev) => (
            <button
              key={sev}
              onClick={() => setFilterSeverity(sev)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition ${
                filterSeverity === sev
                  ? "bg-zinc-100 text-zinc-900 border-zinc-100"
                  : "bg-zinc-900 text-zinc-400 border-zinc-800 hover:border-zinc-700"
              }`}
            >
              {sev}
            </button>
          ))}
        </div>
      </div>

      {/* Main Table & Findings Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className={`lg:col-span-${selectedUser ? "2" : "3"} bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden`}>
          <table className="w-full text-left text-sm text-zinc-300">
            <thead className="bg-zinc-950 text-zinc-400 text-xs font-semibold uppercase border-b border-zinc-800">
              <tr>
                <th className="px-5 py-3.5">Competitor</th>
                <th className="px-5 py-3.5">Risk Score</th>
                <th className="px-5 py-3.5">Findings</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {filteredCompetitors.map((c) => (
                <tr
                  key={c.userId}
                  className={`hover:bg-zinc-800/40 transition cursor-pointer ${
                    selectedUser?.userId === c.userId ? "bg-zinc-800/60" : ""
                  }`}
                  onClick={() => fetchUserFindings(c)}
                >
                  <td className="px-5 py-4">
                    <div className="font-semibold text-white">{c.displayName}</div>
                    <div className="text-xs text-zinc-500">@{c.username}</div>
                  </td>
                  <td className="px-5 py-4">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                        c.severity === "HIGH"
                          ? "bg-red-500/10 text-red-400 border border-red-500/30"
                          : c.severity === "MEDIUM"
                          ? "bg-amber-500/10 text-amber-400 border border-amber-500/30"
                          : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                      }`}
                    >
                      {c.score} pts ({c.severity})
                    </span>
                  </td>
                  <td className="px-5 py-4 font-mono text-xs">{c.findingCount} evidence rules</td>
                  <td className="px-5 py-4">
                    {c.proctorExempt ? (
                      <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1">
                        <UserCheck className="w-3.5 h-3.5" /> Exempt
                      </span>
                    ) : (
                      <span className="text-xs font-semibold text-zinc-400">Enforced</span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleExemption(c.userId, c.proctorExempt);
                      }}
                      className="text-xs font-medium text-zinc-400 hover:text-white underline underline-offset-4"
                    >
                      {c.proctorExempt ? "Enforce" : "Exempt"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Evidence Drawer */}
        {selectedUser && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
            <div className="flex justify-between items-start border-b border-zinc-800 pb-3">
              <div>
                <h3 className="font-bold text-white text-base">{selectedUser.displayName}</h3>
                <p className="text-xs text-zinc-400">Evidence Trail & Signal Log</p>
              </div>
              <button
                onClick={() => setSelectedUser(null)}
                className="text-xs text-zinc-500 hover:text-white"
              >
                Close
              </button>
            </div>

            {loadingFindings ? (
              <div className="py-12 text-center text-xs text-zinc-500">Loading evidence...</div>
            ) : findings.length === 0 ? (
              <div className="py-12 text-center text-xs text-zinc-500 flex flex-col items-center gap-2">
                <ShieldCheck className="w-8 h-8 text-emerald-500 opacity-60" />
                No rule violations detected for this competitor.
              </div>
            ) : (
              <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
                {findings.map((f) => (
                  <div key={f.id} className="p-3 bg-zinc-950 border border-zinc-800 rounded-lg space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        {f.title}
                      </span>
                      <span className="text-xs font-mono font-bold text-red-400">+{f.weight} pts</span>
                    </div>
                    <p className="text-xs text-zinc-400">{f.category}</p>
                    {f.evidence && (
                      <pre className="text-[11px] font-mono bg-zinc-900 p-2 rounded text-zinc-300 overflow-x-auto">
                        {JSON.stringify(f.evidence, null, 2)}
                      </pre>
                    )}
                    <p className="text-[10px] text-zinc-500 text-right">
                      {new Date(f.createdAt).toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

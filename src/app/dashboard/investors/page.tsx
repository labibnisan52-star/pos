"use client";

import React, { useState, useEffect } from "react";
import { Plus, Users, Wallet, ArrowDownRight, ArrowUpRight, Search, Trash2 } from "lucide-react";
import { createClient } from "@/utils/supabase/client";

type Investor = {
  id: string;
  name: string;
  contact: string;
  total_invested: number;
  total_repaid: number;
  balance: number;
};

type Transaction = {
  id: string;
  type: "Investment" | "Repayment";
  amount: number;
  date: string;
  notes: string;
};

export default function InvestorsPage() {
  const supabase = createClient();
  const [investors, setInvestors] = useState<Investor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Modals
  const [showInvestorModal, setShowInvestorModal] = useState(false);
  const [showTxModal, setShowTxModal] = useState(false);
  
  // Forms
  const [investorName, setInvestorName] = useState("");
  const [investorContact, setInvestorContact] = useState("");
  
  const [selectedInvestorId, setSelectedInvestorId] = useState("");
  const [txType, setTxType] = useState<"Investment" | "Repayment">("Investment");
  const [txAmount, setTxAmount] = useState("");
  const [txNotes, setTxNotes] = useState("");

  const fetchInvestors = async () => {
    setLoading(true);
    const { data: invData, error: invError } = await supabase.from("investors").select("*").order("name");
    const { data: txData, error: txError } = await supabase.from("investor_transactions").select("*");
    
    if (invData && !invError) {
      const investorsWithCalc = invData.map((inv: any) => {
        const txs = (txData || []).filter((tx: any) => tx.investor_id === inv.id);
        const invested = txs.filter((tx: any) => tx.type === "Investment").reduce((sum: number, tx: any) => sum + Number(tx.amount), 0);
        const repaid = txs.filter((tx: any) => tx.type === "Repayment").reduce((sum: number, tx: any) => sum + Number(tx.amount), 0);
        
        return {
          ...inv,
          total_invested: invested,
          total_repaid: repaid,
          balance: invested - repaid
        };
      });
      setInvestors(investorsWithCalc);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchInvestors();
  }, [supabase]);

  const handleAddInvestor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!investorName.trim()) return;
    
    const { error } = await supabase.from("investors").insert([{
      name: investorName,
      contact: investorContact
    }]);

    if (!error) {
      setInvestorName("");
      setInvestorContact("");
      setShowInvestorModal(false);
      fetchInvestors();
    }
  };

  const handleAddTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInvestorId || !txAmount || Number(txAmount) <= 0) return;

    const { error } = await supabase.from("investor_transactions").insert([{
      investor_id: selectedInvestorId,
      type: txType,
      amount: Number(txAmount),
      notes: txNotes
    }]);

    if (!error) {
      setSelectedInvestorId("");
      setTxAmount("");
      setTxNotes("");
      setShowTxModal(false);
      fetchInvestors();
    }
  };

  const totalDebt = investors.reduce((sum, inv) => sum + inv.balance, 0);
  const totalInvested = investors.reduce((sum, inv) => sum + inv.total_invested, 0);

  const filteredInvestors = investors.filter(inv => inv.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="flex-1 h-full overflow-y-auto bg-[#faf9f6] p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Investors & Debt</h1>
          <p className="text-sm text-gray-500 font-medium">Manage your investors and track the debt you owe them.</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setShowTxModal(true)}
            className="px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-xl text-sm font-bold hover:bg-gray-50 transition-colors flex items-center gap-2"
          >
            <Wallet className="w-4 h-4" /> Log Transaction
          </button>
          <button
            onClick={() => setShowInvestorModal(true)}
            className="px-4 py-2 bg-gray-900 text-white rounded-xl text-sm font-bold hover:bg-gray-700 transition-colors flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> Add Investor
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 bg-gray-100 text-gray-900 rounded-xl flex items-center justify-center">
            <ArrowDownRight className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-bold text-gray-400 uppercase">Total Received</p>
            <p className="text-3xl font-black text-gray-900">৳ {totalInvested.toLocaleString()}</p>
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 bg-red-50 text-red-600 rounded-xl flex items-center justify-center">
            <Wallet className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-bold text-red-400 uppercase">Total Current Debt</p>
            <p className="text-3xl font-black text-red-600">৳ {totalDebt.toLocaleString()}</p>
          </div>
        </div>
      </div>

      {/* Table Section */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <div className="relative w-64">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search investors..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-gray-50 border-transparent rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 text-xs font-bold text-gray-400 uppercase tracking-wider">
                <th className="p-4 pl-6 border-b border-gray-100">Investor Name</th>
                <th className="p-4 border-b border-gray-100">Contact</th>
                <th className="p-4 border-b border-gray-100 text-right">Total Invested</th>
                <th className="p-4 border-b border-gray-100 text-right">Total Repaid</th>
                <th className="p-4 pr-6 border-b border-gray-100 text-right text-gray-900">Current Debt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 text-sm font-medium text-gray-900">
              {loading ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-gray-400">Loading investors...</td>
                </tr>
              ) : filteredInvestors.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-gray-400">No investors found.</td>
                </tr>
              ) : (
                filteredInvestors.map((inv) => (
                  <tr key={inv.id} className="hover:bg-gray-50 transition-colors">
                    <td className="p-4 pl-6 font-bold">{inv.name}</td>
                    <td className="p-4 text-gray-500">{inv.contact || "-"}</td>
                    <td className="p-4 text-right text-gray-600">৳ {inv.total_invested.toLocaleString()}</td>
                    <td className="p-4 text-right text-green-600">৳ {inv.total_repaid.toLocaleString()}</td>
                    <td className="p-4 pr-6 text-right font-black text-red-600">৳ {inv.balance.toLocaleString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* --- Modals --- */}
      {showInvestorModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-md p-6">
            <h2 className="text-xl font-black text-gray-900 mb-6">Add New Investor</h2>
            <form onSubmit={handleAddInvestor} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Name</label>
                <input
                  required
                  value={investorName}
                  onChange={e => setInvestorName(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-gray-900"
                  placeholder="John Doe"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Contact / Phone</label>
                <input
                  value={investorContact}
                  onChange={e => setInvestorContact(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-gray-900"
                  placeholder="+880..."
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setShowInvestorModal(false)} className="flex-1 py-3 border border-gray-200 rounded-xl font-bold text-gray-600 hover:bg-gray-50">Cancel</button>
                <button type="submit" className="flex-1 py-3 bg-gray-900 text-white rounded-xl font-bold hover:bg-gray-800">Add Investor</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showTxModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-md p-6">
            <h2 className="text-xl font-black text-gray-900 mb-6">Log Transaction</h2>
            <form onSubmit={handleAddTransaction} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Investor</label>
                <select
                  required
                  value={selectedInvestorId}
                  onChange={e => setSelectedInvestorId(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-gray-900"
                >
                  <option value="" disabled>Select an investor</option>
                  {investors.map(inv => (
                    <option key={inv.id} value={inv.id}>{inv.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Transaction Type</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setTxType("Investment")}
                    className={`flex-1 py-2 rounded-lg text-sm font-bold transition-colors ${txType === "Investment" ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}
                  >
                    Receive (Investment)
                  </button>
                  <button
                    type="button"
                    onClick={() => setTxType("Repayment")}
                    className={`flex-1 py-2 rounded-lg text-sm font-bold transition-colors ${txType === "Repayment" ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}
                  >
                    Pay Back (Repayment)
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Amount (৳)</label>
                <input
                  required
                  type="number"
                  min="0"
                  value={txAmount}
                  onChange={e => setTxAmount(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-gray-900"
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Notes</label>
                <input
                  value={txNotes}
                  onChange={e => setTxNotes(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-gray-900"
                  placeholder="Optional details..."
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setShowTxModal(false)} className="flex-1 py-3 border border-gray-200 rounded-xl font-bold text-gray-600 hover:bg-gray-50">Cancel</button>
                <button type="submit" className="flex-1 py-3 bg-gray-900 text-white rounded-xl font-bold hover:bg-gray-800">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

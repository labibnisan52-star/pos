"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Plus, Wallet, ArrowDownRight, Search, X } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { formatBDT, parseNumericInput, roundMoney } from "@/lib/calculations";

type Investor = {
  id: string;
  name: string;
  contact: string;
  total_invested: number;
  total_repaid: number;
  balance: number;
};

export default function InvestorsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [investors, setInvestors] = useState<Investor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [showInvestorModal, setShowInvestorModal] = useState(false);
  const [showTxModal, setShowTxModal] = useState(false);

  const [investorName, setInvestorName] = useState("");
  const [investorContact, setInvestorContact] = useState("");

  const [selectedInvestorId, setSelectedInvestorId] = useState("");
  const [txType, setTxType] = useState<"Investment" | "Repayment">(
    "Investment"
  );
  const [txAmount, setTxAmount] = useState("");
  const [txNotes, setTxNotes] = useState("");

  const fetchInvestors = useCallback(async () => {
    setLoading(true);
    const [invRes, txRes] = await Promise.all([
      supabase.from("investors").select("*").order("name"),
      supabase.from("investor_transactions").select("*"),
    ]);

    if (invRes.data && !invRes.error) {
      const txList = txRes.data || [];
      const investorsWithCalc = invRes.data.map(
        (inv: { id: string; name: string; contact: string }) => {
          const txs = txList.filter(
            (tx: { investor_id: string }) => tx.investor_id === inv.id
          );
          const invested = roundMoney(
            txs
              .filter((tx: { type: string }) => tx.type === "Investment")
              .reduce(
                (sum: number, tx: { amount: number }) =>
                  sum + (Number(tx.amount) || 0),
                0
              )
          );
          const repaid = roundMoney(
            txs
              .filter((tx: { type: string }) => tx.type === "Repayment")
              .reduce(
                (sum: number, tx: { amount: number }) =>
                  sum + (Number(tx.amount) || 0),
                0
              )
          );

          return {
            ...inv,
            total_invested: invested,
            total_repaid: repaid,
            balance: roundMoney(invested - repaid),
          };
        }
      );
      setInvestors(investorsWithCalc);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchInvestors();
  }, [fetchInvestors]);

  const handleAddInvestor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!investorName.trim()) return;

    const { error } = await supabase.from("investors").insert([
      {
        name: investorName.trim(),
        contact: investorContact.trim(),
      },
    ]);

    if (!error) {
      setInvestorName("");
      setInvestorContact("");
      setShowInvestorModal(false);
      fetchInvestors();
    }
  };

  const handleAddTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseNumericInput(txAmount);
    if (!selectedInvestorId || !parsed.isValid || parsed.value <= 0) return;

    const { error } = await supabase.from("investor_transactions").insert([
      {
        investor_id: selectedInvestorId,
        type: txType,
        amount: roundMoney(parsed.value),
        notes: txNotes.trim(),
      },
    ]);

    if (!error) {
      setSelectedInvestorId("");
      setTxAmount("");
      setTxNotes("");
      setShowTxModal(false);
      fetchInvestors();
    }
  };

  const totalDebt = roundMoney(
    investors.reduce((sum, inv) => sum + inv.balance, 0)
  );
  const totalInvested = roundMoney(
    investors.reduce((sum, inv) => sum + inv.total_invested, 0)
  );

  const filteredInvestors = investors.filter((inv) =>
    inv.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex-1 h-full overflow-y-auto bg-[#faf9f6] p-4 sm:p-6 lg:p-8 no-scrollbar">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-gray-900">
            Investors &amp; Capital
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 font-medium mt-0.5">
            Track investor contributions and repayments
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setShowTxModal(true)}
            disabled={investors.length === 0}
            className="min-h-[44px] px-4 py-2 bg-white border border-gray-200 text-gray-800 rounded-xl text-xs sm:text-sm font-bold hover:bg-gray-50 transition-colors flex items-center gap-2 disabled:opacity-40"
          >
            <Wallet className="w-4 h-4" />
            <span>Log Transaction</span>
          </button>
          <button
            type="button"
            onClick={() => setShowInvestorModal(true)}
            className="min-h-[44px] px-4 py-2 bg-black text-white rounded-xl text-xs sm:text-sm font-bold hover:bg-gray-800 transition-colors flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>Add Investor</span>
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <div className="bg-white p-5 rounded-2xl border border-gray-200/80 flex items-center gap-4">
          <div className="w-12 h-12 bg-gray-100 text-gray-900 rounded-xl flex items-center justify-center shrink-0">
            <ArrowDownRight className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-gray-400 uppercase">
              Total Received
            </p>
            <p className="text-2xl sm:text-3xl font-black text-gray-900 truncate">
              ৳{formatBDT(totalInvested)}
            </p>
          </div>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-gray-200/80 flex items-center gap-4">
          <div className="w-12 h-12 bg-red-50 text-red-600 rounded-xl flex items-center justify-center shrink-0">
            <Wallet className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-red-400 uppercase">
              Current Balance Owed
            </p>
            <p className="text-2xl sm:text-3xl font-black text-red-600 truncate">
              ৳{formatBDT(totalDebt)}
            </p>
          </div>
        </div>
      </div>

      {/* Main List / Table */}
      <div className="bg-white rounded-2xl border border-gray-200/80 overflow-hidden">
        <div className="p-4 border-b border-gray-100">
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search investors..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full min-h-[44px] pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:bg-white focus:border-gray-900"
            />
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-sm text-gray-400">
            Loading investors...
          </div>
        ) : filteredInvestors.length === 0 ? (
          <div className="p-14 text-center text-sm text-gray-400">
            No investors added yet.
          </div>
        ) : (
          <>
            <div className="md:hidden divide-y divide-gray-100">
              {filteredInvestors.map((inv) => (
                <div key={inv.id} className="p-4 space-y-2">
                  <div className="flex justify-between items-start gap-2">
                    <div>
                      <p className="text-sm font-bold text-gray-900">
                        {inv.name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {inv.contact || "No contact"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-400">Balance Owed</p>
                      <p className="text-sm font-black text-red-600">
                        ৳{formatBDT(inv.balance)}
                      </p>
                    </div>
                  </div>
                  <div className="flex justify-between text-xs text-gray-600 pt-1">
                    <span>Invested: ৳{formatBDT(inv.total_invested)}</span>
                    <span className="text-emerald-700">
                      Repaid: ৳{formatBDT(inv.total_repaid)}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50 text-xs font-bold text-gray-400 uppercase tracking-wider">
                    <th className="p-4 pl-6 border-b border-gray-100">
                      Investor Name
                    </th>
                    <th className="p-4 border-b border-gray-100">Contact</th>
                    <th className="p-4 border-b border-gray-100 text-right">
                      Invested
                    </th>
                    <th className="p-4 border-b border-gray-100 text-right">
                      Repaid
                    </th>
                    <th className="p-4 pr-6 border-b border-gray-100 text-right text-gray-900">
                      Current Balance
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 text-sm font-medium text-gray-900">
                  {filteredInvestors.map((inv) => (
                    <tr
                      key={inv.id}
                      className="hover:bg-gray-50 transition-colors"
                    >
                      <td className="p-4 pl-6 font-bold">{inv.name}</td>
                      <td className="p-4 text-gray-500">
                        {inv.contact || "—"}
                      </td>
                      <td className="p-4 text-right text-gray-700 whitespace-nowrap">
                        ৳{formatBDT(inv.total_invested)}
                      </td>
                      <td className="p-4 text-right text-emerald-700 whitespace-nowrap">
                        ৳{formatBDT(inv.total_repaid)}
                      </td>
                      <td className="p-4 pr-6 text-right font-black text-red-600 whitespace-nowrap">
                        ৳{formatBDT(inv.balance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Add Investor Modal */}
      {showInvestorModal && (
        <div className="fixed inset-0 bg-black/45 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-lg font-black text-gray-900">
                Add New Investor
              </h2>
              <button
                type="button"
                onClick={() => setShowInvestorModal(false)}
                className="w-10 h-10 flex items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAddInvestor} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">
                  Full Name
                </label>
                <input
                  required
                  type="text"
                  value={investorName}
                  onChange={(e) => setInvestorName(e.target.value)}
                  placeholder="Enter investor name"
                  className="w-full min-h-[46px] bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-gray-900"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">
                  Contact / Phone
                </label>
                <input
                  type="tel"
                  inputMode="tel"
                  value={investorContact}
                  onChange={(e) => setInvestorContact(e.target.value)}
                  placeholder="01XXXXXXXXX"
                  className="w-full min-h-[46px] bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-gray-900"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowInvestorModal(false)}
                  className="flex-1 min-h-[46px] py-2.5 border border-gray-200 rounded-xl font-bold text-gray-700 hover:bg-gray-50 text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 min-h-[46px] py-2.5 bg-black text-white rounded-xl font-bold hover:bg-gray-800 text-sm"
                >
                  Add Investor
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Log Transaction Modal */}
      {showTxModal && (
        <div className="fixed inset-0 bg-black/45 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-lg font-black text-gray-900">
                Log Investor Transaction
              </h2>
              <button
                type="button"
                onClick={() => setShowTxModal(false)}
                className="w-10 h-10 flex items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAddTransaction} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">
                  Investor
                </label>
                <select
                  required
                  value={selectedInvestorId}
                  onChange={(e) => setSelectedInvestorId(e.target.value)}
                  className="w-full min-h-[46px] bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-gray-900"
                >
                  <option value="" disabled>
                    Select an investor...
                  </option>
                  {investors.map((inv) => (
                    <option key={inv.id} value={inv.id}>
                      {inv.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">
                  Transaction Type
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setTxType("Investment")}
                    className={`min-h-[44px] py-2 rounded-xl text-xs font-bold transition-colors ${
                      txType === "Investment"
                        ? "bg-black text-white"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    Receive Capital
                  </button>
                  <button
                    type="button"
                    onClick={() => setTxType("Repayment")}
                    className={`min-h-[44px] py-2 rounded-xl text-xs font-bold transition-colors ${
                      txType === "Repayment"
                        ? "bg-black text-white"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    Repayment
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">
                  Amount (৳)
                </label>
                <input
                  required
                  type="text"
                  inputMode="decimal"
                  value={txAmount}
                  onChange={(e) => setTxAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full min-h-[46px] bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-gray-900"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">
                  Notes
                </label>
                <input
                  type="text"
                  value={txNotes}
                  onChange={(e) => setTxNotes(e.target.value)}
                  placeholder="Optional reference..."
                  className="w-full min-h-[46px] bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-gray-900"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowTxModal(false)}
                  className="flex-1 min-h-[46px] py-2.5 border border-gray-200 rounded-xl font-bold text-gray-700 hover:bg-gray-50 text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 min-h-[46px] py-2.5 bg-black text-white rounded-xl font-bold hover:bg-gray-800 text-sm"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useAuth } from "@/components/providers/AuthProvider";
import type { Account, CurrencyType } from "@fintech/shared-types";

interface TransferFormProps {
  accounts: Account[];
  balances: Record<string, number>;
}

export function TransferForm({ accounts, balances }: TransferFormProps) {
  const { initiateTransfer } = useAuth();
  const [fromAccountId, setFromAccountId] = useState("");
  const [toAccountId, setToAccountId] = useState("");
  const [amountStr, setAmountStr] = useState("");
  const [currency, setCurrency] = useState<CurrencyType>("INR");
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);

  const activeAccounts = accounts.filter((a: Account) => a.status === "ACTIVE");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    if (!fromAccountId || !toAccountId || !amountStr) {
      setFeedback({ type: "error", text: "All fields are required." });
      return;
    }

    if (fromAccountId === toAccountId) {
      setFeedback({ type: "error", text: "Source and destination accounts must be different." });
      return;
    }

    const amountVal = parseFloat(amountStr);
    if (isNaN(amountVal) || amountVal <= 0) {
      setFeedback({ type: "error", text: "Please enter a valid transfer amount." });
      return;
    }

    const fromAccount = accounts.find((a) => a.id === fromAccountId);
    if (!fromAccount) {
      setFeedback({ type: "error", text: "Source account not found." });
      return;
    }

    const currentBalance = balances[fromAccountId] || 0;
    if (currentBalance < amountVal) {
      setFeedback({ type: "error", text: "Insufficient funds in the source account." });
      return;
    }

    setLoading(true);

    try {
      await initiateTransfer(fromAccountId, toAccountId, amountVal, currency);
      setAmountStr("");
      setFeedback({
        type: "success",
        text: `Transfer of ${amountVal} ${currency} completed successfully.`
      });
    } catch (err: any) {
      setFeedback({ type: "error", text: err?.message || "Transfer initiation failed." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {feedback && (
        <div
          className={`p-3 text-xs border ${
            feedback.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : feedback.type === "info"
              ? "border-blue-200 bg-blue-50 text-blue-800"
              : "border-red-200 bg-red-50 text-red-800"
          }`}
        >
          {feedback.text}
        </div>
      )}

      {/* From Account Select */}
      <div className="flex flex-col space-y-1.5 w-full">
        <label className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Sender Account (Source)
        </label>
        <select
          value={fromAccountId}
          onChange={(e) => {
            setFromAccountId(e.target.value);
            const acc = accounts.find((a: Account) => a.id === e.target.value);
            if (acc) setCurrency(acc.currency);
          }}
          disabled={loading}
          required
          className="swiss-input w-full px-3 py-2 text-sm text-foreground bg-transparent border-zinc-200 focus:border-foreground"
        >
          <option value="">-- Choose Account --</option>
          {activeAccounts.map((a: Account) => (
            <option key={a.id} value={a.id}>
              {a.type} ({a.id.slice(-6)}) — {balances[a.id] || 0} {a.currency}
            </option>
          ))}
        </select>
      </div>

      {/* Target Account ID */}
      <div className="flex flex-col space-y-1.5 w-full">
        <label className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Recipient Account ID (Destination)
        </label>
        <div className="flex gap-2">
          <Input
            placeholder="e.g. acc_savings_inr_001"
            value={toAccountId}
            onChange={(e) => setToAccountId(e.target.value)}
            disabled={loading}
            required
            className="flex-1"
          />
          <select
            onChange={(e) => setToAccountId(e.target.value)}
            disabled={loading}
            className="swiss-input px-2 text-xs text-zinc-500 bg-transparent border-zinc-200 focus:border-foreground"
            defaultValue=""
          >
            <option value="">Quick Select</option>
            {accounts.map((a: Account) => (
              <option key={a.id} value={a.id}>
                {a.type.slice(0, 4)} ({a.id.slice(-6)}) - {a.status}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Currency & Amount */}
      <div className="grid grid-cols-3 gap-4">
        <div className="flex flex-col space-y-1.5 w-full col-span-1">
          <label className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Currency
          </label>
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value as CurrencyType)}
            disabled={true}
            className="swiss-input w-full px-3 py-2 text-sm text-foreground bg-transparent border-zinc-200 disabled:opacity-70"
          >
            <option value="INR">INR (₹)</option>
            <option value="USD">USD ($)</option>
            <option value="EUR">EUR (€)</option>
          </select>
        </div>
        <div className="col-span-2">
          <Input
            label="Amount (in Rupees)"
            type="number"
            step="0.01"
            min="0.01"
            placeholder="0.00"
            value={amountStr}
            onChange={(e) => setAmountStr(e.target.value)}
            disabled={loading}
            required
          />
        </div>
      </div>

      <p className="text-[10px] text-zinc-400 leading-normal">
        * In production, high-value transfers or transactions initiated by accounts under `MAKER` status automatically trigger the dual-control maker-checker pipeline.
      </p>

      <Button
        type="submit"
        className="w-full"
        variant="primary"
        disabled={loading}
      >
        {loading ? "Processing..." : "Submit Transaction"}
      </Button>
    </form>
  );
}

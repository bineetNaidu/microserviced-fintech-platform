"use client";

import React, { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { useAuth } from "@/components/providers/AuthProvider";
import type { Account, AccountType, CurrencyType } from "@fintech/shared-types";

export default function AccountsPage() {
  const { user, accounts, balances, createAccount } = useAuth();
  
  const [accountType, setAccountType] = useState<AccountType>("SAVINGS");
  const [currency, setCurrency] = useState<CurrencyType>("INR");
  const [feedback, setFeedback] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);
  const [loading, setLoading] = useState(false);

  // Enforce KYC verification gate
  const isUnlocked = user && (user.role === "CHECKER" || user.kycStatus === "APPROVED" || user.kycStatus === "VERIFIED");

  if (!isUnlocked) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <span className="text-3xl mb-4">🔒</span>
        <h2 className="text-lg font-semibold text-zinc-800 uppercase tracking-wider mb-2">Access Restrained</h2>
        <p className="text-xs text-zinc-500 max-w-sm">
          Please complete your Profile Setup and KYC onboarding to unlock accounts and banking capabilities.
        </p>
      </div>
    );
  }

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    setLoading(true);

    try {
      await createAccount(accountType, currency);
      setFeedback({
        type: "success",
        text: `Successfully provisioned a new ${accountType} account in ${currency}.`
      });
    } catch (err: any) {
      setFeedback({ type: "error", text: err?.message || "Account provisioning failed." });
    } finally {
      setLoading(false);
    }
  };

  const getAccountStatusVariant = (status: string) => {
    switch (status) {
      case "ACTIVE": return "success";
      case "FROZEN": return "warning";
      case "CLOSED": return "error";
      default: return "neutral";
    }
  };

  const formatRupees = (amount: number) => {
    return amount.toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  };

  return (
    <div className="space-y-8">
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Provision Form */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-zinc-500">
                New Account Provisioning
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreateAccount} className="space-y-4">
                <div className="flex flex-col space-y-1.5 w-full">
                  <label className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                    Account Classification
                  </label>
                  <select
                    value={accountType}
                    onChange={(e) => setAccountType(e.target.value as AccountType)}
                    className="swiss-input w-full px-3 py-2 text-sm text-foreground bg-transparent border-zinc-200 focus:border-foreground"
                  >
                    <option value="SAVINGS">Savings Account</option>
                    <option value="CHECKING">Checking Account</option>
                  </select>
                </div>

                <div className="flex flex-col space-y-1.5 w-full">
                  <label className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                    Currency Selection
                  </label>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value as CurrencyType)}
                    className="swiss-input w-full px-3 py-2 text-sm text-foreground bg-transparent border-zinc-200 focus:border-foreground"
                  >
                    <option value="INR">INR (₹)</option>
                    <option value="USD">USD ($)</option>
                    <option value="EUR">EUR (€)</option>
                  </select>
                </div>

                <Button
                  type="submit"
                  className="w-full mt-2"
                  variant="primary"
                  disabled={loading}
                >
                  {loading ? "Provisioning..." : "Open Account"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Accounts Registry List */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-zinc-500">
                Accounts Ledger Registry
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="divide-y divide-zinc-150">
                {accounts.length === 0 ? (
                  <div className="text-center py-12 text-xs text-zinc-400 uppercase tracking-wider">
                    No accounts currently registered to this identity.
                  </div>
                ) : (
                  accounts.map((acc: Account) => {
                    const balanceVal = balances[acc.id] || 0;
                    return (
                      <div
                        key={acc.id}
                        className="py-4 first:pt-0 last:pb-0 flex flex-col md:flex-row md:items-center md:justify-between gap-4"
                      >
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-3">
                            <span className="text-xs uppercase font-bold text-zinc-800">
                              {acc.type}
                            </span>
                            <Badge variant={getAccountStatusVariant(acc.status)}>
                              {acc.status}
                            </Badge>
                          </div>
                          <div className="text-[10px] font-mono text-zinc-400">
                            ID: <span className="select-all font-semibold">{acc.id}</span>
                          </div>
                          <div className="text-[10px] text-zinc-500 uppercase">
                            Opened: {new Date(acc.createdAt).toLocaleDateString()}
                          </div>
                        </div>

                        <div className="flex items-center justify-between md:justify-end gap-6">
                          <div className="text-right">
                            <div className="text-sm font-semibold ledger-number text-zinc-950">
                              {acc.currency === "USD" ? "$" : acc.currency === "EUR" ? "€" : "₹"}
                              {formatRupees(balanceVal)}
                            </div>
                            <span className="text-[9px] uppercase text-zinc-400 font-mono">
                              {acc.currency}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </CardContent>
          </Card>
        </div>

      </div>
    </div>
  );
}

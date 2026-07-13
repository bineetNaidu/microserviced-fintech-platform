"use client";

import React from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import { StatsGrid } from "@/components/dashboard/StatsGrid";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ProfileSetupForm } from "@/components/dashboard/ProfileSetupForm";
import { KycSubmissionForm } from "@/components/dashboard/KycSubmissionForm";
import { KycPendingView } from "@/components/dashboard/KycPendingView";
import type { Account, Transfer } from "@fintech/shared-types";

export default function DashboardOverview() {
  const { user, accounts, balances, transfers, approvals } = useAuth();

  const formatRupees = (amount: number) => {
    return amount.toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  };

  const getStatusVariant = (status: string) => {
    switch (status) {
      case "COMPLETED": return "success";
      case "PENDING": return "warning";
      case "FAILED": return "error";
      case "REVERSED": return "error";
      default: return "neutral";
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

  // ─── ONBOARDING GATING RENDERERS ───

  // 1. If profile metadata is not created yet
  if (user && (!user.firstName || !user.lastName)) {
    return (
      <div className="py-10">
        <ProfileSetupForm />
      </div>
    );
  }

  // 2. If profile exists, check KYC progression
  if (user && (user.kycStatus === "PENDING" || user.kycStatus === "REJECTED")) {
    return (
      <div className="py-10">
        <KycSubmissionForm />
      </div>
    );
  }

  // 3. If KYC submitted, lock dashboard with review screen
  if (user && user.kycStatus === "SUBMITTED") {
    return (
      <div className="py-10">
        <KycPendingView />
      </div>
    );
  }

  // 4. Happy Path: Fully verified (APPROVED / VERIFIED) user view
  return (
    <div className="space-y-8">
      {/* Metrics Grid */}
      <StatsGrid
        accounts={accounts}
        balances={balances}
        approvals={approvals}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* Accounts Repository Panel */}
        <div className="lg:col-span-1 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-zinc-500">
                Accounts Repository
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {accounts.length === 0 ? (
                <div className="text-center py-6 text-xs text-zinc-400 uppercase tracking-wider">
                  No accounts linked to identity.
                </div>
              ) : (
                accounts.map((acc: Account) => (
                  <div
                    key={acc.id}
                    className="flex items-center justify-between p-3 border border-zinc-150 bg-white"
                  >
                    <div className="space-y-1">
                      <div className="text-xs uppercase font-bold text-zinc-800">
                        {acc.type}
                      </div>
                      <div className="text-[10px] font-mono text-zinc-400">
                        ID: {acc.id}
                      </div>
                    </div>
                    <div className="text-right space-y-1.5">
                      <div className="text-sm font-semibold ledger-number">
                        {acc.currency === "USD" ? "$" : acc.currency === "EUR" ? "€" : "₹"}
                        {formatRupees(balances[acc.id] || 0)}
                      </div>
                      <Badge variant={getAccountStatusVariant(acc.status)}>
                        {acc.status}
                      </Badge>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        {/* Recent Transactions List */}
        <div className="lg:col-span-2">
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-zinc-500">
                Recent Transaction History
              </CardTitle>
            </CardHeader>
            <CardContent>
              {transfers.length === 0 ? (
                <div className="text-center py-12 text-xs text-zinc-400 uppercase tracking-wider">
                  No records exist in ledger database.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-zinc-200 text-[10px] uppercase tracking-wider text-zinc-400">
                        <th className="py-3 font-semibold">Transaction ID</th>
                        <th className="py-3 font-semibold">Route</th>
                        <th className="py-3 font-semibold">Amount (Rupees)</th>
                        <th className="py-3 font-semibold">Status</th>
                        <th className="py-3 font-semibold text-right">Settled At</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {transfers.slice(0, 8).map((t: Transfer) => (
                        <tr key={t.id} className="text-xs">
                          <td className="py-3 font-mono text-zinc-500">
                            {t.id.slice(0, 10)}...
                          </td>
                          <td className="py-3">
                            <div className="flex flex-col">
                              <span className="text-zinc-400 text-[9px] uppercase">
                                FROM: {t.fromAccountId}
                              </span>
                              <span className="text-zinc-400 text-[9px] uppercase">
                                TO: {t.toAccountId}
                              </span>
                            </div>
                          </td>
                          <td className="py-3 font-semibold ledger-number">
                            {t.currency === "USD" ? "$" : t.currency === "EUR" ? "€" : "₹"}
                            {formatRupees(Number(t.amountPaise) / 100)}
                          </td>
                          <td className="py-3">
                            <Badge variant={getStatusVariant(t.status)}>
                              {t.status}
                            </Badge>
                          </td>
                          <td className="py-3 text-right text-zinc-400 font-mono text-[10px]">
                            {new Date(t.updatedAt).toLocaleTimeString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

      </div>
    </div>
  );
}

"use client";

import React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { TransferForm } from "@/components/dashboard/TransferForm";
import { useAuth } from "@/components/providers/AuthProvider";
import type { Transfer } from "@fintech/shared-types";

export default function TransfersPage() {
  const { user, transfers, accounts, balances } = useAuth();

  // Enforce KYC verification gate
  const isUnlocked = user && (user.role === "CHECKER" || user.kycStatus === "APPROVED" || user.kycStatus === "VERIFIED");

  if (!isUnlocked) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <span className="text-3xl mb-4">🔒</span>
        <h2 className="text-lg font-semibold text-zinc-800 uppercase tracking-wider mb-2">Access Restrained</h2>
        <p className="text-xs text-zinc-500 max-w-sm">
          Please complete your Profile Setup and KYC onboarding to unlock transfers and banking capabilities.
        </p>
      </div>
    );
  }

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
      case "DEBITING":
      case "CREDITING": return "info";
      case "FAILED": return "error";
      case "REVERSED": return "error";
      default: return "neutral";
    }
  };

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Transfer Form Box */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-zinc-500">
                Initiate Ledger Transfer
              </CardTitle>
            </CardHeader>
            <CardContent>
              {accounts.length === 0 ? (
                <div className="text-xs text-zinc-400 uppercase tracking-wider py-4 text-center">
                  You must open an account in the Accounts tab before initiating transfers.
                </div>
              ) : (
                <TransferForm
                  accounts={accounts}
                  balances={balances}
                />
              )}
            </CardContent>
          </Card>
        </div>

        {/* Transaction History Log */}
        <div className="lg:col-span-2">
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-zinc-500">
                Ledger Transaction Log
              </CardTitle>
            </CardHeader>
            <CardContent>
              {transfers.length === 0 ? (
                <div className="text-center py-12 text-xs text-zinc-400 uppercase tracking-wider">
                  No records exist in transfer database.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-zinc-200 text-[10px] uppercase tracking-wider text-zinc-400">
                        <th className="py-3 font-semibold">Transfer ID</th>
                        <th className="py-3 font-semibold">From Account</th>
                        <th className="py-3 font-semibold">To Account</th>
                        <th className="py-3 font-semibold">Volume (Rupees)</th>
                        <th className="py-3 font-semibold">Status</th>
                        <th className="py-3 font-semibold text-right">Updated</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {transfers.map((t: Transfer) => (
                        <tr key={t.id} className="text-xs">
                          <td className="py-3 font-mono text-zinc-500 select-all">
                            {t.id.slice(0, 12)}...
                          </td>
                          <td className="py-3 font-mono text-zinc-600">
                            {t.fromAccountId}
                          </td>
                          <td className="py-3 font-mono text-zinc-600">
                            {t.toAccountId}
                          </td>
                          <td className="py-3 font-semibold ledger-number text-zinc-950">
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

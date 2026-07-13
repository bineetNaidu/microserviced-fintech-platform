"use client";

import React from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";

export function KycPendingView() {
  return (
    <Card className="w-full max-w-lg mx-auto border border-zinc-200 bg-white p-8 shadow-sm text-center">
      <CardHeader className="space-y-4 mb-6">
        <div className="mx-auto w-12 h-12 rounded-none border border-zinc-950 flex items-center justify-center text-xl font-bold animate-pulse">
          ⏳
        </div>
        <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider block">
          Compliance Review Queue
        </span>
        <CardTitle className="text-xl font-semibold">
          Identity Verification Processing
        </CardTitle>
        <CardDescription>
          Your personal profile and KYC credentials have been logged. Downstream accounts and ledger capabilities are currently locked pending a compliance review audit.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6 text-xs text-zinc-500 leading-normal">
        <p>
          Standard regulatory verification sweeps typically take under 24 hours. Once a compliance officer validates your document submittals, a default <strong>Savings Account (INR)</strong> will automatically provision for you.
        </p>

        {/* Sandbox Dev Box */}
        <div className="text-left bg-zinc-50 border border-zinc-250 p-4 space-y-2 mt-4 text-[11px]">
          <span className="font-bold text-zinc-800 uppercase block tracking-wider">
            🛠️ Developer Sandbox Helper
          </span>
          <p>
            Since the compliance microservice bounds are mock-simulated on your local machine, you can approve this KYC request yourself by running the manual review flow:
          </p>
          <ol className="list-decimal pl-4 space-y-1.5 mt-2 font-mono text-zinc-600">
            <li>Click "Sign Out" in the sidebar</li>
            <li>Register or sign in with role <strong>CHECKER</strong> (e.g. email <code>checker@fintech.com</code>)</li>
            <li>Go to the <strong>Approvals</strong> page</li>
            <li>Locate the KYC ticket for your account and click <strong>Approve</strong></li>
            <li>Log back in with your client account to unlock your new portfolio</li>
          </ol>
        </div>
      </CardContent>
    </Card>
  );
}

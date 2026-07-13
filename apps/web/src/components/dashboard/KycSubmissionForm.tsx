"use client";

import React, { useState } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export function KycSubmissionForm() {
  const { submitKyc, user } = useAuth();
  const [docType, setDocType] = useState("pan");
  const [docNumber, setDocNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!docNumber.trim()) {
      setError("Document identification number is required.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await submitKyc(docType, docNumber.trim());
    } catch (err: any) {
      setError(err?.message || "KYC submission failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-lg mx-auto border border-zinc-200 bg-white p-8 shadow-sm">
      <CardHeader className="space-y-2 mb-6">
        <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">
          Step 2: Know Your Customer (KYC)
        </span>
        <CardTitle className="text-xl font-semibold">
          Submit Identity Documents
        </CardTitle>
        <CardDescription>
          To unlock financial ledger actions, regulatory compliance mandates verification of your legal entity credentials.
        </CardDescription>
      </CardHeader>

      <CardContent>
        {error && (
          <div className="p-3 text-xs border border-red-200 bg-red-50 text-red-700 mb-6">
            {error}
          </div>
        )}

        {user?.kycStatus === "REJECTED" && (
          <div className="p-3 text-xs border border-red-200 bg-red-50 text-red-800 mb-6 leading-normal">
            <strong>⚠️ PREVIOUS SUBMISSION REJECTED:</strong> Re-submit updated credentials for review.
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="flex flex-col space-y-1.5 w-full">
            <label className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Government-Issued Document Type
            </label>
            <select
              value={docType}
              onChange={(e) => setDocType(e.target.value)}
              disabled={loading}
              className="swiss-input w-full px-3 py-2 text-sm text-foreground bg-transparent border-zinc-200 focus:border-foreground"
            >
              <option value="aadhaar">Aadhaar Card (India UID)</option>
              <option value="pan">Permanent Account Number (PAN Card)</option>
              <option value="passport">International Passport Book</option>
              <option value="driving_licence">State Driving Licence</option>
            </select>
          </div>

          <Input
            label="Document ID Number"
            placeholder={
              docType === "pan"
                ? "e.g. ABCDE1234F"
                : docType === "aadhaar"
                ? "e.g. 1234-5678-9012"
                : "Enter ID number string"
            }
            value={docNumber}
            onChange={(e) => setDocNumber(e.target.value)}
            required
            disabled={loading}
          />

          <p className="text-[10px] text-zinc-400 leading-normal">
            * Identity documentation is encrypted and dispatched directly to compliance operations for manual audit reviews. Account creation will auto-trigger on successful validation.
          </p>

          <Button type="submit" variant="primary" className="w-full mt-4" disabled={loading}>
            {loading ? "Submitting Documents..." : "Submit KYC Audit"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/AuthProvider";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export default function RegisterPage() {
  const { register, verifyEmail } = useAuth();
  const router = useRouter();

  // Registration states
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [infoMessage, setInfoMessage] = useState("");

  // Step state: "register" | "verify"
  const [step, setStep] = useState<"register" | "verify">("register");
  const [verificationToken, setVerificationToken] = useState("");

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError("Please fill in all fields.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const { message, verificationToken } = await register(email, password);
      setInfoMessage(message);
      if (verificationToken) {
        setVerificationToken(verificationToken);
      }
      setStep("verify");
    } catch (err: any) {
      setError(err?.message || "Registration failed. Please verify password requirements.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verificationToken) {
      setError("Verification token is required.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const msg = await verifyEmail(verificationToken);
      setInfoMessage(msg + " Redirecting to gateway...");
      setTimeout(() => {
        router.push("/login");
      }, 1500);
    } catch (err: any) {
      setError(err?.message || "Verification failed. Check token validity.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center p-6 bg-zinc-50">
      <Card className="w-full max-w-md border border-zinc-200 bg-white p-8 shadow-sm">
        <CardHeader className="space-y-2 text-center mb-6">
          <CardTitle className="text-2xl font-semibold tracking-tight text-zinc-900">
            {step === "register" ? "Profile Provisioning" : "Activate Security Token"}
          </CardTitle>
          <CardDescription>
            {step === "register"
              ? "Create a credentials profile to log in to the sandbox ledger."
              : "Verify your email to activate transaction permissions."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="p-3 text-xs border border-red-200 bg-red-50 text-red-700 mb-4">
              {error}
            </div>
          )}

          {infoMessage && (
            <div className="p-3 text-xs border border-emerald-200 bg-emerald-50 text-emerald-800 mb-4">
              {infoMessage}
            </div>
          )}

          {step === "register" ? (
            <form onSubmit={handleRegisterSubmit} className="space-y-4">
              <Input
                label="Email Address"
                type="email"
                placeholder="john.doe@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                required
              />

              <div>
                <Input
                  label="Password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  required
                />
                <div className="mt-2 text-[10px] text-zinc-400 space-y-0.5 leading-normal">
                  <p className="font-semibold text-zinc-500 uppercase tracking-wider">Complexity criteria:</p>
                  <ul className="list-disc pl-4 space-y-0.5">
                    <li>Minimum 8 characters length</li>
                    <li>At least one uppercase letter (A-Z)</li>
                    <li>At least one lowercase letter (a-z)</li>
                    <li>At least one number digit (0-9)</li>
                    <li>At least one special character (!@#$ etc)</li>
                  </ul>
                </div>
              </div>

              <Button
                type="submit"
                className="w-full mt-6"
                variant="primary"
                disabled={loading}
              >
                {loading ? "Registering..." : "Create Profile"}
              </Button>

              <div className="mt-6 text-center text-xs text-zinc-500">
                Already registered?{" "}
                <Link href="/login" className="font-semibold underline hover:text-foreground">
                  Sign in to Gateway
                </Link>
              </div>
            </form>
          ) : (
            <form onSubmit={handleVerifySubmit} className="space-y-4">
              <p className="text-xs text-zinc-500 leading-normal">
                An email verification token has been generated. For your convenience, the token has been **automatically retrieved** from the sandbox API and pre-filled below.
              </p>
              
              <Input
                label="Verification Token"
                placeholder="Paste token hash here"
                value={verificationToken}
                onChange={(e) => setVerificationToken(e.target.value)}
                disabled={loading}
                required
              />

              <div className="flex gap-4 mt-6">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={loading}
                  onClick={() => setStep("register")}
                  className="flex-1"
                >
                  Back
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={loading}
                  className="flex-1"
                >
                  {loading ? "Verifying..." : "Verify Token"}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

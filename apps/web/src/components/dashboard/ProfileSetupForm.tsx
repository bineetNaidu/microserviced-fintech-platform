"use client";

import React, { useState } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export function ProfileSetupForm() {
  const { createProfile } = useAuth();
  const [step, setStep] = useState(1);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleNext = (e: React.ChangeEvent) => {
    e.preventDefault();
    setError("");

    if (step === 1) {
      if (!firstName.trim() || !lastName.trim()) {
        setError("Legal first and last names are required.");
        return;
      }
      setStep(2);
    } else if (step === 2) {
      if (!phoneNumber.trim()) {
        setError("Contact phone number is required.");
        return;
      }
      setStep(3);
    }
  };

  const handleBack = () => {
    setError("");
    setStep((prev) => Math.max(1, prev - 1));
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError("");
    try {
      await createProfile(firstName.trim(), lastName.trim(), phoneNumber.trim());
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      setError(err?.message || "Profile creation failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-lg mx-auto border border-zinc-200 bg-white p-8 shadow-sm">
      <CardHeader className="space-y-2 mb-6">
        <div className="flex items-center justify-between text-[10px] uppercase font-bold text-zinc-400 tracking-wider">
          <span>Profile Provisioning</span>
          <span>Step {step} of 3</span>
        </div>

        {/* Progress Bar Line */}
        <div className="w-full h-0.5 bg-zinc-100 mt-2 flex">
          <div className={`h-full bg-zinc-950 transition-all duration-300 ${step === 1 ? "w-1/3" : step === 2 ? "w-2/3" : "w-full"
            }`} />
        </div>

        <CardTitle className="text-xl font-semibold mt-4">
          {step === 1 && "What is your legal name?"}
          {step === 2 && "Configure contact number"}
          {step === 3 && "Confirm identity parameters"}
        </CardTitle>
        <CardDescription>
          {step === 1 && "Enter your full name exactly as it appears on government documents."}
          {step === 2 && "Required for sending multi-factor transfer approval triggers."}
          {step === 3 && "Verify that your profile metadata matches your legal status."}
        </CardDescription>
      </CardHeader>

      <CardContent>
        {error && (
          <div className="p-3 text-xs border border-red-200 bg-red-50 text-red-700 mb-6">
            {error}
          </div>
        )}

        {step === 1 && (
          <form onSubmit={handleNext} className="space-y-4">
            <Input
              label="Legal First Name"
              placeholder="e.g. John"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
              disabled={loading}
            />
            <Input
              label="Legal Last Name"
              placeholder="e.g. Doe"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              required
              disabled={loading}
            />
            <div className="flex justify-end pt-4">
              <Button type="submit" variant="primary">
                Next Step →
              </Button>
            </div>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={handleNext} className="space-y-4">
            <Input
              label="Phone Number"
              placeholder="e.g. +91 98765 43210"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              required
              disabled={loading}
            />
            <div className="flex justify-between pt-4">
              <Button type="button" variant="secondary" onClick={handleBack} disabled={loading}>
                ← Back
              </Button>
              <Button type="submit" variant="primary">
                Next Step →
              </Button>
            </div>
          </form>
        )}

        {step === 3 && (
          <div className="space-y-6">
            <div className="bg-zinc-50 border border-zinc-150 p-4 text-xs space-y-3">
              <div>
                <span className="text-[10px] uppercase text-zinc-400 font-bold block">Legal Name</span>
                <span className="text-zinc-800 font-semibold">{firstName} {lastName}</span>
              </div>
              <div>
                <span className="text-[10px] uppercase text-zinc-400 font-bold block">Phone Contact</span>
                <span className="text-zinc-800 font-semibold">{phoneNumber}</span>
              </div>
            </div>

            <p className="text-[10px] text-zinc-400 leading-normal">
              * By clicking submit, you authorize the platform to write these identity structures to the secure user database. This profile context is immutable once saved.
            </p>

            <div className="flex justify-between pt-4">
              <Button type="button" variant="secondary" onClick={handleBack} disabled={loading}>
                ← Back
              </Button>
              <Button type="button" variant="primary" onClick={handleSubmit} disabled={loading}>
                {loading ? "Saving Profile..." : "Confirm & Save"}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
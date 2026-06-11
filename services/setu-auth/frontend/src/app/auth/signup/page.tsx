"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Heart, User, Loader2 } from "lucide-react";

import { signUp, type Role } from "@/lib/api";

const roleOptions: {
  role: Role;
  label: string;
  sub: string;
  Icon: typeof Heart;
}[] = [
  { role: "mother", label: "Mother", sub: "Pregnant or new mother", Icon: Heart },
  { role: "patient", label: "Patient", sub: "General health user", Icon: User },
];

const schema = z
  .object({
    full_name: z.string().min(1, "Full name is required"),
    email: z.string().email("Enter a valid email"),
    phone: z.string().optional(),
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirm_password: z.string().min(1, "Please confirm your password"),
  })
  .refine((d) => d.password === d.confirm_password, {
    message: "Passwords do not match",
    path: ["confirm_password"],
  });

type FormValues = z.infer<typeof schema>;

const inputClass =
  "border border-gray-200 rounded-xl px-4 py-3 w-full focus:outline-none focus:ring-2 focus:ring-[#0E7C66]";

export default function SignUpPage() {
  const [role, setRole] = useState<Role | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: FormValues) => {
    if (!role) return;
    setError(null);
    try {
      await signUp({
        email: values.email,
        password: values.password,
        full_name: values.full_name,
        role,
        phone: values.phone || undefined,
      });
      setSuccess(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign up failed.");
    }
  };

  return (
    <main className="min-h-screen bg-[#08231F] flex items-center justify-center p-4">
      <div className="bg-white max-w-md w-full rounded-2xl shadow-2xl p-8">
        <div className="text-center mb-6">
          <Image
            src="/images/logo.png"
            alt="Shetu logo"
            width={96}
            height={96}
            className="mx-auto h-24 w-24 object-contain"
            priority
          />
          <p className="text-sm text-gray-500 mt-1">
            The AI Care Bridge — সেতু
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-xl bg-red-600 text-white px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {success ? (
          <div className="rounded-xl bg-green-600 text-white px-4 py-4 text-center">
            ✓ Account created! Check your email to verify before signing in.
          </div>
        ) : (
          <>
            {/* Step 1: role selection */}
            <div className="grid grid-cols-2 gap-3 mb-6">
              {roleOptions.map(({ role: r, label, sub, Icon }) => {
                const selected = role === r;
                return (
                  <button
                    type="button"
                    key={r}
                    onClick={() => setRole(r)}
                    className={`h-[90px] rounded-xl border flex flex-col items-center justify-center gap-1 px-1 transition ${
                      selected
                        ? "border-[#0E7C66] bg-[#0E7C66]/10"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <Icon
                      size={22}
                      className={selected ? "text-[#0E7C66]" : "text-gray-500"}
                    />
                    <span className="text-sm font-medium text-gray-800">
                      {label}
                    </span>
                    <span className="text-[10px] text-gray-400 text-center leading-tight">
                      {sub}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Step 2: form (after a role is chosen) */}
            {role && (
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
                <div>
                  <input
                    {...register("full_name")}
                    placeholder="Full Name"
                    className={inputClass}
                  />
                  {errors.full_name && (
                    <p className="text-xs text-red-600 mt-1">
                      {errors.full_name.message}
                    </p>
                  )}
                </div>

                <div>
                  <label className="text-xs text-gray-500">
                    Email (Supabase will send verification)
                  </label>
                  <input
                    {...register("email")}
                    type="email"
                    placeholder="you@example.com"
                    className={inputClass}
                  />
                  {errors.email && (
                    <p className="text-xs text-red-600 mt-1">
                      {errors.email.message}
                    </p>
                  )}
                </div>

                <div>
                  <label className="text-xs text-gray-500">
                    Phone (optional)
                  </label>
                  <input
                    {...register("phone")}
                    type="tel"
                    placeholder="+880…"
                    className={inputClass}
                  />
                </div>

                <div>
                  <input
                    {...register("password")}
                    type="password"
                    placeholder="Password (min 8 characters)"
                    className={inputClass}
                  />
                  {errors.password && (
                    <p className="text-xs text-red-600 mt-1">
                      {errors.password.message}
                    </p>
                  )}
                </div>

                <div>
                  <input
                    {...register("confirm_password")}
                    type="password"
                    placeholder="Confirm Password"
                    className={inputClass}
                  />
                  {errors.confirm_password && (
                    <p className="text-xs text-red-600 mt-1">
                      {errors.confirm_password.message}
                    </p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-[#0E7C66] text-white rounded-xl py-3 font-medium flex items-center justify-center gap-2 disabled:opacity-70"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      Creating account…
                    </>
                  ) : (
                    "Create Account →"
                  )}
                </button>
              </form>
            )}

            <p className="text-sm text-gray-500 text-center mt-6">
              Already have an account?{" "}
              <Link href="/auth/signin" className="text-[#0E7C66] font-medium">
                Sign in
              </Link>
            </p>
          </>
        )}
      </div>
    </main>
  );
}

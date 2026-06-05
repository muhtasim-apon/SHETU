"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, EyeOff, Loader2 } from "lucide-react";

import { signIn } from "@/lib/api";

const schema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
  remember: z.boolean().optional(),
});

type FormValues = z.infer<typeof schema>;

const inputClass =
  "border border-gray-200 rounded-xl px-4 py-3 w-full focus:outline-none focus:ring-2 focus:ring-[#0E7C66]";

export default function SignInPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: FormValues) => {
    setError(null);
    try {
      const res = await signIn({
        email: values.email,
        password: values.password,
      });
      localStorage.setItem("shetu_token", res.access_token);
      localStorage.setItem("shetu_user", JSON.stringify(res.user));
      router.push("/dashboard");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Sign in failed.";
      if (msg.toLowerCase().includes("email not confirmed")) {
        setError("Please verify your email first. Check your inbox.");
      } else {
        setError(msg);
      }
    }
  };

  return (
    <main className="min-h-screen bg-[#08231F] flex items-center justify-center p-4">
      <div className="bg-white max-w-md w-full rounded-2xl shadow-2xl p-8">
        <div className="text-center mb-6">
          <h1
            className="text-3xl font-bold text-[#0E7C66] tracking-wide"
            style={{ fontFamily: "Georgia, serif" }}
          >
            SHETU
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            The AI Care Bridge — সেতু
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-xl bg-red-600 text-white px-4 py-3 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div>
            <input
              {...register("email")}
              type="email"
              placeholder="Email"
              className={inputClass}
            />
            {errors.email && (
              <p className="text-xs text-red-600 mt-1">{errors.email.message}</p>
            )}
          </div>

          <div>
            <div className="relative">
              <input
                {...register("password")}
                type={showPassword ? "text" : "password"}
                placeholder="Password"
                className={inputClass}
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {errors.password && (
              <p className="text-xs text-red-600 mt-1">
                {errors.password.message}
              </p>
            )}
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-500">
            <input
              type="checkbox"
              {...register("remember")}
              className="accent-[#0E7C66]"
            />
            Remember me
          </label>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-[#0E7C66] text-white rounded-xl py-3 font-medium flex items-center justify-center gap-2 disabled:opacity-70"
          >
            {isSubmitting ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                Signing in…
              </>
            ) : (
              "Sign in →"
            )}
          </button>
        </form>

        <p className="text-sm text-gray-500 text-center mt-6">
          Don&apos;t have an account?{" "}
          <Link href="/auth/signup" className="text-[#0E7C66] font-medium">
            Sign up
          </Link>
        </p>
      </div>
    </main>
  );
}

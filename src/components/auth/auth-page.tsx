import { SignUpForm } from "@/components/auth/signup-form";
import { LoginForm } from "./login-form";

export default function AuthPage({ signup = false }: { signup?: boolean }) {
  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        {signup ? <SignUpForm /> : <LoginForm />}
      </div>
    </div>
  );
}

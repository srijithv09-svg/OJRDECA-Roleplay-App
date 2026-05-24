import { Suspense } from "react";
import { LoginView } from "@/components/auth/login-view";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginView />
    </Suspense>
  );
}

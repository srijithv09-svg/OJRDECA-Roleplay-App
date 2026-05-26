import { Suspense } from "react";
import { AuthCallbackView } from "@/components/auth/auth-callback-view";

export default function AuthCallbackPage() {
  return (
    <Suspense>
      <AuthCallbackView />
    </Suspense>
  );
}

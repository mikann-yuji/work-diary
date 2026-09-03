import { AppShell } from "@/components/app-shell";
import { AuthProvider } from "@/components/auth-provider";

export default function Home() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}

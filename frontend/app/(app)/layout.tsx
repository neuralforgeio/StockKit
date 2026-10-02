import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { MobileNav } from "@/components/layout/mobile-nav";
import { Sidebar, SidebarProvider } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { ToastProvider } from "@/components/ui/toast";
import { ThemeProvider } from "@/lib/theme";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const token = cookieStore.get("access_token");

  if (!token) {
    redirect("/login");
  }

  return (
    <ThemeProvider>
      <ToastProvider>
        <SidebarProvider>
          <div className="flex h-screen bg-bg-subtle">
            <Sidebar />
            <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
              <Topbar />
              <main className="flex-1 overflow-y-auto p-4 pb-20 sm:p-6 md:pb-6">
                {children}
              </main>
            </div>
            <MobileNav />
          </div>
        </SidebarProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}

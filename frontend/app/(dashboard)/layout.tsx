import Sidebar from '@/components/layout/Sidebar';
import AuthGuard from '@/components/layout/AuthGuard';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="flex-1 flex flex-col min-h-screen main-content-wrapper">
          {children}
        </main>
      </div>
    </AuthGuard>
  );
}

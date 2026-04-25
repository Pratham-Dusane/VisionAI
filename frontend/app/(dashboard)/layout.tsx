import Sidebar from '@/components/layout/Sidebar';
import AuthGuard from '@/components/layout/AuthGuard';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <div className="dashboard-shell">
        <Sidebar />
        <main className="dashboard-main">
          {children}
        </main>
      </div>
    </AuthGuard>
  );
}

export default function DashboardLoading() {
  return (
    <div className="grid gap-4">
      <div className="h-40 animate-pulse rounded-3xl border border-border/70 bg-card/80 shadow-[0_12px_30px_rgba(15,23,42,0.05)] dark:border-slate-800 dark:bg-slate-950/70" />
      <div className="grid gap-4 lg:grid-cols-4">
        <div className="h-32 animate-pulse rounded-3xl border border-border/70 bg-card/80 shadow-[0_12px_30px_rgba(15,23,42,0.05)] dark:border-slate-800 dark:bg-slate-950/70" />
        <div className="h-32 animate-pulse rounded-3xl border border-border/70 bg-card/80 shadow-[0_12px_30px_rgba(15,23,42,0.05)] dark:border-slate-800 dark:bg-slate-950/70" />
        <div className="h-32 animate-pulse rounded-3xl border border-border/70 bg-card/80 shadow-[0_12px_30px_rgba(15,23,42,0.05)] dark:border-slate-800 dark:bg-slate-950/70" />
        <div className="h-32 animate-pulse rounded-3xl border border-border/70 bg-card/80 shadow-[0_12px_30px_rgba(15,23,42,0.05)] dark:border-slate-800 dark:bg-slate-950/70" />
      </div>
      <div className="h-[420px] animate-pulse rounded-3xl border border-border/70 bg-card/80 shadow-[0_12px_30px_rgba(15,23,42,0.05)] dark:border-slate-800 dark:bg-slate-950/70" />
    </div>
  );
}

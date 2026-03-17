export default function DashboardLoading() {
  return (
    <div className="grid gap-4">
      <div className="h-40 animate-pulse rounded-3xl bg-white/70" />
      <div className="grid gap-4 lg:grid-cols-4">
        <div className="h-32 animate-pulse rounded-3xl bg-white/70" />
        <div className="h-32 animate-pulse rounded-3xl bg-white/70" />
        <div className="h-32 animate-pulse rounded-3xl bg-white/70" />
        <div className="h-32 animate-pulse rounded-3xl bg-white/70" />
      </div>
      <div className="h-[420px] animate-pulse rounded-3xl bg-white/70" />
    </div>
  );
}

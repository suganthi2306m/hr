function AttendanceOvertimePage() {
  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-2xl font-black tracking-tight text-dark">Overtime</h1>
        <p className="mt-1 text-sm text-slate-500">
          Overtime requests and approvals are not wired in LiveTrack yet. Use the attendance view for worked hours, or mark
          adjustments under Approvals.
        </p>
      </div>
      <div className="flux-card p-6 text-sm text-slate-600">
        When overtime workflows are added to the API, this page will list requests with approve / reject actions.
      </div>
    </section>
  );
}

export default AttendanceOvertimePage;

import { useCallback, useEffect, useMemo, useState } from 'react';
import apiClient from '../api/client';
import {
  buildAttendanceByDay,
  buildCalendarDays,
  buildLeaveByDay,
  fetchRangeForAnchor,
} from '../utils/attendanceCalendar';

/**
 * Loads attendance rows and leave requests for the calendar window of `anchorYmd` + `viewMode`.
 * Uses scoped API queries (from/to) for faster payloads.
 */
export function useAttendanceRecordsForRange({
  userId,
  anchorYmd,
  viewMode = 'month',
  enabled = true,
  companyHolidayByDay = null,
}) {
  const { from, to } = useMemo(() => fetchRangeForAnchor(anchorYmd, viewMode), [anchorYmd, viewMode]);
  const [records, setRecords] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!enabled || !userId) {
      setRecords([]);
      setLeaves([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const [{ data: att }, { data: lv }] = await Promise.all([
        apiClient.get('/ops/attendance', { params: { userId, from, to } }),
        apiClient.get('/ops/leaves', { params: { userId, from, to } }),
      ]);
      setRecords(Array.isArray(att?.items) ? att.items : []);
      setLeaves(Array.isArray(lv?.items) ? lv.items : []);
    } catch (e) {
      setError(e?.response?.data?.message || 'Failed to load attendance.');
      setRecords([]);
      setLeaves([]);
    } finally {
      setLoading(false);
    }
  }, [userId, from, to, enabled]);

  useEffect(() => {
    load();
  }, [load]);

  const attendanceByDay = useMemo(() => buildAttendanceByDay(records), [records]);
  const leaveByDay = useMemo(() => buildLeaveByDay(leaves), [leaves]);
  const calendarDays = useMemo(
    () => buildCalendarDays(anchorYmd, viewMode, attendanceByDay, leaveByDay, companyHolidayByDay),
    [anchorYmd, viewMode, attendanceByDay, leaveByDay, companyHolidayByDay],
  );

  return {
    from,
    to,
    records,
    leaves,
    loading,
    error,
    refetch: load,
    attendanceByDay,
    leaveByDay,
    calendarDays,
  };
}

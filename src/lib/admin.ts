// Review of flagged reports, for admins only. The server checks admin rights on
// every call (public.admin_* functions); the app only decides what to show.

import { hasSession, rpcAuthed } from "./auth";

export type AdminStatus = { is_admin: boolean; pending?: number };

export type PendingReport = {
  id: number;
  type: "new" | "wrong_location" | "details_wrong" | "other" | string;
  created_at: string;
  note: string | null;
  direction_deg: number | null;
  reporter_trust: number | null;
  reporter_reports: number;
  lat: number;
  lon: number;
  point: {
    id: number;
    source: string;
    status: string;
    confidence_level: string;
    confirm_count: number;
    gone_count: number;
    directions_deg: number[] | null;
    operator: string | null;
    osm_type: string | null;
    osm_id: number | null;
  } | null;
};

export type ModerateAction = "approve" | "reject" | "remove_camera" | "keep_camera";

/** Admin codes look like "decam-admin-" followed by letters/numbers. */
export const ADMIN_CODE = /^decam-admin-[a-z0-9]{8,}$/i;

export async function adminStatus(): Promise<AdminStatus> {
  if (!(await hasSession())) return { is_admin: false };
  try {
    return await rpcAuthed<AdminStatus>("admin_status", {});
  } catch {
    return { is_admin: false };
  }
}

export const claimAdmin = (code: string) => rpcAuthed<{ ok: boolean }>("claim_admin", { p_code: code.trim() });
export const listPendingReports = () => rpcAuthed<PendingReport[]>("admin_list_reports", {});
export const moderateReport = (id: number, action: ModerateAction) =>
  rpcAuthed<{ ok: boolean; pending: number }>("admin_moderate", { p_report_id: id, p_action: action });

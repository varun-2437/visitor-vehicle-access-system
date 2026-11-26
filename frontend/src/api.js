import axios from "axios";
import QRCode from "qrcode";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./supabaseConfig";

const getBaseURL = () => {
  const hostname = (typeof window !== "undefined" && window.location.hostname) || "localhost";
  return `http://${hostname}:8000`;
};

const rawSupabase = axios.create({
  baseURL: `${SUPABASE_URL}/rest/v1/rpc`,
  headers: {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json",
  },
});

const getStoredUser = () => {
  try {
    return JSON.parse(localStorage.getItem("user") || "null");
  } catch {
    return null;
  }
};

const getTokenUserId = () => {
  const token = localStorage.getItem("token") || "";
  const m = token.match(/(?:supabase-user-|supabase-direct-)(\d+)/);
  if (m) return parseInt(m[1], 10);
  return getStoredUser()?.id || null;
};

async function callRpc(name, payload = {}) {
  try {
    const res = await rawSupabase.post(`/${name}`, payload);
    return { status: 200, data: res.data };
  } catch (err) {
    const msg =
      err.response?.data?.message ||
      err.response?.data?.hint ||
      err.message ||
      "Supabase RPC error";
    const status = err.response?.status || 500;
    const error = new Error(msg);
    error.response = {
      status,
      data: { detail: msg },
    };
    throw error;
  }
}

async function makeQrDataUrl(token) {
  if (!token) return null;
  try {
    return await QRCode.toDataURL(token, { width: 320, margin: 2 });
  } catch {
    return null;
  }
}

async function routeToSupabase(config) {
  const url = config.url || "";
  const method = (config.method || "get").toLowerCase();
  const params = config.params || {};
  let body = {};
  if (config.data) {
    body = typeof config.data === "string" ? JSON.parse(config.data) : config.data;
  }

  const user = getStoredUser();
  const userId = getTokenUserId() || 1;
  const userRole = user?.role || "resident";

  // ── CSRF (not needed for direct Supabase REST) ──
  if (url === "/api/csrf-token") {
    return { status: 200, data: { csrf_token: "supabase-direct" } };
  }

  // ── Auth ──
  if (url === "/api/auth/login" && method === "post") {
    return await callRpc("vvas_login", {
      p_username: body.username || "",
      p_password: body.password || "",
    });
  }
  if (url === "/api/auth/me" && method === "get") {
    return await callRpc("vvas_me", { p_user_id: userId });
  }
  if (url === "/api/auth/change-password" && method === "put") {
    return await callRpc("vvas_change_password", {
      p_user_id: userId,
      p_current_password: body.current_password || "",
      p_new_password: body.new_password || "",
    });
  }
  if ((url === "/api/auth/signup" || url === "/api/auth/register") && method === "post") {
    return await callRpc("vvas_signup", {
      p_username: body.username,
      p_email: body.email,
      p_password: body.password,
      p_full_name: body.full_name,
      p_role: body.role || "resident",
      p_flat_number: body.flat_number || null,
      p_auto_approve: url === "/api/auth/register",
    });
  }

  // ── Passes & QR ──
  if (url === "/api/qr/my-passes" || url === "/api/qr/today-passes") {
    const allTime =
      url === "/api/qr/my-passes" ||
      params.all_time === true ||
      params.all_time === "true" ||
      (!params.from_date && !params.to_date);
    return await callRpc("vvas_api_get_passes", {
      p_user_id: userId,
      p_role: url === "/api/qr/my-passes" ? "resident" : userRole,
      p_from_date: params.from_date || null,
      p_to_date: params.to_date || null,
      p_all_time: Boolean(allTime),
    });
  }

  if (url === "/api/qr/generate" && method === "post") {
    const created = await callRpc("vvas_api_create_pass", {
      p_visitor_name: body.visitor_name,
      p_vehicle_number: body.vehicle_number || "",
      p_purpose: body.purpose || "",
      p_resident_id: userId,
      p_hours_valid: parseInt(body.hours_valid || 24, 10),
    });
    if (created.data?.id && created.data?.qr_token) {
      const qrDataUrl = await makeQrDataUrl(created.data.qr_token);
      if (qrDataUrl) {
        await callRpc("vvas_update_pass_qr", {
          p_pass_id: created.data.id,
          p_qr_image_path: qrDataUrl,
        });
        created.data.qr_image_path = qrDataUrl;
      }
    }
    return created;
  }

  if (url === "/api/qr/verify" && method === "post") {
    return await callRpc("vvas_verify_qr", {
      p_qr_token: body.qr_token || "",
      p_action: body.action || null,
      p_scanned_by: userId,
    });
  }

  const markExitMatch = url.match(/^\/api\/qr\/passes\/(\d+)\/mark-exit$/);
  if (markExitMatch && method === "post") {
    return await callRpc("vvas_mark_exit", {
      p_pass_id: parseInt(markExitMatch[1], 10),
      p_scanned_by: userId,
    });
  }

  if (url === "/api/qr/manual-entry" && method === "post") {
    const res = await callRpc("vvas_api_manual_entry", {
      p_visitor_name: body.visitor_name,
      p_vehicle_number: body.vehicle_number || "",
      p_purpose: body.purpose || "Manual Gate Entry",
      p_action: body.action || "entry",
      p_scanned_by: userId,
    });
    const vp = res.data?.visitor_pass;
    if (vp?.id && vp?.qr_token) {
      const qrDataUrl = await makeQrDataUrl(vp.qr_token);
      if (qrDataUrl) {
        await callRpc("vvas_update_pass_qr", {
          p_pass_id: vp.id,
          p_qr_image_path: qrDataUrl,
        });
        vp.qr_image_path = qrDataUrl;
      }
    }
    return res;
  }

  if (url === "/api/qr/stats" && method === "get") {
    return await callRpc("vvas_api_get_stats", {
      p_from_date: params.from_date || null,
      p_to_date: params.to_date || null,
    });
  }

  // ── Logs ──
  if (url === "/api/admin/logs" || url === "/api/qr/today-logs") {
    const allTime =
      url === "/api/admin/logs" ||
      params.all_time === true ||
      params.all_time === "true" ||
      (!params.from_date && !params.to_date);
    return await callRpc("vvas_api_get_logs", {
      p_from_date: params.from_date || null,
      p_to_date: params.to_date || null,
      p_all_time: Boolean(allTime),
    });
  }

  // ── Admin Users & API Keys ──
  if (url === "/api/admin/users" && method === "get") {
    return await callRpc("vvas_admin_users");
  }
  const approveMatch = url.match(/^\/api\/admin\/users\/(\d+)\/approve$/);
  if (approveMatch && method === "put") {
    return await callRpc("vvas_approve_user", { p_user_id: parseInt(approveMatch[1], 10) });
  }
  const rejectMatch = url.match(/^\/api\/admin\/users\/(\d+)\/reject$/);
  if (rejectMatch && method === "put") {
    return await callRpc("vvas_reject_user", {
      p_user_id: parseInt(rejectMatch[1], 10),
      p_reason: body.rejection_reason || "Rejected by Admin",
    });
  }
  const deleteUserMatch = url.match(/^\/api\/admin\/users\/(\d+)$/);
  if (deleteUserMatch && method === "delete") {
    return await callRpc("vvas_delete_user", { p_user_id: parseInt(deleteUserMatch[1], 10) });
  }

  if (url === "/api/admin/api-keys" && method === "get") {
    return await callRpc("vvas_admin_api_keys");
  }
  if (url === "/api/admin/api-keys" && method === "post") {
    return await callRpc("vvas_create_api_key", {
      p_description: body.description || "Hardware Key",
      p_created_by: userId,
    });
  }
  const deleteKeyMatch = url.match(/^\/api\/admin\/api-keys\/(\d+)$/);
  if (deleteKeyMatch && method === "delete") {
    return await callRpc("vvas_delete_api_key", { p_key_id: parseInt(deleteKeyMatch[1], 10) });
  }

  return null; // Fall through to Python backend for /api/anpr/*
}

const defaultAdapter = axios.getAdapter(axios.defaults.adapter);

const API = axios.create({
  baseURL: getBaseURL(),
  withCredentials: true,
  xsrfCookieName: "XSRF-TOKEN",
  xsrfHeaderName: "X-XSRF-TOKEN",
  adapter: async (config) => {
    const supaResult = await routeToSupabase(config);
    if (supaResult !== null) {
      return {
        data: supaResult.data,
        status: supaResult.status,
        statusText: "OK",
        headers: { "content-type": "application/json" },
        config,
      };
    }
    return defaultAdapter(config);
  },
});

export default API;

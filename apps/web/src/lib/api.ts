import { supabase } from "./supabase.js";

const API_URL = import.meta.env.VITE_API_URL || "";

export class ApiError extends Error {
  status: number;
  body: Record<string, unknown>;
  constructor(
    message: string,
    status: number,
    body: Record<string, unknown>
  ) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({
      error: res.statusText,
    }))) as Record<string, unknown>;
    const message =
      (typeof body.error === "string" ? body.error : null) ||
      `Request failed: ${res.status}`;
    throw new ApiError(message, res.status, body);
  }

  return res.json();
}

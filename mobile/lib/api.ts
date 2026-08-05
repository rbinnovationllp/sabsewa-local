import { apiUrl, authenticatedApiHeaders } from "@/lib/backend";

export async function apiPost(path: string, payload: any) {
  const res = await fetch(path.startsWith("http") ? path : apiUrl(path), {
    method: "POST",
    headers: await authenticatedApiHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "API error");

  return json;
}

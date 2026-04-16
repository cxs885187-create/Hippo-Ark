export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: "include",
    headers: {
      ...(init?.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    const contentType = response.headers.get("content-type") ?? "";
    let message = "请求失败";
    if (contentType.includes("application/json")) {
      const data = (await response.json()) as { detail?: string };
      message = data.detail ?? message;
    } else {
      message = await response.text();
    }
    throw new Error(message || "请求失败");
  }

  if (response.status === 204) {
    return null as T;
  }

  return (await response.json()) as T;
}

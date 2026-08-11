export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function callApi(payload) {
  let response;
  try {
    response = await fetch("/api/message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch {
    throw new ApiError("The line went dead — try that again.", 0);
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (response.status === 429) {
      throw new ApiError("The department is swamped with cases. Give the line a moment, then try again.", 429);
    }
    throw new ApiError(data.error || "The line went dead — try that again.", response.status);
  }
  return data;
}

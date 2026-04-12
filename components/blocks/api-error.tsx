"use client";

type ApiErrorProps = {
  error: Error;
  reset?: () => void;
};

export function ApiError({ error, reset }: ApiErrorProps) {
  const message = error.message.includes("fetch")
    ? "Unable to reach the backend server. Check that the API is running and NEXT_PUBLIC_API_BASE_URL is correct."
    : error.message.includes("401")
      ? "Authentication failed. Please sign in again."
      : error.message.includes("403")
        ? "You do not have permission to access this data."
        : error.message.includes("404")
          ? "The requested resource was not found."
          : `An unexpected error occurred: ${error.message}`;

  return (
    <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-5">
      <p className="text-sm font-medium text-rose-900">Something went wrong</p>
      <p className="mt-1 text-sm text-rose-700">{message}</p>
      {reset ? (
        <button
          type="button"
          onClick={reset}
          className="mt-3 rounded-md border border-rose-200 bg-white px-3 py-1.5 text-xs font-medium text-rose-900 hover:bg-rose-50"
        >
          Try again
        </button>
      ) : null}
    </div>
  );
}

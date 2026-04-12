"use client";

import { ApiError } from "@/components/blocks/api-error";

type ErrorProps = {
  error: Error;
  reset: () => void;
};

export default function ConsoleError({ error, reset }: ErrorProps) {
  return (
    <div className="flex items-center justify-center px-6 py-16">
      <div className="max-w-md">
        <ApiError error={error} reset={reset} />
      </div>
    </div>
  );
}

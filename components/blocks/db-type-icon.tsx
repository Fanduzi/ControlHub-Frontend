import { Database } from "lucide-react";
import { cn } from "@/lib/utils";

const subtypeIconMap: Record<string, string> = {
  mysql: "/icons/db/mysql.svg",
  postgresql: "/icons/db/postgresql.svg",
  redis: "/icons/db/redis.svg",
  mongodb: "/icons/db/mongodb.svg",
  tidb: "/icons/db/tidb.svg",
  clickhouse: "/icons/db/clickhouse.svg",
  proxysql: "/icons/db/proxysql.png",
  chproxy: "/icons/db/chproxy.svg",
};

interface DbTypeIconProps {
  subtype?: string;
  className?: string;
}

export function DbTypeIcon({ subtype, className }: DbTypeIconProps) {
  const src = subtype ? subtypeIconMap[subtype] : undefined;

  if (!src) {
    return (
      <Database className={cn("size-5 text-muted-foreground", className)} />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={subtype ?? "database"}
      className={cn("size-5 shrink-0 object-contain", className)}
    />
  );
}

import Image from "next/image";
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
    <Image
      src={src}
      alt={subtype ?? "database"}
      width={20}
      height={20}
      className={cn("shrink-0", className)}
    />
  );
}

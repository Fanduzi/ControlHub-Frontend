"use client";

import { Bell, ChevronsUpDown, Command, Plus, Search } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { environmentOptions, getConsoleSectionTitle } from "@/lib/navigation";

type TopbarProps = {
  pathname: string;
};

export function Topbar({ pathname }: TopbarProps) {
  return (
    <header className="flex min-h-16 items-center justify-between gap-3 border-b border-border bg-background px-5">
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {getConsoleSectionTitle(pathname)}
        </p>
        <p className="mt-1 text-sm text-foreground">
          Shared shell for asset visibility, ownership context, and change traces.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <label className="relative hidden min-[980px]:block">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-9 w-64 border-border bg-card pl-9 text-sm"
            placeholder="Search resources, owners, IDs"
          />
        </label>

        <Select defaultValue="production">
          <SelectTrigger className="h-9 w-[148px] border-border bg-card text-sm">
            <SelectValue placeholder="Environment" />
          </SelectTrigger>
          <SelectContent>
            {environmentOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button variant="outline" size="sm" className="gap-2">
          <Plus className="size-4" />
          Quick Action
        </Button>

        <Button variant="outline" size="icon-sm" aria-label="Notifications">
          <Bell className="size-4" />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="outline" className="h-9 gap-2 px-2.5" size="sm" />
            }
          >
            <Avatar className="size-6 rounded-md border border-border">
              <AvatarFallback className="rounded-md bg-sky-500/10 text-[11px] font-semibold text-sky-700">
                CH
              </AvatarFallback>
            </Avatar>
            <div className="hidden text-left sm:block">
              <p className="text-xs font-medium text-foreground">Chen Hao</p>
              <p className="text-[11px] text-muted-foreground">admin</p>
            </div>
            <ChevronsUpDown className="size-4 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel>Workspace</DropdownMenuLabel>
            <DropdownMenuItem>
              <Command className="size-4" />
              Open command palette
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem>Profile</DropdownMenuItem>
            <DropdownMenuItem>Sign out</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

import * as React from 'react';
import { Button } from '~/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui/table';
import { Badge } from '~/components/ui/badge';
import { Checkbox } from '~/components/ui/checkbox';
import { ArrowDown, ArrowUp, ArrowUpDown, UserMinus } from 'lucide-react';
import { Pagination } from '~/components/table/pagination';
import { CookieColumns } from '~/hooks/useTable';
import { cn } from '~/utils/misc';
import { useFetcher, useRevalidator } from 'react-router';
import { TooltipIdCopy } from '~/components/ui/tooltip-id-copy';

type User = {
  id: string;
  name: string | null;
  email: string;
  profiles: Array<{
    isOwner: boolean;
    teacherProfile?: unknown | null;
    studentProfile?: unknown | null;
  }>;
};

type MembersTableProps = {
  users: User[];
  totalCount: number;
  table: {
    sort: string;
    direction: 'asc' | 'desc';
    skip: number;
    take: number;
  };
  columns: CookieColumns;
  selected: string[];
  onSelectAll: () => void;
  onSelect: (id: string) => void;
  onSort: (field: string, direction: 'asc' | 'desc') => void;
  onEditMember: (userId: string) => void;
  onClearSelection: () => void;
};

export function MembersTable({
  users,
  totalCount,
  table,
  columns,
  selected,
  onSelectAll,
  onSelect,
  onSort,
  onEditMember,
  onClearSelection,
}: MembersTableProps) {
  const fetcher = useFetcher();
  const revalidator = useRevalidator();
  const isLoading = fetcher.state !== 'idle' || revalidator.state === 'loading';
  return (
    <div className="bg-muted flex-1 rounded-lg">
      <div className="flex justify-between items-center px-6 pt-6">
        <h2 className="text-base font-semibold">Members ({totalCount})</h2>
        {selected.length > 0 && (
          <fetcher.Form method="post" className="inline">
            <input type="hidden" name="intent" value="remove-members" />
            {selected.map((id) => (
              <input key={id} type="hidden" name="memberIds" value={id} />
            ))}
            <Button
              type="submit"
              variant="destructive"
              disabled={fetcher.state !== 'idle'}
              onClick={(e) => {
                if (
                  !confirm(
                    `Are you sure you want to remove ${selected.length} member(s) from the organization? They will lose access to the platform.`
                  )
                ) {
                  e.preventDefault();
                  return;
                }
                onClearSelection();
                e.currentTarget.form?.submit();
              }}
            >
              <UserMinus className="mr-2 h-4 w-4" />
              Remove {selected.length} Member{selected.length !== 1 ? 's' : ''}
            </Button>
          </fetcher.Form>
        )}
      </div>

      <div className="px-6 pb-6">
        <div className="relative flex-1 overflow-y-auto min-h-[200px]">
          {users.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center border border-dashed bg-muted">
              <span className="text-lg font-bold">No members found</span>
              <span className="text-sm text-muted-foreground">
                Try adding some members to your organization
              </span>
            </div>
          ) : (
            <div
              className={cn(isLoading ? 'opacity-50 transition-opacity' : '')}
            >
              <Table className="rounded-lg">
                <TableHeader className="rounded-t-lg">
                  <TableRow className="bg-muted/50 rounded-t-lg">
                    <TableHead className="w-[50px] pl-4 rounded-tl-lg">
                      <Checkbox
                        checked={selected.length === users.length}
                        onCheckedChange={onSelectAll}
                      />
                    </TableHead>
                    {Object.entries(columns).map(([key, { label, value }]) => (
                      <TableHead
                        key={key}
                        className={key === 'actions' ? 'pr-4' : ''}
                      >
                        <Button
                          variant="unstyled"
                          className={cn(
                            'h-8 p-0',
                            !value ? 'pointer-events-none' : ''
                          )}
                          onClick={() =>
                            value
                              ? onSort(
                                  value,
                                  table.direction === 'asc' ? 'desc' : 'asc'
                                )
                              : undefined
                          }
                        >
                          {label}
                          {!value ? null : table.sort === value ? (
                            table.direction === 'desc' ? (
                              <ArrowUp
                                className="ml-2 h-4 w-4 text-primary"
                                strokeWidth={3}
                              />
                            ) : (
                              <ArrowDown
                                className="ml-2 h-4 w-4 text-primary"
                                strokeWidth={3}
                              />
                            )
                          ) : (
                            <ArrowUpDown className="ml-2 h-4 w-4 opacity-50" />
                          )}
                        </Button>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => (
                    <TableRow
                      key={user.id}
                      className="transition-opacity duration-200"
                    >
                      <TableCell className="max-h-[37px] pl-4">
                        <Checkbox
                          checked={selected.includes(user.id)}
                          onCheckedChange={() => onSelect(user.id)}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <TooltipIdCopy id={user.id}>
                            {user.name || 'Not set'}
                          </TooltipIdCopy>
                          {user.profiles.some((p) => p.isOwner) && (
                            <Badge
                              variant="outline"
                              className="text-xs text-muted-foreground"
                            >
                              Owner
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{user.email}</TableCell>
                      <TableCell>
                        {user.profiles.some((p) => p.teacherProfile) ? (
                          <Badge variant="info-outlined">Teacher</Badge>
                        ) : user.profiles.some((p) => p.isOwner) ? (
                          <span className="text-muted-foreground">N/A</span>
                        ) : user.profiles.some((p) => p.studentProfile) ? (
                          <Badge variant="secondary">Student</Badge>
                        ) : (
                          <Badge variant="outline">Unassigned</Badge>
                        )}
                      </TableCell>
                      <TableCell className="pr-4">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onEditMember(user.id)}
                        >
                          Edit
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {isLoading ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : null}
        </div>
        <div className="py-2">
          <Pagination
            totalCount={totalCount}
            skip={table.skip}
            take={table.take}
            onChange={(skip, take) => {
              fetcher.submit(
                {
                  intent: 'updateFilters',
                  key: 'skip-take',
                  value: `${skip}-${take}`,
                },
                { method: 'POST' }
              );
            }}
          />
        </div>
      </div>
    </div>
  );
}

import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';

export const Pagination = ({
  totalCount,
  skip,
  take,
  onChange,
}: {
  totalCount: number;
  skip: number;
  take: number;
  onChange: (skip: number, take: number) => void;
}) => {
  return (
    <div className="flex flex-col items-start justify-between gap-2 md:flex-row md:items-center">
      <div className="flex gap-1">
        <button
          className="rounded-md border bg-white p-2 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          onClick={() => onChange(0, take)}
          disabled={skip === 0}
          aria-label="go to start"
        >
          <ChevronsLeft size={16} />
        </button>
        <button
          className="rounded-md border bg-white p-2 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          onClick={() => onChange(Math.max(0, skip - take), take)}
          disabled={skip === 0}
          aria-label="go back"
        >
          <ChevronLeft size={16} />
        </button>
        <button
          className="rounded-md border bg-white p-2 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          onClick={() => onChange(skip + take, take)}
          disabled={skip + take >= totalCount}
          aria-label="go forward"
        >
          <ChevronRight size={16} />
        </button>
        <button
          className="rounded-md border bg-white p-2 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          onClick={() => onChange(Math.floor(totalCount / take) * take, take)}
          disabled={skip + take >= totalCount}
          aria-label="go to end"
        >
          <ChevronsRight size={16} />
        </button>
      </div>
      <div className="mr-2 flex min-w-max items-center gap-2 text-sm">
        <div>Page</div>
        <strong>
          {Math.floor(skip / take) + 1} of {Math.ceil(totalCount / take)}
        </strong>
      </div>
      <div className="flex items-center gap-2">
        <div>
          <div className="flex">
            <div className="flex h-7 items-center rounded-l-md border bg-gray-100 px-3 text-sm">
              Go to page
            </div>
            <input
              className="h-7 w-16 rounded-r-md border bg-white px-3"
              type="number"
              value={Math.floor(skip / take) + 1}
              onChange={(e) => {
                const page = e.target.value ? Number(e.target.value) - 1 : 0;
                onChange(page * take, take);
              }}
            />
          </div>
        </div>
        <select
          className="max-w-[150px] rounded-md border bg-white px-3 py-1 text-sm focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400"
          value={take}
          onChange={(e) => {
            const newTake = parseInt(e.target.value);
            onChange(0, newTake);
          }}
        >
          {[10, 20, 50, 100].map((pageSize) => (
            <option key={pageSize} value={pageSize}>
              Show {pageSize}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
};

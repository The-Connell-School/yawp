-- How a user left each in-app page tour (free classroom teachers, behind the
-- free_tier flag). Additive: nothing else reads or writes this table.
CREATE TABLE "UserTour" (
    "userId" TEXT NOT NULL,
    "tourId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserTour_pkey" PRIMARY KEY ("userId","tourId")
);

ALTER TABLE "UserTour" ADD CONSTRAINT "UserTour_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

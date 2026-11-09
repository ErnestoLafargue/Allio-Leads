-- FlowZone: opgaver gemmes pr. bruger i stedet for i browseren.
CREATE TABLE "FlowZoneTask" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FlowZoneTask_pkey" PRIMARY KEY ("userId","id")
);

ALTER TABLE "FlowZoneTask" ADD CONSTRAINT "FlowZoneTask_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

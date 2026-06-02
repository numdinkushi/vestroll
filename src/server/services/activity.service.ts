import { eq, sql } from "drizzle-orm";
import { db, users } from "@/server/db";
import { ForbiddenError } from "@/server/utils/errors";
import { PaginatedResponse, toPaginatedResponse } from "@/types/pagination";

export type ActivityType = "transaction" | "payroll_run" | "invoice_created";

export interface ActivityItem {
  id: string;
  sourceId: string;
  type: ActivityType;
  title: string;
  description: string;
  amount: number | string | null;
  status: string | null;
  timestamp: string;
  metadata: Record<string, unknown> | null;
}

interface ActivityQueryRow {
  id: string;
  sourceId: string;
  type: ActivityType;
  title: string;
  description: string;
  amount: number | string | null;
  status: string | null;
  timestamp: Date | string;
  metadata: Record<string, unknown> | null;
}

interface CountQueryRow {
  total: number | string | bigint;
}

export class ActivityService {
  static async listRecentActivities(
    userId: string,
    page: number,
    limit: number,
  ): Promise<PaginatedResponse<ActivityItem>> {
    const [user] = await db
      .select({ organizationId: users.organizationId })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user?.organizationId) {
      throw new ForbiddenError("User is not associated with any organization");
    }

    const offset = (page - 1) * limit;

    const [activityResult, countResult] = await Promise.all([
      db.execute<ActivityQueryRow>(sql`
        with unified_activities as (
          select
            concat('transaction:', ft.id::text) as id,
            ft.id::text as "sourceId",
            'transaction' as type,
            initcap(ft.type::text) || ' transaction' as title,
            concat(initcap(ft.type::text), ' via ', ft.provider) as description,
            ft.amount::text as amount,
            ft.status::text as status,
            ft.created_at as timestamp,
            jsonb_build_object(
              'provider', ft.provider,
              'providerReference', ft.provider_reference,
              'transactionType', ft.type,
              'metadata', ft.metadata
            ) as metadata
          from fiat_transactions ft
          where ft.organization_id = ${user.organizationId}

          union all

          select
            concat('payroll_run:', i.id::text) as id,
            i.id::text as "sourceId",
            'payroll_run' as type,
            'Payroll run completed' as title,
            concat('Payroll processed for invoice ', i.invoice_no) as description,
            i.amount::text as amount,
            i.status::text as status,
            i.updated_at as timestamp,
            jsonb_build_object(
              'invoiceNo', i.invoice_no,
              'paidIn', i.paid_in,
              'employeeId', i.employee_id
            ) as metadata
          from invoices i
          where i.organization_id = ${user.organizationId}
            and i.status = 'paid'

          union all

          select
            concat('invoice_created:', i.id::text) as id,
            i.id::text as "sourceId",
            'invoice_created' as type,
            'Invoice created' as title,
            concat('Invoice ', i.invoice_no, ' created: ', i.title) as description,
            i.amount::text as amount,
            i.status::text as status,
            i.created_at as timestamp,
            jsonb_build_object(
              'invoiceNo', i.invoice_no,
              'paidIn', i.paid_in,
              'employeeId', i.employee_id,
              'contractId', i.contract_id
            ) as metadata
          from invoices i
          where i.organization_id = ${user.organizationId}
        )
        select *
        from unified_activities
        order by timestamp desc
        limit ${limit}
        offset ${offset}
      `),
      db.execute<CountQueryRow>(sql`
        with unified_activities as (
          select ft.id
          from fiat_transactions ft
          where ft.organization_id = ${user.organizationId}

          union all

          select i.id
          from invoices i
          where i.organization_id = ${user.organizationId}
            and i.status = 'paid'

          union all

          select i.id
          from invoices i
          where i.organization_id = ${user.organizationId}
        )
        select count(*) as total
        from unified_activities
      `),
    ]);

    const total = Number(countResult.rows[0]?.total ?? 0);
    const activities = activityResult.rows.map((activity) => ({
      ...activity,
      timestamp:
        activity.timestamp instanceof Date
          ? activity.timestamp.toISOString()
          : new Date(activity.timestamp).toISOString(),
    }));

    return toPaginatedResponse(activities, page, limit, total);
  }
}

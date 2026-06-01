import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  integer,
  boolean,
  pgEnum,
  text,
  index,
  bigint,
  jsonb,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

export const userStatusEnum = pgEnum("user_status", [
  "pending_verification",
  "active",
  "suspended",
]);
export const twoFactorMethodEnum = pgEnum("two_factor_method", [
  "totp",
  "backup_code",
]);
export const oauthProviderEnum = pgEnum("oauth_provider", ["google", "apple"]);
export const kybStatusEnum = pgEnum("kyb_status", [
  "not_started",
  "pending",
  "verified",
  "rejected",
]);
export const leaveStatusEnum = pgEnum("leave_status", [
  "Pending",
  "Approved",
  "Rejected",
  "Cancelled",
]);
export const leaveTypeEnum = pgEnum("leave_type", [
  "vacation",
  "sick",
  "personal",
  "other",
]);
export const contractStatusEnum = pgEnum("contract_status", [
  "pending_signature",
  "in_review",
  "rejected",
  "active",
  "completed",
]);
export const contractTypeEnum = pgEnum("contract_type", [
  "fixed_rate",
  "pay_as_you_go",
  "milestone",
]);
export const employeeStatusEnum = pgEnum("employee_status", [
  "Active",
  "Inactive",
]);
export const employeeTypeEnum = pgEnum("employee_type", [
  "Freelancer",
  "Contractor",
]);
export const paymentTypeEnum = pgEnum("payment_type", ["crypto", "fiat"]);
export const invoiceStatusEnum = pgEnum("invoice_status", [
  "pending",
  "approved",
  "unpaid",
  "overdue",
  "paid",
  "rejected",
]);
export const milestoneStatusEnum = pgEnum("milestone_status", [
  "pending",
  "in_progress",
  "completed",
  "approved",
  "rejected",
]);
export const approvalStatusEnum = pgEnum("approval_status", [
  "pending",
  "approved",
  "rejected",
]);
export const timeOffTypeEnum = pgEnum("time_off_type", ["paid", "unpaid"]);
export const signerTypeEnum = pgEnum("signer_type", ["Email", "Passkey"]);
export const fiatTransactionTypeEnum = pgEnum("fiat_transaction_type", [
  "deposit",
  "withdrawal",
  "payout",
]);
export const fiatTransactionStatusEnum = pgEnum("fiat_transaction_status", [
  "pending",
  "completed",
  "failed",
]);
export const fiatProviderEnum = pgEnum("fiat_provider", [
  "monnify",
  "flutterwave",
]);

export const payrollDraftStatusEnum = pgEnum("payroll_draft_status", [
  "active",
  "processed",
  "cancelled",
]);

export const invitationRoleEnum = pgEnum("invitation_role", [
  "admin",
  "hr_manager",
  "payroll_manager",
  "employee",
]);

export const invitationStatusEnum = pgEnum("invitation_status", [
  "pending",
  "accepted",
  "declined",
  "expired",
]);

export const auditEventEnum = pgEnum("audit_event", [
  "ROLE_CHANGE",
  "EMAIL_CHANGE",
  "BIOMETRIC_ENROLLMENT",
  "PASSWORD_CHANGE",
  "ACCOUNT_DELETION",
  "SECURITY_CHANGE",
]);

export const payrollStatusEnum = pgEnum("payroll_status", [
  "draft",
  "processing",
  "completed",
  "failed",
]);

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 255 }).notNull().unique(),
  providerPreference: fiatProviderEnum("provider_preference")
    .default("monnify")
    .notNull(),
  industry: varchar("industry", { length: 255 }),
  registrationNumber: varchar("registration_number", { length: 255 }),

  registeredStreet: varchar("registered_street", { length: 255 }),
  registeredCity: varchar("registered_city", { length: 255 }),
  registeredState: varchar("registered_state", { length: 255 }),
  registeredPostalCode: varchar("registered_postal_code", { length: 255 }),
  registeredCountry: varchar("registered_country", { length: 255 }),

  billingStreet: varchar("billing_street", { length: 255 }),
  billingCity: varchar("billing_city", { length: 255 }),
  billingState: varchar("billing_state", { length: 255 }),
  billingPostalCode: varchar("billing_postal_code", { length: 255 }),
  billingCountry: varchar("billing_country", { length: 255 }),
  website: varchar("website", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  deletedAt: timestamp("deleted_at"),
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  firstName: varchar("first_name", { length: 255 }).notNull(),
  lastName: varchar("last_name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }),
  avatarUrl: varchar("avatar_url", { length: 500 }),
  role: varchar("role", { length: 100 }),
  organizationName: varchar("organization_name", { length: 255 }),
  status: userStatusEnum("status").default("pending_verification").notNull(),
  organizationId: uuid("organization_id").references(() => organizations.id, {
    onDelete: "cascade",
  }),

  twoFactorEnabled: boolean("two_factor_enabled").default(false).notNull(),
  twoFactorSecret: text("two_factor_secret"),
  twoFactorEnabledAt: timestamp("two_factor_enabled_at"),

  failedTwoFactorAttempts: integer("failed_two_factor_attempts")
    .default(0)
    .notNull(),
  twoFactorLockoutUntil: timestamp("two_factor_lockout_until"),
  failedLoginAttempts: integer("failed_login_attempts").default(0).notNull(),
  lockedUntil: timestamp("locked_until"),
  accountLockedReason: text("account_locked_reason"),

  oauthProvider: oauthProviderEnum("oauth_provider"),
  oauthId: varchar("oauth_id", { length: 255 }),
  signerType: signerTypeEnum("signer_type").default("Email").notNull(),
  lastLoginAt: timestamp("last_login_at"),
  lastActiveAt: timestamp("last_active_at"),
  lastLoginIp: varchar("last_login_ip", { length: 45 }),
  lastLoginUa: text("last_login_ua"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const userRelations = relations(users, (helpers: any) => ({
  organization: helpers.one(organizations, {
    fields: [users.organizationId],
    references: [organizations.id],
  }),
}));

export const organizationRelations = relations(
  organizations,
  (helpers: any) => ({
    users: helpers.many(users),
    employees: helpers.many(employees),
    invitations: helpers.many(organizationInvitations),
  }),
);

export const emailVerifications = pgTable("email_verifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  otpHash: varchar("otp_hash", { length: 255 }).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  attempts: integer("attempts").default(0).notNull(),
  verified: boolean("verified").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const backupCodes = pgTable("backup_codes", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  codeHash: varchar("code_hash", { length: 255 }).notNull(),
  used: boolean("used").default(false).notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const twoFactorAttempts = pgTable("two_factor_attempts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  success: boolean("success").notNull(),
  method: twoFactorMethodEnum("method").notNull(),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const trustedDevices = pgTable("trusted_devices", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  deviceToken: varchar("device_token", { length: 255 }).notNull().unique(),
  deviceName: varchar("device_name", { length: 255 }),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
  expiresAt: timestamp("expires_at").notNull(),
  lastUsedAt: timestamp("last_used_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    refreshTokenHash: varchar("refresh_token_hash", { length: 255 }).notNull(),
    deviceInfo: text("device_info"),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    lastUsedAt: timestamp("last_used_at"),
  },
  (table) => [index("sessions_user_id_idx").on(table.userId)],
);

export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: varchar("email", { length: 255 }).notNull(),
    ipAddress: varchar("ip_address", { length: 45 }),
    userAgent: text("user_agent"),
    lastLoginIp: varchar("last_login_ip", { length: 45 }),
    lastLoginUa: text("last_login_ua"),
    success: boolean("success").notNull(),
    failureReason: text("failure_reason"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("login_attempts_created_at_idx").on(table.createdAt)]
);

export const biometricLogs = pgTable("biometric_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  email: varchar("email", { length: 255 }),
  lastLoginIp: varchar("last_login_ip", { length: 45 }),
  lastLoginUa: text("last_login_ua"),
  success: boolean("success").notNull(),
  failureReason: text("failure_reason"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});


export const passkeyRegistrationChallenges = pgTable(
  "passkey_registration_challenges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    challengeHash: varchar("challenge_hash", { length: 64 }).notNull().unique(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("passkey_registration_challenges_user_id_idx").on(table.userId),
  ],
);

export const employees = pgTable(
  "employees",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    firstName: varchar("first_name", { length: 255 }).notNull(),
    lastName: varchar("last_name", { length: 255 }).notNull(),
    email: varchar("email", { length: 255 }).notNull(),
    role: varchar("role", { length: 255 }).notNull(),
    department: varchar("department", { length: 255 }),
    type: employeeTypeEnum("type").notNull(),
    status: employeeStatusEnum("status").default("Active").notNull(),
    avatarUrl: varchar("avatar_url", { length: 512 }),
    userId: uuid("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    
    bankName: varchar("bank_name", { length: 255 }),
    accountNumber: varchar("account_number", { length: 255 }),
    routingNumber: varchar("routing_number", { length: 255 }),
    sortCode: varchar("sort_code", { length: 255 }),
    iban: varchar("iban", { length: 34 }),
    swiftCode: varchar("swift_code", { length: 11 }),
    accountType: varchar("account_type", { length: 50 }),
    accountHolderName: varchar("account_holder_name", { length: 255 }),
    isAccountVerified: boolean("is_account_verified").default(false).notNull(),
    accountVerifiedAt: timestamp("account_verified_at"),
    bankAddress: varchar("bank_address", { length: 500 }),
    bankCity: varchar("bank_city", { length: 255 }),
    bankCountry: varchar("bank_country", { length: 255 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    bankAccountDeletedAt: timestamp("bank_account_deleted_at"),
  },
  (table) => [
    index("employees_organization_id_idx").on(table.organizationId),
    index("employees_account_number_idx").on(table.accountNumber),
    index("employees_routing_number_idx").on(table.routingNumber),
  ],
);

export const companyProfiles = pgTable("company_profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  organizationId: uuid("organization_id")
    .references(() => organizations.id, { onDelete: "cascade" })
    .notNull()
    .unique(),
  logoUrl: varchar("logo_url", { length: 512 }),
  brandName: varchar("brand_name", { length: 255 }).notNull(),
  registeredName: varchar("registered_name", { length: 255 }).notNull(),
  registrationNumber: varchar("registration_number", { length: 255 }).notNull(),
  country: varchar("country", { length: 255 }).notNull(),
  size: varchar("size", { length: 100 }),
  vatNumber: varchar("vat_number", { length: 255 }),
  website: varchar("website", { length: 512 }),
  address: varchar("address", { length: 500 }).notNull(),
  altAddress: varchar("alt_address", { length: 500 }),
  city: varchar("city", { length: 255 }).notNull(),
  region: varchar("region", { length: 255 }),
  postalCode: varchar("postal_code", { length: 50 }),
  billingAddress: varchar("billing_address", { length: 500 }),
  billingAltAddress: varchar("billing_alt_address", { length: 500 }),
  billingCity: varchar("billing_city", { length: 255 }),
  billingRegion: varchar("billing_region", { length: 255 }),
  billingCountry: varchar("billing_country", { length: 2 }).notNull(),
  billingPostalCode: varchar("billing_postal_code", { length: 50 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const organizationWallets = pgTable("organization_wallets", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .references(() => organizations.id, { onDelete: "cascade" })
    .notNull()
    .unique(),
  walletAddress: varchar("wallet_address", { length: 255 }),
  virtualAccountNumber: varchar("virtual_account_number", { length: 20 }),
  virtualBankName: varchar("virtual_bank_name", { length: 255 }),
  funded: boolean("funded").default(false).notNull(),
  fundedAt: timestamp("funded_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const organizationFiatBalances = pgTable("organization_fiat_balances", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .references(() => organizations.id, { onDelete: "cascade" })
    .notNull()
    .unique(),
  currency: varchar("currency", { length: 3 }).default("NGN").notNull(),
  
  balance: bigint("balance", { mode: "bigint" }).default(sql`0`).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const kybVerifications = pgTable("kyb_verifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull()
    .unique(),
  registrationType: varchar("registration_type", { length: 255 }).notNull(),
  registrationNo: varchar("registration_no", { length: 255 }).notNull(),
  incorporationCertificatePath: varchar("incorporation_certificate_path", {
    length: 512,
  }).notNull(),
  incorporationCertificateUrl: varchar("incorporation_certificate_url", {
    length: 1024,
  }).notNull(),
  memorandumArticlePath: varchar("memorandum_article_path", {
    length: 512,
  }).notNull(),
  memorandumArticleUrl: varchar("memorandum_article_url", {
    length: 1024,
  }).notNull(),
  formC02C07Path: varchar("form_c02_c07_path", { length: 512 }),
  formC02C07Url: varchar("form_c02_c07_url", { length: 1024 }),
  status: kybStatusEnum("status").default("pending").notNull(),
  rejectionReason: text("rejection_reason"),
  rejectionCode: varchar("rejection_code", { length: 100 }),
  submittedAt: timestamp("submitted_at"),
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const contracts = pgTable(
  "contracts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    employeeId: uuid("employee_id")
      .references(() => employees.id, { onDelete: "cascade" })
      .notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    amount: integer("amount").notNull(),
    paymentType: paymentTypeEnum("payment_type").notNull(),
    contractType: contractTypeEnum("contract_type").notNull(),
    status: contractStatusEnum("status").default("pending_signature").notNull(),
    startDate: timestamp("start_date").notNull(),
    endDate: timestamp("end_date"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("contracts_organization_id_idx").on(table.organizationId),
    index("contracts_status_idx").on(table.status),
  ],
);

export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    employeeId: uuid("employee_id")
      .references(() => employees.id, { onDelete: "cascade" })
      .notNull(),
    contractId: uuid("contract_id").references(() => contracts.id, {
      onDelete: "set null",
    }),
    invoiceNo: varchar("invoice_no", { length: 255 }).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    amount: integer("amount").notNull(),
    paidIn: paymentTypeEnum("paid_in").notNull(),
    status: invoiceStatusEnum("status").default("pending").notNull(),
    issueDate: timestamp("issue_date").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("invoices_organization_id_idx").on(table.organizationId),
    index("invoices_status_idx").on(table.status),
  ],
);

export const payrollDrafts = pgTable(
  "payroll_drafts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    status: payrollDraftStatusEnum("status").default("active").notNull(),
    employeesPayload: jsonb("employees_payload")
      .default(sql`'[]'::jsonb`)
      .notNull(),
    totalAmount: integer("total_amount").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("payroll_drafts_organization_id_idx").on(table.organizationId),
    index("payroll_drafts_status_idx").on(table.status),
  ],
);

export const milestones = pgTable(
  "milestones",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    milestoneName: varchar("milestone_name", { length: 255 }).notNull(),
    amount: integer("amount").notNull(),
    dueDate: timestamp("due_date").notNull(),
    status: milestoneStatusEnum("status").default("pending").notNull(),
    employeeId: uuid("employee_id").references(() => employees.id, {
      onDelete: "cascade",
    }),
    submittedAt: timestamp("submitted_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [index("milestones_employee_id_idx").on(table.employeeId)],
);

export const timesheets = pgTable(
  "timesheets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    employeeId: uuid("employee_id")
      .references(() => employees.id, { onDelete: "cascade" })
      .notNull(),
    rate: integer("rate").notNull(),
    totalWorked: integer("total_worked").notNull(),
    totalAmount: integer("total_amount").notNull(),
    status: approvalStatusEnum("status").default("pending").notNull(),
    submittedAt: timestamp("submitted_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("timesheets_organization_id_idx").on(table.organizationId),
    index("timesheets_employee_id_idx").on(table.employeeId),
    index("timesheets_status_idx").on(table.status),
  ],
);

export const milestoneRelations = relations(milestones, (helpers: any) => ({
  employee: helpers.one(employees, {
    fields: [milestones.employeeId],
    references: [employees.id],
  }),
}));

export const timeOffRequests = pgTable(
  "time_off_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    employeeId: uuid("employee_id")
      .references(() => employees.id, { onDelete: "cascade" })
      .notNull(),
    type: timeOffTypeEnum("type").notNull(),
    startDate: timestamp("start_date").notNull(),
    endDate: timestamp("end_date").notNull(),
    reason: varchar("reason", { length: 255 }).notNull(),
    description: text("description"),
    totalDuration: integer("total_duration").notNull(),
    status: approvalStatusEnum("status").default("pending").notNull(),
    submittedAt: timestamp("submitted_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("time_off_requests_organization_id_idx").on(table.organizationId),
    index("time_off_requests_status_idx").on(table.status),
  ],
);

export const passwordResets = pgTable(
  "password_resets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("password_resets_user_id_idx").on(table.userId)],
);

export const organizationInvitations = pgTable(
  "organization_invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    invitedByUserId: uuid("invited_by_user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    email: varchar("email", { length: 255 }).notNull(),
    role: invitationRoleEnum("role").notNull(),
    token: varchar("token", { length: 255 }).notNull().unique(),
    status: invitationStatusEnum("status").default("pending").notNull(),
    message: text("message"),
    expiresAt: timestamp("expires_at").notNull(),
    acceptedAt: timestamp("accepted_at"),
    declinedAt: timestamp("declined_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("organization_invitations_organization_id_idx").on(
      table.organizationId,
    ),
    index("organization_invitations_email_idx").on(table.email),
    index("organization_invitations_token_idx").on(table.token),
    index("organization_invitations_status_idx").on(table.status),
  ],
);

export const organizationInvitationRelations = relations(
  organizationInvitations,
  (helpers: any) => ({
    organization: helpers.one(organizations, {
      fields: [organizationInvitations.organizationId],
      references: [organizations.id],
    }),
    invitedBy: helpers.one(users, {
      fields: [organizationInvitations.invitedByUserId],
      references: [users.id],
    }),
  }),
);
export const employeeRelations = relations(employees, (helpers: any) => ({
  organization: helpers.one(organizations, {
    fields: [employees.organizationId],
    references: [organizations.id],
  }),
  milestones: helpers.many(milestones),
}));

export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  event: auditEventEnum("event").notNull(),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const kybAuditLogs = pgTable(
  "kyb_audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entityType: varchar("entity_type", { length: 100 }).notNull(),
    entityId: uuid("entity_id").notNull(),
    action: varchar("action", { length: 255 }).notNull(),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("kyb_audit_logs_entity_id_idx").on(table.entityId),
    index("kyb_audit_logs_actor_id_idx").on(table.actorId),
  ],
);

export const fiatTransactions = pgTable(
  "fiat_transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    
    amount: bigint("amount", { mode: "bigint" }).notNull(),
    type: fiatTransactionTypeEnum("type").notNull(),
    status: fiatTransactionStatusEnum("status").default("pending").notNull(),
    provider: varchar("provider", { length: 255 }).notNull(),
    providerReference: varchar("provider_reference", { length: 255 })
      .notNull()
      .unique(),
    reference: varchar("reference", { length: 255 }).unique(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("fiat_transactions_organization_id_idx").on(table.organizationId),
    index("fiat_transactions_status_idx").on(table.status),
    index("fiat_transactions_type_idx").on(table.type),
  ],
);

export const fiatTransactionRelations = relations(
  fiatTransactions,
  (helpers: any) => ({
    organization: helpers.one(organizations, {
      fields: [fiatTransactions.organizationId],
      references: [organizations.id],
    }),
  }),
);


export const transactionCache = pgTable("transaction_cache", {
  hash: text("hash").primaryKey(),
  resultJson: text("result_json").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
});

export const signerAudits = pgTable("signer_audits", {
  id: uuid("id").primaryKey().defaultRandom(),
  signerPublicKey: varchar("signer_public_key", { length: 56 }).notNull(),
  transactionHash: varchar("transaction_hash", { length: 64 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("signer_audits_transaction_hash_idx").on(table.transactionHash),
]);

export const payrolls = pgTable(
  "payrolls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    status: payrollStatusEnum("status").default("draft").notNull(),
    totals: jsonb("totals"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("payrolls_organization_id_idx").on(table.organizationId),
    index("payrolls_status_idx").on(table.status),
  ]
);

export const payrollRelations = relations(payrolls, (helpers: any) => ({
  organization: helpers.one(organizations, {
    fields: [payrolls.organizationId],
    references: [organizations.id],
  }),
}));


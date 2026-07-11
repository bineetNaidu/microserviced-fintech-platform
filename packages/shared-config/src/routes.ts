/**
 * Global Machine-Readable Distributed API Route Tree Registry.
 * Centralizing this mapping tree ensures internal microservice client routing calls,
 * API Gateway proxy routes, and automated testing frameworks never drift out of sync.
 */
export const ApiRoutes = {
  /** Base routing prefixes intercepted and evaluated at the API Gateway proxy edge layers */
  ApiPrefixes: {
    Auth: '/api/auth',
    Accounts: '/api/accounts',
    Transfers: '/api/transfers',
    Users: '/api/users',
    Approvals: '/api/approvals',
    Operations: '/api/operations',
    Audit: '/api/audit',
  },

  /** Route endpoints exposed by the Authentication Service instance context */
  Auth: {
    v1: {
      Login: '/v1/login',
      Register: '/v1/register',
      Logout: '/v1/logout',
      Refresh: '/v1/refresh',
      VerifyEmail: '/v1/verify-email',
      ForgotPassword: '/v1/forgot-password',
      ResetPassword: '/v1/reset-password',
      GetSessions: '/v1/sessions',
      RevokeSession: '/v1/sessions/:sessionId',
    },
  },

  /** Route endpoints exposed by the Account Management Service instance context */
  Accounts: {
    v1: {
      Create: '/v1/create',
      GetDetails: '/v1/:accountId',
      Freeze: '/v1/:accountId/freeze',
    },
  },

  /** Route endpoints exposed by the Transfer Saga Orchestration Engine context */
  Transfers: {
    v1: {
      Initiate: '/v1/initiate',
      GetStatus: '/v1/status/:transferId',
    },
  },

  /** Route endpoints exposed by the User Management and Profile Service */
  Users: {
    v1: {
      GetProfile: '/v1/profile',
      UpdateProfile: '/v1/profile/update',
      SubmitKyc: '/v1/kyc/submit',
      GetKycStatus: '/v1/kyc/status',
    },
  },

  /** Route endpoints for Dual-Control Administrative Workflows (Maker-Checker) */
  Approvals: {
    v1: {
      CreateRequest: '/v1/requests',
      GetPending: '/v1/requests/pending',
      Review: '/v1/requests/:requestId/review',
    },
  },

  /** Route endpoints for Global Operations, Configurations, and Core Blocklists */
  Operations: {
    v1: {
      UpdateConfig: '/v1/configs',
      GetConfig: '/v1/configs/:key',
      AddToBlocklist: '/v1/blocklist',
      GetBlocklist: '/v1/blocklist',
    },
  },

  /** Route endpoints for Forensic Auditing and Compliance Query Pipelines */
  Audit: {
    v1: {
      CreateLog: '/v1/logs',
      QueryLogs: '/v1/logs/query',
      GetByCorrelationId: '/v1/logs/correlation/:correlationId',
    },
  },
} as const;

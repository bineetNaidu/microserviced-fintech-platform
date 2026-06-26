export const ApiRoutes = {
  // Base prefixes targeted by the API Gateway proxy routers
  Prefixes: {
    Auth: '/auth',
    Accounts: '/accounts',
    Transfers: '/transfers',
    Users: '/users',
  },

  // Service internal routing declarations
  Auth: {
    v1: {
      Login: '/v1/login',
      Register: '/v1/register',
      Logout: '/v1/logout',
      Refresh: '/v1/refresh',
    },
  },

  Accounts: {
    v1: {
      Create: '/v1/create',
      GetDetails: '/v1/:accountId',
      Freeze: '/v1/:accountId/freeze',
    },
  },

  Transfers: {
    v1: {
      Initiate: '/v1/initiate',
      GetStatus: '/v1/status/:transferId',
    },
  },
} as const;

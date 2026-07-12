# 🗺️ Cross-Service User Journey Flows

This document details the end-to-end, multi-service operational flows for critical actions inside the microserviced fintech platform. These diagrams and sequences trace requests as they cross the API Gateway, interact with core databases, publish/consume events via RabbitMQ, and maintain distributed transactional integrity.

---

## 1. Onboarding, Registration & Profile Provisioning

This flow illustrates how the system registers credentials and asynchronously builds the user profile across database boundaries.

```mermaid
sequenceDiagram
    autonumber
    actor Client
    participant Gateway as API Gateway
    participant Auth as Auth Service (auth_db)
    participant Broker as RabbitMQ (fintech.users)
    participant User as User Service (user_db)
    participant Notification as Notification Service

    Client->>Gateway: POST /api/v1/auth/register
    Gateway->>Auth: Proxy request (unauthenticated)

    Note over Auth: 1. Validate payload<br/>2. Hash password<br/>3. Write credentials to users table

    Auth->>Auth: Generate verification token & save

    critical Publish registration event
        Auth->>Broker: Publish "user.registered" event
    end

    Auth-->>Gateway: Response: 201 Created (Token + UUID)
    Gateway-->>Client: Response: 201 Created

    Note over Broker: Route to: user-service.profile queue

    par Async Processing
        Broker->>User: Deliver "user.registered"
        Note over User: 1. Extract shared UUID<br/>2. Open local user_db transaction<br/>3. Provision user_profiles row<br/>4. Provision user_preferences row
        User-->>Broker: ack
    and Email Delivery
        Broker->>Notification: Deliver "user.registered" (via notification-service queue)
        Note over Notification: Send verification email with token link
        Notification-->>Broker: ack
    end
```

---

## 2. Onboarding: Verification & KYC Submission

```mermaid
sequenceDiagram
    autonumber
    actor Client
    participant Gateway as API Gateway
    participant User as User Service (user_db)
    participant Broker as RabbitMQ (fintech.users)
    participant Ops as Operations Service (ops_db)

    Client->>Gateway: POST /api/v1/users/me/kyc-submissions
    Note over Gateway: 1. Validate JWT<br/>2. Inject X-User-Id header
    Gateway->>User: Proxy request (with X-User-Id)

    Note over User: Write document metadata<br/>and status 'pending' to kyc_submissions

    User->>Broker: Publish "user.kyc_submitted"
    User-->>Gateway: Response: 202 Accepted
    Gateway-->>Client: Response: 202 Accepted

    Broker->>Ops: Deliver "user.kyc_submitted"
    Note over Ops: Create manual review ticket<br/>for compliance operator (Maker-Checker)
    Ops-->>Broker: ack
```

---

## 3. Operations: KYC Maker-Checker Approval Pipeline

All status shifts to `verified` are protected by a manual verification loop:

```mermaid
sequenceDiagram
    autonumber
    actor Checker as Compliance Admin
    participant Gateway as API Gateway
    participant Ops as Operations Service (ops_db)
    participant Broker as RabbitMQ (fintech.operations)
    participant User as User Service (user_db)
    participant Account as Account Service (account_db)

    Checker->>Gateway: POST /api/v1/ops/kyc-reviews/:ticketId/approve
    Note over Gateway: 1. Validate Admin JWT<br/>2. Inject X-User-Id & X-User-Role (CHECKER)
    Gateway->>Ops: Proxy approval request

    Note over Ops: 1. Verify checker is different than maker<br/>2. Mark ticket status as 'approved'

    Ops->>Broker: Publish "operations.kyc_approved"
    Ops-->>Gateway: Response: 200 OK
    Gateway-->>Checker: Response: 200 OK

    par Async Profile Update
        Broker->>User: Deliver "operations.kyc_approved"
        Note over User: 1. Transition kyc_status to 'verified'<br/>2. Set kyc_verified_at timestamp
        User->>Broker: Publish "user.kyc_status_changed"
        User-->>Broker: ack
    and Async Account Provisioning
        Broker->>User: (Delivered to Account Service)
        Note over Account: Auto-create initial default<br/>Checking Account for the verified identity
        Account-->>Broker: ack
    end
```

---

## 4. Financial Transactions: The Transfer Saga Pipeline

Because accounts and balance journals reside in different databases, transfer orchestrations use an event-driven Saga pipeline.

```mermaid
sequenceDiagram
    autonumber
    actor Client
    participant Gateway as API Gateway
    participant Transfer as Transfer Service (transfer_db)
    participant Broker as RabbitMQ (fintech.transfers)
    participant Ledger as Ledger Service (ledger_db)
    participant Account as Account Service (account_db)

    Client->>Gateway: POST /api/v1/transfers
    Note over Gateway: 1. Verify JWT & blocklist<br/>2. Inject X-User-Id header
    Gateway->>Transfer: Forward transfer request

    Note over Transfer: 1. Open Saga transaction log<br/>2. Write local transaction with status 'PENDING'

    Transfer->>Broker: Publish "transfer.initiated" event
    Transfer-->>Gateway: Response: 202 Accepted (Saga UUID)
    Gateway-->>Client: Response: 202 Accepted

    Broker->>Ledger: Deliver "transfer.initiated"
    Note over Ledger: Double-Entry Check:<br/>1. Verify source balance (computed sum)<br/>2. Write DEBIT ledger record<br/>3. Write CREDIT ledger record

    alt Ledger Successful (Happy Path)
        Ledger->>Broker: Publish "ledger.transfer_posted"
        Ledger-->>Broker: ack

        Broker->>Transfer: Deliver "ledger.transfer_posted"
        Note over Transfer: Update saga state to 'COMPLETED'
        Transfer-->>Broker: ack

        Broker->>Account: Deliver "ledger.transfer_posted"
        Note over Account: Evict or update local balance caches<br/>for source and destination accounts
        Account-->>Broker: ack

    else Ledger Rejected (Insufficient Funds / Frozen Account)
        Ledger->>Broker: Publish "ledger.transfer_failed" (with failure code)
        Ledger-->>Broker: ack

        Broker->>Transfer: Deliver "ledger.transfer_failed"
        Note over Transfer: 1. Execute compensation actions<br/>2. Transition local saga state to 'FAILED'
        Transfer-->>Broker: ack
    end
```

---

## 5. Security & Session Termination: Logout Revocation Loop

When a user logs out, the JWT session is blacklisted immediately at the edge layer without querying central databases on subsequent requests.

```mermaid
sequenceDiagram
    autonumber
    actor Client
    participant Gateway as API Gateway
    participant Auth as Auth Service (auth_db)
    participant Redis as Shared Redis Cluster

    Client->>Gateway: POST /api/v1/auth/logout
    Note over Gateway: 1. Verify Signature (RS256)<br/>2. Extract token "jti" (Unique ID) and "exp"
    Gateway->>Auth: Forward logout request (contains JTI/expiry)

    Note over Auth: Mark session revoked in sessions table

    Auth->>Redis: Set Key: "jti:{tokenJti}" with TTL (token_remaining_expiry)
    Auth-->>Gateway: Response: 200 OK
    Gateway-->>Client: Response: 200 OK

    Note over Client: Subsequent Request with Same Token
    Client->>Gateway: GET /api/v1/accounts
    Note over Gateway: 1. Gateway parses JWT JTI<br/>2. Pings Redis for JTI key
    Redis-->>Gateway: Key exists (Blacklisted JTI found)
    Note over Gateway: Fail-Closed Policy: Instantly drop connection
    Gateway-->>Client: Response: 401 Unauthorized (Session Expired)
```

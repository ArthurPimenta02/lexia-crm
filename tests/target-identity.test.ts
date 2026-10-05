import assert from "node:assert/strict";
import test from "node:test";

import {
  assertConnectedDatabaseTarget,
  assertIsolatedRemoteIdentity,
  getPostgresTarget,
  validateIndexOperationTarget,
  validateIsolatedTestTarget,
} from "../scripts/lib/target-identity.mjs";

const testRef = "aaaaaaaaaaaaaaaaaaaa";
const productionRef = "pppppppppppppppppppp";

test("isolated target is bound to its explicit ref and production ref", () => {
  assert.deepEqual(
    validateIsolatedTestTarget({
      anonKey: "publishable-test-key",
      applicationUrl: "https://ssssssssssssssssssss.supabase.co",
      confirmation: `I_UNDERSTAND_THIS_IS_DISPOSABLE:${testRef}`,
      productionProjectRef: productionRef,
      protectedProjectRefs: "ssssssssssssssssssss",
      serviceRoleKey: "secret-test-key",
      testProjectRef: testRef,
      testUrl: `https://${testRef}.supabase.co`,
    }),
    { productionProjectRef: productionRef, testProjectRef: testRef },
  );

  assert.throws(
    () =>
      validateIsolatedTestTarget({
        anonKey: "publishable-test-key",
        confirmation: `I_UNDERSTAND_THIS_IS_DISPOSABLE:${productionRef}`,
        productionProjectRef: productionRef,
        serviceRoleKey: "secret-test-key",
        testProjectRef: productionRef,
        testUrl: `https://${productionRef}.supabase.co`,
      }),
    /protected/,
  );
});

test("isolated target rejects a URL or confirmation for another project", () => {
  assert.throws(
    () =>
      validateIsolatedTestTarget({
        anonKey: "publishable-test-key",
        confirmation: `I_UNDERSTAND_THIS_IS_DISPOSABLE:${testRef}`,
        productionProjectRef: productionRef,
        serviceRoleKey: "secret-test-key",
        testProjectRef: testRef,
        testUrl: "https://bbbbbbbbbbbbbbbbbbbb.supabase.co",
      }),
    /does not match/,
  );

  assert.throws(
    () =>
      validateIsolatedTestTarget({
        anonKey: "publishable-test-key",
        confirmation: "I_UNDERSTAND_THIS_IS_DISPOSABLE",
        productionProjectRef: productionRef,
        serviceRoleKey: "secret-test-key",
        testProjectRef: testRef,
        testUrl: `https://${testRef}.supabase.co`,
      }),
    /must equal/,
  );
});

test("isolated target rejects missing keys and malformed protected refs", () => {
  const baseInput = {
    anonKey: "publishable-test-key",
    confirmation: `I_UNDERSTAND_THIS_IS_DISPOSABLE:${testRef}`,
    productionProjectRef: productionRef,
    serviceRoleKey: "secret-test-key",
    testProjectRef: testRef,
    testUrl: `https://${testRef}.supabase.co`,
  };

  assert.throws(
    () => validateIsolatedTestTarget({ ...baseInput, anonKey: "" }),
    /ANON_KEY is required/,
  );
  assert.throws(
    () => validateIsolatedTestTarget({ ...baseInput, serviceRoleKey: "" }),
    /SERVICE_ROLE_KEY is required/,
  );
  assert.throws(
    () =>
      validateIsolatedTestTarget({
        ...baseInput,
        protectedProjectRefs: "not-a-project-ref!",
      }),
    /Protected Supabase project ref/,
  );
});

test("isolated target requires a matching disposable remote marker", () => {
  assert.doesNotThrow(() =>
    assertIsolatedRemoteIdentity(
      {
        disposable: true,
        environment: "isolated_test",
        project_ref: testRef,
      },
      testRef,
    ),
  );

  assert.throws(
    () =>
      assertIsolatedRemoteIdentity(
        {
          disposable: false,
          environment: "staging",
          project_ref: testRef,
        },
        testRef,
      ),
    /missing or mismatched/,
  );
});

test("index operation validates the project encoded in the DB URL", () => {
  const target = validateIndexOperationTarget({
    confirmation: `CREATE_PROFILE_UNIQUE_INDEX:staging:${testRef}`,
    databaseUrl: `postgresql://postgres:fake@db.${testRef}.supabase.co/postgres`,
    environment: "staging",
    expectedProjectRef: testRef,
    productionProjectRef: productionRef,
  });

  assert.equal(target.projectRef, testRef);
  assert.equal(target.databaseName, "postgres");
  assert.equal(target.connectionMode, "direct");
  assert.equal(target.isProduction, false);

  assert.throws(
    () =>
      validateIndexOperationTarget({
        confirmation: `CREATE_PROFILE_UNIQUE_INDEX:staging:${testRef}`,
        databaseUrl:
          `postgresql://postgres:fake@db.${productionRef}.supabase.co/postgres`,
        environment: "staging",
        expectedProjectRef: testRef,
        productionProjectRef: productionRef,
      }),
    /does not match/,
  );

  const sessionTarget = validateIndexOperationTarget({
    confirmation: `CREATE_PROFILE_UNIQUE_INDEX:isolated_test:${testRef}`,
    databaseUrl:
      `postgresql://postgres.${testRef}:fake@aws-0-us-west-2.pooler.supabase.com:5432/postgres`,
    environment: "isolated_test",
    expectedHostname: "aws-0-us-west-2.pooler.supabase.com",
    expectedProjectRef: testRef,
    productionProjectRef: productionRef,
  });
  assert.equal(sessionTarget.connectionMode, "session_pooler");
  assert.equal(sessionTarget.projectRef, testRef);

  assert.throws(
    () =>
      getPostgresTarget(
        `postgresql://postgres.${testRef}:fake@aws-0-us-west-2.pooler.supabase.com:6543/postgres`,
      ),
    /Transaction pooler port 6543 is not allowed/,
  );
  assert.throws(
    () =>
      validateIndexOperationTarget({
        confirmation: `CREATE_PROFILE_UNIQUE_INDEX:isolated_test:${testRef}`,
        databaseUrl:
          `postgresql://postgres.bbbbbbbbbbbbbbbbbbbb:fake@aws-0-us-west-2.pooler.supabase.com:5432/postgres`,
        environment: "isolated_test",
        expectedHostname: "aws-0-us-west-2.pooler.supabase.com",
        expectedProjectRef: testRef,
        productionProjectRef: productionRef,
      }),
    /does not match/,
  );
  assert.throws(
    () =>
      validateIndexOperationTarget({
        confirmation: `CREATE_PROFILE_UNIQUE_INDEX:isolated_test:${testRef}`,
        databaseUrl:
          `postgresql://postgres.${testRef}:fake@aws-0-us-west-2.pooler.supabase.com:5432/postgres`,
        environment: "isolated_test",
        expectedHostname: "aws-0-eu-west-1.pooler.supabase.com",
        expectedProjectRef: testRef,
        productionProjectRef: productionRef,
      }),
    /EXPECTED_HOST/,
  );
});

test("production index target requires a project-bound second approval", () => {
  const input = {
    confirmation: `CREATE_PROFILE_UNIQUE_INDEX:production:${productionRef}`,
    databaseUrl:
      `postgresql://postgres:fake@db.${productionRef}.supabase.co/postgres`,
    environment: "production",
    expectedProjectRef: productionRef,
    productionProjectRef: productionRef,
  };

  assert.throws(() => validateIndexOperationTarget(input), /protected/);
  assert.equal(
    validateIndexOperationTarget({
      ...input,
      productionApproval:
        `I_APPROVE_PRODUCTION_PROFILE_INDEX:${productionRef}`,
    }).isProduction,
    true,
  );
});

test("connected DB identity must match URL database and resolved server", () => {
  const parsed = getPostgresTarget(
    `postgresql://postgres:fake@db.${testRef}.supabase.co/postgres`,
  );
  assert.equal(parsed.projectRef, testRef);

  assert.doesNotThrow(() =>
    assertConnectedDatabaseTarget({
      actualDatabaseName: "postgres",
      actualServerAddress: "::ffff:192.0.2.20",
      connectionMode: "direct",
      expectedDatabaseName: "postgres",
      resolvedAddresses: ["192.0.2.20"],
    }),
  );
  assert.throws(
    () =>
      assertConnectedDatabaseTarget({
        actualDatabaseName: "postgres",
        actualServerAddress: "192.0.2.99",
        connectionMode: "direct",
        expectedDatabaseName: "postgres",
        resolvedAddresses: ["192.0.2.20"],
      }),
    /server address/,
  );

  assert.doesNotThrow(() =>
    assertConnectedDatabaseTarget({
      actualDatabaseName: "postgres",
      actualServerAddress: "10.0.0.10",
      connectionMode: "session_pooler",
      expectedDatabaseName: "postgres",
      resolvedAddresses: ["192.0.2.20"],
    }),
  );
});

test("session pooler remains isolated-only and cannot weaken TLS", () => {
  const sessionUrl =
    `postgresql://postgres.${testRef}:fake@aws-0-us-west-2.pooler.supabase.com:5432/postgres`;

  assert.throws(
    () =>
      validateIndexOperationTarget({
        confirmation: `CREATE_PROFILE_UNIQUE_INDEX:production:${testRef}`,
        databaseUrl: sessionUrl,
        environment: "production",
        expectedHostname: "aws-0-us-west-2.pooler.supabase.com",
        expectedProjectRef: testRef,
        productionProjectRef: productionRef,
      }),
    /isolated_test/,
  );

  assert.throws(
    () => getPostgresTarget(`${sessionUrl}?sslmode=disable`),
    /cannot weaken TLS/,
  );
});

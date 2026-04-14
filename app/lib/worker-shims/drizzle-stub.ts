/**
 * Stub for drizzle-orm / postgres / drizzle-orm/pg-core in Cloudflare Workers / Oxygen builds.
 * Database code is admin-only and never executes in worker runtime.
 * This shim allows the bundle to load without "No such module" errors.
 */

const stubError = () => {
  throw new Error('[Oxygen Worker] Database modules are not available in worker runtime.');
};

const proxy: any = new Proxy(function () {}, {
  get: () => proxy,
  apply: stubError,
  construct: stubError,
});

const s: any = proxy;

export default s;

// drizzle-orm core
export const drizzle = s;
export const sql = s;
export const eq = s;
export const ne = s;
export const and = s;
export const or = s;
export const not = s;
export const gt = s;
export const gte = s;
export const lt = s;
export const lte = s;
export const desc = s;
export const asc = s;
export const inArray = s;
export const notInArray = s;
export const isNull = s;
export const isNotNull = s;
export const exists = s;
export const between = s;
export const like = s;
export const ilike = s;
export const relations = s;
export const count = s;
export const sum = s;
export const avg = s;
export const min = s;
export const max = s;
export const getTableColumns = s;
export const getTableName = s;

// drizzle-orm/pg-core
export const pgTable = s;
export const pgSchema = s;
export const pgEnum = s;
export const serial = s;
export const bigserial = s;
export const text = s;
export const varchar = s;
export const char = s;
export const integer = s;
export const bigint = s;
export const smallint = s;
export const numeric = s;
export const decimal = s;
export const real = s;
export const doublePrecision = s;
export const boolean = s;
export const date = s;
export const time = s;
export const timestamp = s;
export const interval = s;
export const json = s;
export const jsonb = s;
export const uuid = s;
export const inet = s;
export const cidr = s;
export const macaddr = s;
export const index = s;
export const uniqueIndex = s;
export const primaryKey = s;
export const foreignKey = s;
export const check = s;
export const unique = s;
export const customType = s;
export const PgDialect = s;

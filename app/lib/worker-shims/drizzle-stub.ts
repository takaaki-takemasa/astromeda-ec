/**
 * Drizzle ORM / postgres lazy stub — Oxygen/Cloudflare Workers 用
 *
 * Workers 環境では drizzle-orm は使用しない (InMemory storage のみ)。
 * resolve.alias でこのスタブに差し替え、worker bundle から Node.js 依存を排除する。
 *
 * 全 export は無害な lazy Proxy を返す:
 * - property access → 新しい Proxy を返す (chain 可能)
 * - function call → 新しい Proxy を返す (compose 可能)
 * - constructor call → 新しい Proxy を返す
 * - throw しない、side effect なし
 *
 * Oxygen では storage.ts が InMemory adapter を選ぶため、
 * drizzle の実コードパスには到達しない = lazy proxy で問題なし。
 */

const createLazyProxy = (name: string): any =>
  new Proxy(function () {}, {
    get: (_target, prop) => {
      if (prop === Symbol.toPrimitive) return () => '';
      if (prop === 'toString' || prop === 'valueOf') return () => `[drizzle-stub:${name}]`;
      if (prop === Symbol.iterator) return undefined;
      return createLazyProxy(`${name}.${String(prop)}`);
    },
    apply: () => createLazyProxy(name),
    construct: () => createLazyProxy(name),
    has: () => true,
    set: () => true,
    deleteProperty: () => true,
  });

const s: any = createLazyProxy('drizzle-orm');

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

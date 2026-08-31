import crypto from 'node:crypto';
import pg from 'pg';

const { Pool } = pg;

// 根据环境变量决定是否启用 SSL（云数据库如阿里云 RDS 通常需要）
const sslConfig = process.env.DB_SSL === 'true'
  ? { rejectUnauthorized: false }
  : false;

const pool = new Pool({
  host: process.env.DB_HOST || 'postgres',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'qr_label_matching',
  user: process.env.DB_USER || 'qruser',
  password: process.env.DB_PASS || 'qrpass2026',
  ssl: sslConfig,
  max: 10,
  idleTimeoutMillis: 30000,
});

// ── 启动屏障：确保建表完成后再执行任何查询 ────────────────
// 避免容器刚启动时 API 首次请求撞上尚未完成的建表（竞态 500）。
const rawConnect = pool.connect.bind(pool);
const rawQuery = pool.query.bind(pool);

let dbReadyPromise = null;
function initDb() {
  if (!dbReadyPromise) {
    dbReadyPromise = ensureTables().catch((err) => {
      console.error('DB init failed:', err);
      throw err;
    });
  }
  return dbReadyPromise;
}

// 包装 connect/query：所有数据库操作先等建表完成
pool.connect = (...args) => initDb().then(() => rawConnect(...args));
pool.query = (...args) => initDb().then(() => rawQuery(...args));

// ── Schema Init ────────────────────────────────────────────

async function ensureTables() {
  const client = await rawConnect();
  try {
    await client.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS supplier (
        supplier_id VARCHAR(50) PRIMARY KEY,
        supplier_name VARCHAR(100) NOT NULL DEFAULT '',
        supplier_description VARCHAR(100) NOT NULL DEFAULT '',
        item_num VARCHAR(100) DEFAULT '',
        lc VARCHAR(50) DEFAULT '',
        qty INTEGER DEFAULT 0,
        dc VARCHAR(20) DEFAULT '',
        coo VARCHAR(10) DEFAULT '',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    // ── supplier 表注解 ──
    await client.query(`COMMENT ON TABLE  supplier IS '供应商标签表'`);
    await client.query(`COMMENT ON COLUMN supplier.supplier_id           IS '供应商ID（主键，扫码对应的唯一标识）'`);
    await client.query(`COMMENT ON COLUMN supplier.supplier_name         IS '供应商名称'`);
    await client.query(`COMMENT ON COLUMN supplier.supplier_description  IS '供应商描述（物料描述/零件号，用于匹配买家）'`);
    await client.query(`COMMENT ON COLUMN supplier.item_num              IS '物料编号（供应商内部物料编码）'`);
    await client.query(`COMMENT ON COLUMN supplier.lc                    IS 'LC码（批次号/生产批号）'`);
    await client.query(`COMMENT ON COLUMN supplier.qty                   IS '数量'`);
    await client.query(`COMMENT ON COLUMN supplier.dc                    IS '日期码（Date Code）'`);
    await client.query(`COMMENT ON COLUMN supplier.coo                   IS '原产国（Country of Origin）'`);
    await client.query(`COMMENT ON COLUMN supplier.created_at            IS '创建时间'`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS buyer (
        buyer_id VARCHAR(20) PRIMARY KEY,
        buyer_name VARCHAR(100) NOT NULL DEFAULT '',
        buyer_description VARCHAR(100) NOT NULL DEFAULT '',
        supplier_description_ref VARCHAR(100) NOT NULL DEFAULT '',
        qty INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    // ── buyer 表注解 ──
    await client.query(`COMMENT ON TABLE  buyer IS '买家标签表'`);
    await client.query(`COMMENT ON COLUMN buyer.buyer_id                 IS '买家ID（主键）'`);
    await client.query(`COMMENT ON COLUMN buyer.buyer_name               IS '买家名称'`);
    await client.query(`COMMENT ON COLUMN buyer.buyer_description        IS '买家描述（买家内部编码，扫码识别用）'`);
    await client.query(`COMMENT ON COLUMN buyer.supplier_description_ref IS '供应商描述引用（映射到supplier.supplier_description）'`);
    await client.query(`COMMENT ON COLUMN buyer.qty                      IS '数量'`);
    await client.query(`COMMENT ON COLUMN buyer.created_at               IS '创建时间'`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS scan_log (
        log_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        session_id VARCHAR(100),
        scan_type VARCHAR(20) NOT NULL CHECK (scan_type IN ('supplier','buyer')),
        decoded_description VARCHAR(100),
        match_result VARCHAR(20) CHECK (match_result IN ('match','no_match','pending')),
        scanned_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    // ── scan_log 表注解 ──
    await client.query(`COMMENT ON TABLE  scan_log IS '扫描日志表（审计记录）'`);
    await client.query(`COMMENT ON COLUMN scan_log.log_id               IS '日志ID（UUID主键）'`);
    await client.query(`COMMENT ON COLUMN scan_log.session_id           IS '会话ID（关联同一轮供-扫-验操作）'`);
    await client.query(`COMMENT ON COLUMN scan_log.scan_type            IS '扫描类型（supplier=供应商扫描, buyer=买家扫描）'`);
    await client.query(`COMMENT ON COLUMN scan_log.decoded_description  IS '解码后的描述文字'`);
    await client.query(`COMMENT ON COLUMN scan_log.match_result         IS '匹配结果（match=匹配, no_match=不匹配, pending=待验证）'`);
    await client.query(`COMMENT ON COLUMN scan_log.scanned_at           IS '扫描时间'`);

    // ── delivery 出库表 ──
    await client.query(`
      CREATE TABLE IF NOT EXISTS delivery (
        delivery_no              VARCHAR(50)  NOT NULL,
        delivery_line_no         VARCHAR(20)  NOT NULL,
        order_no                 VARCHAR(50)  DEFAULT '',
        order_line_no            VARCHAR(20)  DEFAULT '',
        line_status              VARCHAR(20)  DEFAULT '',
        factory                  VARCHAR(50)  DEFAULT '',
        erp_order_no             VARCHAR(50)  DEFAULT '',
        material_code            VARCHAR(100) DEFAULT '',
        material_desc            VARCHAR(200) DEFAULT '',
        batch_no                 VARCHAR(50)  DEFAULT '',
        production_batch         VARCHAR(50)  DEFAULT '',
        delivery_qty             INTEGER      DEFAULT 0,
        min_pack_qty             INTEGER      DEFAULT 0,
        qty_per_box              INTEGER      DEFAULT 0,
        qty_per_pallet           INTEGER      DEFAULT 0,
        received_qty             INTEGER      DEFAULT 0,
        logistics_company        VARCHAR(100) DEFAULT '',
        logistics_no             VARCHAR(100) DEFAULT '',
        plate_no                 VARCHAR(30)  DEFAULT '',
        vehicle_type             VARCHAR(30)  DEFAULT '',
        production_date          DATE,
        source_type              VARCHAR(50)  DEFAULT '',
        delivery_plan_no         VARCHAR(50)  DEFAULT '',
        delivery_plan_line_no    VARCHAR(20)  DEFAULT '',
        wms_qc_result            VARCHAR(50)  DEFAULT '',
        supplier_remark          TEXT         DEFAULT '',
        buyer_remark             TEXT         DEFAULT '',
        actual_receive_factory   VARCHAR(50)  DEFAULT '',
        actual_receive_warehouse VARCHAR(50)  DEFAULT '',
        is_printed               BOOLEAN      DEFAULT FALSE,
        status                   INTEGER      DEFAULT 0,
        created_at               TIMESTAMPTZ  DEFAULT NOW(),
        updated_at               TIMESTAMPTZ  DEFAULT NOW(),
        PRIMARY KEY (delivery_no, delivery_line_no)
      )
    `);

    // ── delivery 表注解 ──
    await client.query(`COMMENT ON TABLE  delivery IS '出库发货单表'`);
    await client.query(`COMMENT ON COLUMN delivery.delivery_no            IS '发货单号'`);
    await client.query(`COMMENT ON COLUMN delivery.delivery_line_no       IS '发货单行号'`);
    await client.query(`COMMENT ON COLUMN delivery.order_no               IS '订单号'`);
    await client.query(`COMMENT ON COLUMN delivery.order_line_no          IS '订单行号'`);
    await client.query(`COMMENT ON COLUMN delivery.line_status            IS '行状态'`);
    await client.query(`COMMENT ON COLUMN delivery.factory                IS '工厂'`);
    await client.query(`COMMENT ON COLUMN delivery.erp_order_no           IS 'ERP订单号'`);
    await client.query(`COMMENT ON COLUMN delivery.material_code          IS '物料编码'`);
    await client.query(`COMMENT ON COLUMN delivery.material_desc          IS '物料描述'`);
    await client.query(`COMMENT ON COLUMN delivery.batch_no               IS '批次号'`);
    await client.query(`COMMENT ON COLUMN delivery.production_batch       IS '生产批次'`);
    await client.query(`COMMENT ON COLUMN delivery.delivery_qty           IS '发货数量'`);
    await client.query(`COMMENT ON COLUMN delivery.min_pack_qty           IS '最小包装数量'`);
    await client.query(`COMMENT ON COLUMN delivery.qty_per_box            IS '每箱数量'`);
    await client.query(`COMMENT ON COLUMN delivery.qty_per_pallet         IS '每托数量'`);
    await client.query(`COMMENT ON COLUMN delivery.received_qty           IS '收货数量'`);
    await client.query(`COMMENT ON COLUMN delivery.logistics_company      IS '物流公司'`);
    await client.query(`COMMENT ON COLUMN delivery.logistics_no           IS '物流单号'`);
    await client.query(`COMMENT ON COLUMN delivery.plate_no               IS '车牌号'`);
    await client.query(`COMMENT ON COLUMN delivery.vehicle_type           IS '车型'`);
    await client.query(`COMMENT ON COLUMN delivery.production_date        IS '生产日期'`);
    await client.query(`COMMENT ON COLUMN delivery.source_type            IS '来源类型'`);
    await client.query(`COMMENT ON COLUMN delivery.delivery_plan_no       IS '交货计划单号'`);
    await client.query(`COMMENT ON COLUMN delivery.delivery_plan_line_no  IS '交货计划单行号'`);
    await client.query(`COMMENT ON COLUMN delivery.wms_qc_result          IS 'WMS质检结果'`);
    await client.query(`COMMENT ON COLUMN delivery.supplier_remark        IS '供方备注'`);
    await client.query(`COMMENT ON COLUMN delivery.buyer_remark           IS '需方备注'`);
    await client.query(`COMMENT ON COLUMN delivery.actual_receive_factory IS '实际收货工厂'`);
    await client.query(`COMMENT ON COLUMN delivery.actual_receive_warehouse IS '实际收货仓库'`);
    await client.query(`COMMENT ON COLUMN delivery.is_printed             IS '是否已打印'`);
    await client.query(`COMMENT ON COLUMN delivery.status                 IS '状态（0=正常, 1=禁用）'`);
    await client.query(`COMMENT ON COLUMN delivery.created_at             IS '创建时间'`);
    await client.query(`COMMENT ON COLUMN delivery.updated_at             IS '更新时间'`);

    // migration: 给已有表添加 status 列
    await client.query(`ALTER TABLE delivery ADD COLUMN IF NOT EXISTS status INTEGER DEFAULT 0`);

    // ── indexes ──
    await client.query(`CREATE INDEX IF NOT EXISTS idx_delivery_order ON delivery(order_no);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_delivery_material ON delivery(material_code);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_delivery_logistics ON delivery(logistics_no);`);

    // ── material_mapping 供应商料号 ↔ 客户料号映射表 ──
    await client.query(`
      CREATE TABLE IF NOT EXISTS material_mapping (
        id SERIAL PRIMARY KEY,
        supplier_material_code VARCHAR(100) NOT NULL,
        customer_material_code VARCHAR(100) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`COMMENT ON TABLE  material_mapping IS '供应商料号与客户料号映射表'`);
    await client.query(`COMMENT ON COLUMN material_mapping.id IS '自增主键'`);
    await client.query(`COMMENT ON COLUMN material_mapping.supplier_material_code IS '供应商料号'`);
    await client.query(`COMMENT ON COLUMN material_mapping.customer_material_code IS '客户料号'`);
    await client.query(`COMMENT ON COLUMN material_mapping.created_at IS '创建时间'`);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_material_mapping_customer ON material_mapping(customer_material_code);`);

    // ── label_match_log 标签匹配记录表（买家 + 供应商双向信息）──
    await client.query(`
      CREATE TABLE IF NOT EXISTS label_match_log (
        log_id                    VARCHAR(100) PRIMARY KEY,
        buyer_material_code       VARCHAR(100) DEFAULT '',
        buyer_lot                 VARCHAR(50)  DEFAULT '',
        buyer_qty                 INTEGER       DEFAULT 0,
        buyer_production_date     DATE,
        supplier_material_code    VARCHAR(100) DEFAULT '',
        supplier_lot              VARCHAR(50)  DEFAULT '',
        supplier_qty              INTEGER       DEFAULT 0,
        supplier_production_date  DATE,
        created_at                TIMESTAMP    DEFAULT (NOW() AT TIME ZONE 'Asia/Shanghai')
      )
    `);
    // 兼容：如果之前已按 SERIAL 创建，迁移为字符串主键
    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'label_match_log' AND column_name = 'log_id'
            AND data_type = 'integer'
        ) THEN
          ALTER TABLE label_match_log ALTER COLUMN log_id DROP DEFAULT;
          DROP SEQUENCE IF EXISTS label_match_log_log_id_seq;
          ALTER TABLE label_match_log ALTER COLUMN log_id TYPE VARCHAR(100) USING log_id::TEXT;
        END IF;
      END $$;
    `);
    // 将 created_at 改为本地北京时间存储（不带时区），兼容已有列
    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'label_match_log' AND column_name = 'created_at'
            AND data_type = 'timestamp with time zone'
        ) THEN
          ALTER TABLE label_match_log
            ALTER COLUMN created_at TYPE TIMESTAMP,
            ALTER COLUMN created_at SET DEFAULT (NOW() AT TIME ZONE 'Asia/Shanghai');
        END IF;
      END $$;
    `);
    await client.query(`COMMENT ON TABLE  label_match_log IS '标签匹配记录表（买家与供应商双向信息）'`);
    await client.query(`COMMENT ON COLUMN label_match_log.log_id                   IS '日志ID（主键，取自供应商原始数据第五段）'`);
    await client.query(`COMMENT ON COLUMN label_match_log.buyer_material_code      IS '买家物料编码'`);
    await client.query(`COMMENT ON COLUMN label_match_log.buyer_lot                IS '买家LOT'`);
    await client.query(`COMMENT ON COLUMN label_match_log.buyer_qty                IS '买家数量'`);
    await client.query(`COMMENT ON COLUMN label_match_log.buyer_production_date    IS '买家生产日期'`);
    await client.query(`COMMENT ON COLUMN label_match_log.supplier_material_code   IS '供应商物料编码'`);
    await client.query(`COMMENT ON COLUMN label_match_log.supplier_lot             IS '供应商LOT'`);
    await client.query(`COMMENT ON COLUMN label_match_log.supplier_qty             IS '供应商数量'`);
    await client.query(`COMMENT ON COLUMN label_match_log.supplier_production_date IS '供应商生产日期'`);
    await client.query(`COMMENT ON COLUMN label_match_log.created_at              IS '创建时间'`);

  } finally {
    client.release();
  }
}

// ── Helpers ────────────────────────────────────────────────

function supplierRow(r) {
  return { sid: r.supplier_id, sn: r.supplier_name, sd: r.supplier_description,
    in_: r.item_num, lc: r.lc, qty: r.qty, dc: r.dc, coo: r.coo };
}

function buyerRow(r) {
  return { bid: r.buyer_id, bn: r.buyer_name, bd: r.buyer_description,
    ref: r.supplier_description_ref, qty: r.qty };
}

// ── Suppliers ──────────────────────────────────────────────

export async function getSuppliers() {
  const { rows } = await pool.query('SELECT * FROM supplier ORDER BY created_at');
  return rows.map(supplierRow);
}

export async function findSupplierBySid(sid) {
  const { rows } = await pool.query('SELECT * FROM supplier WHERE supplier_id = $1', [sid]);
  return rows.length ? supplierRow(rows[0]) : null;
}

export async function findSupplierByDescription(sd) {
  const { rows } = await pool.query('SELECT * FROM supplier WHERE supplier_description = $1', [sd]);
  return rows.length ? supplierRow(rows[0]) : null;
}

export async function createSupplier(data) {
  const sid = (data.sid || '').trim();
  if (!sid) return { error: 'sid is required' };
  const existing = await findSupplierBySid(sid);
  if (existing) return { error: `Supplier ${sid} already exists` };

  await pool.query(
    `INSERT INTO supplier (supplier_id,supplier_name,supplier_description,item_num,lc,qty,dc,coo)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [sid, data.sn || '', data.sd || '', data.in_ || '', data.lc || '',
     parseInt(data.qty, 10) || 0, data.dc || '', data.coo || '']
  );
  return { data: await findSupplierBySid(sid) };
}

export async function updateSupplier(sid, data) {
  const existing = await findSupplierBySid(sid);
  if (!existing) return { error: 'Supplier not found' };

  const fields = { sn: 'supplier_name', sd: 'supplier_description',
    in_: 'item_num', lc: 'lc', qty: 'qty', dc: 'dc', coo: 'coo' };
  const sets = [];
  const vals = [];
  let idx = 1;
  for (const [key, col] of Object.entries(fields)) {
    if (data[key] !== undefined) {
      sets.push(`${col} = $${idx++}`);
      vals.push(key === 'qty' ? (parseInt(data[key], 10) || 0) : data[key]);
    }
  }
  if (sets.length > 0) {
    vals.push(sid);
    await pool.query(`UPDATE supplier SET ${sets.join(', ')} WHERE supplier_id = $${idx}`, vals);
  }
  return { data: await findSupplierBySid(sid) };
}

export async function deleteSupplier(sid) {
  const res = await pool.query('DELETE FROM supplier WHERE supplier_id = $1', [sid]);
  if (res.rowCount === 0) return { error: 'Supplier not found' };
  return { ok: true };
}

// ── Buyers ─────────────────────────────────────────────────

export async function getBuyers(supplierDesc) {
  let rows;
  if (supplierDesc) {
    const res = await pool.query('SELECT * FROM buyer WHERE supplier_description_ref = $1 ORDER BY created_at', [supplierDesc]);
    rows = res.rows;
  } else {
    const res = await pool.query('SELECT * FROM buyer ORDER BY created_at');
    rows = res.rows;
  }
  return rows.map(buyerRow);
}

export async function findBuyerByBid(bid) {
  const { rows } = await pool.query('SELECT * FROM buyer WHERE buyer_id = $1', [bid]);
  return rows.length ? buyerRow(rows[0]) : null;
}

export async function createBuyer(data) {
  const bid = (data.bid || '').trim();
  if (!bid) return { error: 'bid is required' };
  const existing = await findBuyerByBid(bid);
  if (existing) return { error: `Buyer ${bid} already exists` };

  await pool.query(
    `INSERT INTO buyer (buyer_id,buyer_name,buyer_description,supplier_description_ref,qty)
     VALUES ($1,$2,$3,$4,$5)`,
    [bid, data.bn || '', data.bd || '', data.ref || '', parseInt(data.qty, 10) || 0]
  );
  return { data: await findBuyerByBid(bid) };
}

export async function updateBuyer(bid, data) {
  const existing = await findBuyerByBid(bid);
  if (!existing) return { error: 'Buyer not found' };

  const fields = { bn: 'buyer_name', bd: 'buyer_description', ref: 'supplier_description_ref', qty: 'qty' };
  const sets = [];
  const vals = [];
  let idx = 1;
  for (const [key, col] of Object.entries(fields)) {
    if (data[key] !== undefined) {
      sets.push(`${col} = $${idx++}`);
      vals.push(key === 'qty' ? (parseInt(data[key], 10) || 0) : data[key]);
    }
  }
  if (sets.length > 0) {
    vals.push(bid);
    await pool.query(`UPDATE buyer SET ${sets.join(', ')} WHERE buyer_id = $${idx}`, vals);
  }
  return { data: await findBuyerByBid(bid) };
}

export async function deleteBuyer(bid) {
  const res = await pool.query('DELETE FROM buyer WHERE buyer_id = $1', [bid]);
  if (res.rowCount === 0) return { error: 'Buyer not found' };
  return { ok: true };
}

// ── Scan Operations ────────────────────────────────────────

export async function createSupplierScan({ sid, supplierDescription, sessionId }) {
  const supplier = await findSupplierBySid(sid) || await findSupplierByDescription(supplierDescription);
  if (!supplier) return null;

  const currentSessionId = sessionId || crypto.randomUUID();
  const matches = await getBuyers(supplier.sd);

  await pool.query(
    `INSERT INTO scan_log (session_id, scan_type, decoded_description, match_result)
     VALUES ($1,$2,$3,$4)`,
    [currentSessionId, 'supplier', supplier.sd, 'pending']
  );

  return { sessionId: currentSessionId, supplier, buyers: matches };
}

export async function verifyScan({ supplierDescription, buyerDescription, sessionId }) {
  const { rows } = await pool.query(
    'SELECT 1 FROM buyer WHERE buyer_description = $1 AND supplier_description_ref = $2',
    [buyerDescription, supplierDescription]
  );
  const isMatch = rows.length > 0;
  const currentSessionId = sessionId || crypto.randomUUID();

  await pool.query(
    `INSERT INTO scan_log (session_id, scan_type, decoded_description, match_result)
     VALUES ($1,$2,$3,$4)`,
    [currentSessionId, 'buyer', buyerDescription, isMatch ? 'match' : 'no_match']
  );

  return { sessionId: currentSessionId, match: isMatch, supplierDescription, buyerDescription };
}

export async function getScanLog(sessionId) {
  let rows;
  if (sessionId) {
    const res = await pool.query('SELECT * FROM scan_log WHERE session_id = $1 ORDER BY scanned_at', [sessionId]);
    rows = res.rows;
  } else {
    const res = await pool.query('SELECT * FROM scan_log ORDER BY scanned_at');
    rows = res.rows;
  }
  return rows.map(r => ({
    log_id: r.log_id, session_id: r.session_id, scan_type: r.scan_type,
    decoded_description: r.decoded_description, match_result: r.match_result,
    scanned_at: r.scanned_at ? r.scanned_at.toISOString() : '',
  }));
}

// ── Delivery (出库发货单) CRUD ──────────────────────────────

function deliveryRow(r) {
  return {
    delivery_no: r.delivery_no, delivery_line_no: r.delivery_line_no,
    order_no: r.order_no, order_line_no: r.order_line_no,
    line_status: r.line_status, factory: r.factory, erp_order_no: r.erp_order_no,
    material_code: r.material_code, material_desc: r.material_desc,
    batch_no: r.batch_no, production_batch: r.production_batch,
    delivery_qty: r.delivery_qty, min_pack_qty: r.min_pack_qty,
    qty_per_box: r.qty_per_box, qty_per_pallet: r.qty_per_pallet,
    received_qty: r.received_qty, logistics_company: r.logistics_company,
    logistics_no: r.logistics_no, plate_no: r.plate_no, vehicle_type: r.vehicle_type,
    production_date: r.production_date ? r.production_date.toISOString().slice(0, 10) : '',
    source_type: r.source_type, delivery_plan_no: r.delivery_plan_no,
    delivery_plan_line_no: r.delivery_plan_line_no, wms_qc_result: r.wms_qc_result,
    supplier_remark: r.supplier_remark, buyer_remark: r.buyer_remark,
    actual_receive_factory: r.actual_receive_factory,
    actual_receive_warehouse: r.actual_receive_warehouse,
    is_printed: r.is_printed,
    created_at: r.created_at ? r.created_at.toISOString() : '',
    updated_at: r.updated_at ? r.updated_at.toISOString() : '',
  };
}

export async function getDistinctDeliveryNos() {
  const { rows } = await pool.query(
    `SELECT DISTINCT delivery_no FROM delivery WHERE status = 0 ORDER BY delivery_no`
  );
  return rows.map(r => r.delivery_no);
}

export async function getDistinctBatchNos() {
  const { rows } = await pool.query(
    `SELECT DISTINCT batch_no FROM delivery WHERE batch_no IS NOT NULL AND batch_no != '' AND status = 0 ORDER BY batch_no`
  );
  return rows.map(r => r.batch_no);
}

// 按 erp_order_no + material_desc 查询第一条匹配记录
export async function findDeliveryByErpAndMaterial(erpOrderNo, materialDesc) {
  const { rows } = await pool.query(
    `SELECT material_code, material_desc, batch_no, production_batch, delivery_qty, delivery_no, delivery_line_no, erp_order_no
     FROM delivery
     WHERE erp_order_no = $1 AND material_desc = $2 AND status = 0
     LIMIT 1`,
    [erpOrderNo, materialDesc]
  );
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    material_code: r.material_code,
    material_desc: r.material_desc,
    batch_no: r.batch_no,
    production_batch: r.production_batch,
    qty: r.delivery_qty,
    delivery_no: r.delivery_no,
    delivery_line_no: r.delivery_line_no,
    erp_order_no: r.erp_order_no,
  };
}

export async function getAllErpOrders() {
  const { rows } = await pool.query(
    `SELECT erp_order_no, batch_no FROM delivery WHERE erp_order_no IS NOT NULL AND erp_order_no != '' AND status = 0 ORDER BY erp_order_no`
  );
  // 去重：按 erp_order_no 去重，只保留第一个 batch_no
  const seen = new Set();
  const result = [];
  for (const r of rows) {
    if (!seen.has(r.erp_order_no)) {
      seen.add(r.erp_order_no);
      result.push(r);
    }
  }
  return result; // 返回唯一的 [{ erp_order_no, batch_no }, ...]
}

export async function getDeliveries(where = {}) {
  const conditions = ['status = 0'];
  const vals = [];
  let idx = 1;
  if (where.delivery_no) {
    conditions.push(`delivery_no = $${idx++}`);
    vals.push(where.delivery_no);
  }
  if (where.order_no) {
    conditions.push(`order_no = $${idx++}`);
    vals.push(where.order_no);
  }
  if (where.material_code) {
    conditions.push(`material_code = $${idx++}`);
    vals.push(where.material_code);
  }
  const { rows } = await pool.query(
    `SELECT * FROM delivery${conditions.length ? ' WHERE ' + conditions.join(' AND ') : ''} ORDER BY created_at DESC`,
    vals
  );
  return rows.map(deliveryRow);
}

export async function findDelivery(deliveryNo, lineNo) {
  const { rows } = await pool.query(
    'SELECT * FROM delivery WHERE delivery_no = $1 AND delivery_line_no = $2 AND status = 0',
    [deliveryNo, lineNo]
  );
  return rows.length ? deliveryRow(rows[0]) : null;
}

export async function createDelivery(data) {
  const dno = (data.delivery_no || '').trim();
  const lno = (data.delivery_line_no || '').trim();
  if (!dno || !lno) return { error: '发货单号和发货单行号必填' };
  const existing = await findDelivery(dno, lno);
  if (existing) return { error: '该发货单行已存在' };

  await pool.query(
    `INSERT INTO delivery (delivery_no, delivery_line_no, order_no, order_line_no, line_status, factory,
     erp_order_no, material_code, material_desc, batch_no, production_batch, delivery_qty,
     min_pack_qty, qty_per_box, qty_per_pallet, received_qty, logistics_company, logistics_no,
     plate_no, vehicle_type, production_date, source_type, delivery_plan_no, delivery_plan_line_no,
     wms_qc_result, supplier_remark, buyer_remark, actual_receive_factory, actual_receive_warehouse, is_printed)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30)`,
    [
      dno, lno,
      data.order_no || '', data.order_line_no || '', data.line_status || '', data.factory || '',
      data.erp_order_no || '', data.material_code || '', data.material_desc || '',
      data.batch_no || '', data.production_batch || '',
      parseInt(data.delivery_qty, 10) || 0, parseInt(data.min_pack_qty, 10) || 0,
      parseInt(data.qty_per_box, 10) || 0, parseInt(data.qty_per_pallet, 10) || 0,
      parseInt(data.received_qty, 10) || 0,
      data.logistics_company || '', data.logistics_no || '',
      data.plate_no || '', data.vehicle_type || '',
      data.production_date || null, data.source_type || '',
      data.delivery_plan_no || '', data.delivery_plan_line_no || '',
      data.wms_qc_result || '', data.supplier_remark || '', data.buyer_remark || '',
      data.actual_receive_factory || '', data.actual_receive_warehouse || '',
      data.is_printed || false,
    ]
  );
  return { data: await findDelivery(dno, lno) };
}

export async function updateDelivery(dno, lno, data) {
  const existing = await findDelivery(dno, lno);
  if (!existing) return { error: '出库记录不存在' };

  const fieldMap = {
    order_no: 'order_no', order_line_no: 'order_line_no', line_status: 'line_status',
    factory: 'factory', erp_order_no: 'erp_order_no', material_code: 'material_code',
    material_desc: 'material_desc', batch_no: 'batch_no', production_batch: 'production_batch',
    delivery_qty: 'delivery_qty', min_pack_qty: 'min_pack_qty', qty_per_box: 'qty_per_box',
    qty_per_pallet: 'qty_per_pallet', received_qty: 'received_qty',
    logistics_company: 'logistics_company', logistics_no: 'logistics_no',
    plate_no: 'plate_no', vehicle_type: 'vehicle_type', production_date: 'production_date',
    source_type: 'source_type', delivery_plan_no: 'delivery_plan_no',
    delivery_plan_line_no: 'delivery_plan_line_no', wms_qc_result: 'wms_qc_result',
    supplier_remark: 'supplier_remark', buyer_remark: 'buyer_remark',
    actual_receive_factory: 'actual_receive_factory',
    actual_receive_warehouse: 'actual_receive_warehouse', is_printed: 'is_printed',
  };

  const sets = [];
  const vals = [];
  const intFields = ['delivery_qty', 'min_pack_qty', 'qty_per_box', 'qty_per_pallet', 'received_qty'];
  let idx = 1;
  for (const [key, col] of Object.entries(fieldMap)) {
    if (data[key] !== undefined) {
      sets.push(`${col} = $${idx++}`);
      vals.push(intFields.includes(key) ? (parseInt(data[key], 10) || 0) : data[key]);
    }
  }
  if (sets.length > 0) {
    sets.push(`updated_at = NOW()`);
    vals.push(dno, lno);
    await pool.query(`UPDATE delivery SET ${sets.join(', ')} WHERE delivery_no = $${idx} AND delivery_line_no = $${idx + 1}`, vals);
  }
  return { data: await findDelivery(dno, lno) };
}

// 对比成功后更新发货数量：减1，若为0则禁用
export async function updateDeliveryAfterScan(deliveryNo, erpOrderNo) {
  const { rows } = await pool.query(
    `UPDATE delivery
     SET delivery_qty = delivery_qty - 1,
         status = CASE WHEN delivery_qty - 1 <= 0 THEN 1 ELSE status END,
         updated_at = NOW()
     WHERE delivery_no = $1 AND erp_order_no = $2 AND status = 0
     RETURNING *`,
    [deliveryNo, erpOrderNo]
  );
  return rows.length ? deliveryRow(rows[0]) : null;
}

export async function deleteDelivery(dno, lno) {
  const res = await pool.query(
    'DELETE FROM delivery WHERE delivery_no = $1 AND delivery_line_no = $2',
    [dno, lno]
  );
  if (res.rowCount === 0) return { error: '出库记录不存在' };
  return { ok: true };
}

// ── Material Mapping (供应商料号 ↔ 客户料号) ─────────────────

export async function getMaterialMappings() {
  const { rows } = await pool.query(
    'SELECT * FROM material_mapping ORDER BY id ASC'
  );
  return rows.map(r => ({
    id: r.id,
    supplier_material_code: r.supplier_material_code,
    customer_material_code: r.customer_material_code,
    created_at: r.created_at ? r.created_at.toISOString() : '',
  }));
}

export async function createMaterialMapping(data) {
  const supplierCode = (data.supplier_material_code || '').trim();
  const customerCode = (data.customer_material_code || '').trim();
  if (!supplierCode || !customerCode) {
    return { error: '供应商料号和客户料号均不能为空' };
  }
  // 检查客户料号是否已存在（唯一索引）
  const { rows: dupCustomer } = await pool.query(
    'SELECT id, supplier_material_code FROM material_mapping WHERE customer_material_code = $1',
    [customerCode]
  );
  if (dupCustomer.length > 0) {
    // 同一供应商+同一客户 → 跳过
    if (dupCustomer[0].supplier_material_code === supplierCode) {
      return { skipped: true, id: dupCustomer[0].id };
    }
    return { error: `客户料号 ${customerCode} 已绑定供应商料号 ${dupCustomer[0].supplier_material_code}` };
  }
  const { rows } = await pool.query(
    `INSERT INTO material_mapping (supplier_material_code, customer_material_code)
     VALUES ($1, $2) RETURNING *`,
    [supplierCode, customerCode]
  );
  return { data: rows[0] };
}

export async function deleteMaterialMapping(id) {
  const res = await pool.query('DELETE FROM material_mapping WHERE id = $1', [id]);
  if (res.rowCount === 0) return { error: '记录不存在' };
  return { ok: true };
}

// ── Label Match Log（标签校验成功记录）────────────────────────

export async function createLabelMatchLog(data) {
  const logId = (data.log_id || '').trim();
  if (!logId) return { error: 'log_id 不能为空' };

  const buyerQty = parseInt(data.buyer_qty, 10);
  const supplierQty = parseInt(data.supplier_qty, 10);

  await pool.query(
    `INSERT INTO label_match_log (
       log_id, buyer_material_code, buyer_lot, buyer_qty, buyer_production_date,
       supplier_material_code, supplier_lot, supplier_qty, supplier_production_date
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (log_id) DO UPDATE SET
       buyer_material_code      = EXCLUDED.buyer_material_code,
       buyer_lot                = EXCLUDED.buyer_lot,
       buyer_qty                = EXCLUDED.buyer_qty,
       buyer_production_date    = EXCLUDED.buyer_production_date,
       supplier_material_code   = EXCLUDED.supplier_material_code,
       supplier_lot             = EXCLUDED.supplier_lot,
       supplier_qty             = EXCLUDED.supplier_qty,
       supplier_production_date = EXCLUDED.supplier_production_date,
       created_at               = NOW() AT TIME ZONE 'Asia/Shanghai'`,
    [
      logId,
      data.buyer_material_code || '',
      data.buyer_lot || '',
      Number.isNaN(buyerQty) ? 0 : buyerQty,
      data.buyer_production_date || null,
      data.supplier_material_code || '',
      data.supplier_lot || '',
      Number.isNaN(supplierQty) ? 0 : supplierQty,
      data.supplier_production_date || null,
    ]
  );

  return { ok: true };
}

export async function getLabelMatchLogs() {
  const { rows } = await pool.query(
    'SELECT * FROM label_match_log ORDER BY created_at DESC'
  );
  return rows.map((r) => ({
    log_id: r.log_id,
    buyer_material_code: r.buyer_material_code,
    buyer_lot: r.buyer_lot,
    buyer_qty: r.buyer_qty,
    buyer_production_date: r.buyer_production_date ? r.buyer_production_date.toISOString().slice(0, 10) : '',
    supplier_material_code: r.supplier_material_code,
    supplier_lot: r.supplier_lot,
    supplier_qty: r.supplier_qty,
    supplier_production_date: r.supplier_production_date ? r.supplier_production_date.toISOString().slice(0, 10) : '',
    created_at: r.created_at ? formatLocalDateTime(r.created_at) : '',
  }));
}

function formatLocalDateTime(date) {
  // created_at 是 TIMESTAMP（无时区），在容器内被 pg 解析为 UTC 时刻。
  // 我们按 UTC 读出其年月日时分秒，即为数据库里保存的北京时间。
  const d = new Date(date);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

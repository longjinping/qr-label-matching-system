-- ============================================================
-- QR Label Matching System - PostgreSQL Schema
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. SUPPLIER TABLE
--    Records supplier labels
-- ============================================================
CREATE TABLE supplier (
    supplier_id         VARCHAR(50) PRIMARY KEY,    -- corresponds to 'sid'
    supplier_name       VARCHAR(100),               -- corresponds to 'sn'
    supplier_description VARCHAR(100) NOT NULL,     -- corresponds to 'sd' (canonical description)
    item_num            VARCHAR(100),               -- corresponds to 'in_'
    lot_code            VARCHAR(50),                -- corresponds to 'lc'
    qty                 INTEGER,                    -- corresponds to 'qty'
    date_code           VARCHAR(50),                -- corresponds to 'dc'
    coo                 VARCHAR(50),                -- corresponds to 'coo' (Country of Origin)
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_supplier_description ON supplier(supplier_description);

-- ============================================================
-- 2. BUYER TABLE
--    Records buyer labels and how they map to suppliers
-- ============================================================
CREATE TABLE buyer (
    buyer_id                VARCHAR(50) PRIMARY KEY,    -- corresponds to 'bid'
    buyer_name              VARCHAR(100),               -- corresponds to 'bn'
    buyer_description       VARCHAR(100) NOT NULL,      -- corresponds to 'bd' (buyer side description code)
    supplier_ref            VARCHAR(100) NOT NULL,      -- corresponds to 'ref' (maps to supplier 'sd')
    qty                     INTEGER,                    -- corresponds to 'qty'
    created_at              TIMESTAMPTZ DEFAULT NOW(),

    -- Foreign key to optionally enforce constraint (if required in strict DBs)
    CONSTRAINT fk_buyer_supplier_ref FOREIGN KEY (supplier_ref)
        REFERENCES supplier(supplier_description) ON DELETE CASCADE
);

CREATE INDEX idx_buyer_supplier_ref ON buyer(supplier_ref);
CREATE INDEX idx_buyer_description  ON buyer(buyer_description);

-- ============================================================
-- 3. SCAN LOG / SESSION TABLE
--    Audit trail for verification sessions
-- ============================================================
CREATE TABLE scan_log (
    log_id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id          VARCHAR(100),                   
    scan_type           VARCHAR(20) NOT NULL CHECK (scan_type IN ('supplier','buyer')),
    decoded_description VARCHAR(100),
    match_result        VARCHAR(20) CHECK (match_result IN ('match','no_match','pending')),
    scanned_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_scan_log_session ON scan_log(session_id);


-- ============================================================
-- 5. DEMO SEED DATA (from store.js)
-- ============================================================

INSERT INTO supplier (supplier_id, supplier_name, supplier_description, item_num, lot_code, qty, date_code, coo) VALUES
    ('CF4012M00010T1101064', 'Reel-1', 'XI2M00000S096', 'AE1048', '30977', 3000, '4823', 'CN'),
    ('AMCA31-2R450G-S1F-T3', 'Reel-2', 'AMCA31-2R450G-S1F-T3', 'AMCA31-2R450GS1F', '0146163-DAF3X30098-F81', 3000, '2223', 'CN'),
    ('ATFC-0201-2N0BT', 'Reel-3', 'ATFC-0201-2N0BT', 'ATFC-0201-2N0BT', '0159205', 10000, '240806', 'TW'),
    ('ABS07AIG-32.768KHZ-9-T', 'ABRACON', 'ABS07AIG-32.768KHZ-9-T', 'AA032.768000KH', '0147311', 3000, '2230', 'JP');

INSERT INTO buyer (buyer_id, buyer_name, buyer_description, supplier_ref, qty) VALUES
    ('B001', 'Buyer Reel 1', 'XI2M00000S096', 'XI2M00000S096', 3000),
    ('B002', 'Buyer Reel 2', 'AMCA31-2R450G-S1F-T3', 'AMCA31-2R450G-S1F-T3', 3000),
    ('B003', 'Buyer Reel 3', 'ATFC-0201-2N0BT', 'ATFC-0201-2N0BT', 10000),
    ('B004', 'Buyer Reel 4', 'ABS07AIG-32.768KHZ-9-T', 'ABS07AIG-32.768KHZ-9-T', 3000);

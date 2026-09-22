-- OntoTrail / Nova Mobility India operational semantic view
-- Requires snowflake/03_nova_mobility_internal_operations.sql
-- All NOVA_* operational records are SYNTHETIC hackathon data.
-- Marketplace enrichment columns originate from TradePrism / Pelmorex-derived views.

USE ROLE ACCOUNTADMIN;
USE WAREHOUSE ONTOTRAIL_WH;
USE DATABASE ONTOTRAIL;
USE SCHEMA SUPPLY_CHAIN;

CREATE OR REPLACE SEMANTIC VIEW ONTOTRAIL_NOVA_MOBILITY_ANALYST
TABLES (
    nova AS ONTOTRAIL.SUPPLY_CHAIN.NOVA_MOBILITY_RISK_ENRICHED
)
DIMENSIONS (
    nova.po_id AS nova.PO_ID
        WITH SYNONYMS = ('purchase order', 'po', 'purchase order id'),
    nova.po_status AS nova.PO_STATUS
        WITH SYNONYMS = ('purchase order status', 'po status', 'order status'),
    nova.promised_date AS nova.PROMISED_DATE
        WITH SYNONYMS = ('promised date', 'supplier promised date'),
    nova.supplier_id AS nova.SUPPLIER_ID
        WITH SYNONYMS = ('supplier code', 'vendor id'),
    nova.supplier_name AS nova.SUPPLIER_NAME
        WITH SYNONYMS = ('supplier', 'vendor', 'source supplier'),
    nova.origin_iso AS nova.ORIGIN_ISO
        WITH SYNONYMS = ('supplier country code', 'origin code'),
    nova.origin_country AS nova.ORIGIN_COUNTRY
        WITH SYNONYMS = ('supplier country', 'origin country', 'source country'),
    nova.supplier_tier AS nova.SUPPLIER_TIER
        WITH SYNONYMS = ('tier', 'supplier tier'),
    nova.category AS nova.CATEGORY
        WITH SYNONYMS = ('supplier category', 'category'),
    nova.supplier_criticality AS nova.SUPPLIER_CRITICALITY
        WITH SYNONYMS = ('supplier criticality', 'vendor criticality'),
    nova.material_id AS nova.MATERIAL_ID
        WITH SYNONYMS = ('material', 'material code', 'part id'),
    nova.material_name AS nova.MATERIAL_NAME
        WITH SYNONYMS = ('material name', 'part', 'component'),
    nova.hs4_code AS nova.HS4_CODE
        WITH SYNONYMS = ('hs4', 'commodity code', 'hs code'),
    nova.commodity_group AS nova.COMMODITY_GROUP
        WITH SYNONYMS = ('commodity group', 'material category'),
    nova.material_criticality AS nova.MATERIAL_CRITICALITY
        WITH SYNONYMS = ('material criticality', 'part criticality'),
    nova.plant_name AS nova.PLANT_NAME
        WITH SYNONYMS = ('plant', 'receiving plant', 'factory'),
    nova.shipment_id AS nova.SHIPMENT_ID
        WITH SYNONYMS = ('shipment', 'shipment id'),
    nova.transport_mode AS nova.TRANSPORT_MODE
        WITH SYNONYMS = ('mode', 'shipment mode', 'transport mode'),
    nova.eta_date AS nova.ETA_DATE
        WITH SYNONYMS = ('eta', 'expected arrival date', 'shipment eta'),
    nova.shipment_status AS nova.SHIPMENT_STATUS
        WITH SYNONYMS = ('shipment status', 'logistics status'),
    nova.inventory_risk_level AS nova.INVENTORY_RISK_LEVEL
        WITH SYNONYMS = ('inventory risk', 'stock risk'),
    nova.operational_risk_level AS nova.OPERATIONAL_RISK_LEVEL
        WITH SYNONYMS = ('operational risk', 'po risk', 'supply risk'),
    nova.weather_risk_level AS nova.WEATHER_RISK_LEVEL
        WITH SYNONYMS = ('weather risk', 'external weather risk'),
    nova.marketplace_match_status AS IFF(nova.MARKETPLACE_MATCH_AVAILABLE,'MATCHED','NOT_MATCHED')
        WITH SYNONYMS = ('marketplace match', 'external intelligence match')
)
METRICS (
    nova.total_po_value_usd AS SUM(nova.PO_VALUE_USD)
        WITH SYNONYMS = ('po value', 'purchase order value', 'open po exposure', 'sourcing exposure')
        COMMENT = 'Synthetic Nova Mobility purchase-order value in USD.',
    nova.purchase_order_count AS COUNT(DISTINCT nova.PO_ID)
        WITH SYNONYMS = ('purchase orders', 'po count', 'number of purchase orders'),
    nova.supplier_count AS COUNT(DISTINCT nova.SUPPLIER_ID)
        WITH SYNONYMS = ('suppliers', 'supplier count', 'vendor count'),
    nova.material_count AS COUNT(DISTINCT nova.MATERIAL_ID)
        WITH SYNONYMS = ('materials', 'material count', 'part count'),
    nova.delayed_po_count AS COUNT(DISTINCT IFF(nova.PO_STATUS='DELAYED',nova.PO_ID,NULL))
        WITH SYNONYMS = ('delayed purchase orders', 'delayed pos'),
    nova.total_order_quantity AS SUM(nova.ORDER_QTY)
        WITH SYNONYMS = ('ordered quantity', 'po quantity'),
    nova.total_received_quantity AS SUM(nova.RECEIVED_QTY)
        WITH SYNONYMS = ('received quantity', 'received units'),
    nova.outstanding_quantity AS SUM(nova.ORDER_QTY-nova.RECEIVED_QTY)
        WITH SYNONYMS = ('outstanding quantity', 'unreceived units', 'open quantity'),
    nova.minimum_days_of_cover AS MIN(nova.DAYS_OF_COVER)
        WITH SYNONYMS = ('minimum inventory cover', 'lowest days of cover', 'lowest stock cover'),
    nova.average_days_of_cover AS AVG(nova.DAYS_OF_COVER)
        WITH SYNONYMS = ('average inventory cover', 'average days of cover'),
    nova.low_cover_po_count AS COUNT(DISTINCT IFF(nova.DAYS_OF_COVER < 7,nova.PO_ID,NULL))
        WITH SYNONYMS = ('low inventory purchase orders', 'pos below seven days cover'),
    nova.weather_linked_po_value_usd AS SUM(IFF(nova.WEATHER_RISK_LEVEL IN ('MEDIUM','HIGH'),nova.PO_VALUE_USD,0))
        WITH SYNONYMS = ('po value at weather risk', 'weather linked po exposure'),
    nova.delayed_po_value_usd AS SUM(IFF(nova.PO_STATUS='DELAYED',nova.PO_VALUE_USD,0))
        WITH SYNONYMS = ('delayed po value', 'delayed purchase order exposure'),
    nova.high_operational_risk_po_value_usd AS SUM(IFF(nova.OPERATIONAL_RISK_LEVEL='HIGH',nova.PO_VALUE_USD,0))
        WITH SYNONYMS = ('high operational risk exposure', 'high risk po value'),
    nova.average_market_sea_dependency_pct AS AVG(nova.MARKET_SEA_DEPENDENCY_PCT)
        WITH SYNONYMS = ('market sea dependency', 'external sea dependency')
        COMMENT = 'Average TradePrism sea-dependency percentage across matched supplier/material rows; this is external market context, not Nova shipment share.'
)
COMMENT = 'Nova Mobility India synthetic internal operational semantic view enriched with real Snowflake Marketplace trade and weather context.'
AI_SQL_GENERATION 'Nova Mobility India is a fictional hackathon client. Supplier, material, purchase-order, shipment and inventory records in this semantic view are synthetic. TradePrism and Pelmorex-derived enrichment is real Marketplace intelligence. Never claim the synthetic operational records are real company data. Use PO_ID for purchase-order questions, SUPPLIER_NAME for supplier questions and MATERIAL_NAME for component questions. DAYS_OF_COVER is an internal inventory metric. MARKET_SEA_DEPENDENCY_PCT describes external TradePrism market context and must not be described as Nova Mobility actual shipment-mode share. WEATHER_RISK_LEVEL is based on the OntoTrail heuristic over Pelmorex forecasts. Prefer semantic metrics over re-deriving formulas.'
AI_QUESTION_CATEGORIZATION 'This semantic view answers Nova Mobility internal operational questions about suppliers, purchase orders, materials, plants, shipments, inventory days of cover, delayed POs and operational risk, with TradePrism and Pelmorex context. For overall India trade totals, country-wide import value or national trade questions, use the India trade-risk semantic view instead.';

GRANT REFERENCES, SELECT ON SEMANTIC VIEW ONTOTRAIL.SUPPLY_CHAIN.ONTOTRAIL_NOVA_MOBILITY_ANALYST TO ROLE ONTOTRAIL_APP_ROLE;

DESC SEMANTIC VIEW ONTOTRAIL.SUPPLY_CHAIN.ONTOTRAIL_NOVA_MOBILITY_ANALYST;

SELECT *
FROM SEMANTIC_VIEW(
    ONTOTRAIL.SUPPLY_CHAIN.ONTOTRAIL_NOVA_MOBILITY_ANALYST
    METRICS nova.total_po_value_usd,
            nova.purchase_order_count,
            nova.delayed_po_count,
            nova.minimum_days_of_cover
    DIMENSIONS nova.po_status
);

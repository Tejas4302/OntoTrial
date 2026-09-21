-- OntoTrail CoCo CLI Hackathon synthetic dataset
-- Rebuilds the dedicated demo table and semantic view used by the hackathon workspace.
-- It does not replace ONTOTRAIL_ANALYST.
USE ROLE ACCOUNTADMIN;
USE WAREHOUSE COMPUTE_WH;
USE DATABASE ONTOTRAIL;
USE SCHEMA SUPPLY_CHAIN;

CREATE OR REPLACE TABLE COCO_DEMO_ORDERS (
    ORDER_ID VARCHAR,
    ORDER_DATE DATE,
    CUSTOMER_NAME VARCHAR,
    SUPPLIER_NAME VARCHAR,
    PRODUCT_NAME VARCHAR,
    PLANT_NAME VARCHAR,
    QUANTITY NUMBER,
    FULFILLED_QUANTITY NUMBER,
    ORDER_VALUE_INR NUMBER(18,2),
    LANDED_COST_INR NUMBER(18,2),
    INVENTORY_ON_HAND_UNITS NUMBER,
    DAILY_DEMAND_UNITS NUMBER,
    ON_TIME_DELIVERY_FLAG NUMBER(1,0),
    SCENARIO VARCHAR,
    DELAY_DAYS NUMBER,
    EXPOSED_VALUE_RUPEES NUMBER(18,2),
    STATUS VARCHAR
);

INSERT INTO COCO_DEMO_ORDERS
WITH base_orders AS (
    SELECT SEQ4() + 1 AS N FROM TABLE(GENERATOR(ROWCOUNT => 72))
), orders AS (
    SELECT
        N,
        'COCO-' || LPAD(N::VARCHAR, 4, '0') AS ORDER_ID,
        DATEADD('day', -MOD(N * 3, 60), '2026-09-18'::DATE) AS ORDER_DATE,
        CASE MOD(N - 1, 8)
            WHEN 0 THEN 'Meridian Mobility' WHEN 1 THEN 'Northstar EV'
            WHEN 2 THEN 'Aster Automotive' WHEN 3 THEN 'Vertex Motors'
            WHEN 4 THEN 'Nova Mobility' WHEN 5 THEN 'Orion Electric'
            WHEN 6 THEN 'Zenith Auto' ELSE 'Atlas EV Systems' END AS CUSTOMER_NAME,
        CASE MOD(N - 1, 12)
            WHEN 0 THEN 'Aruna Components' WHEN 1 THEN 'Bharat Battery Systems'
            WHEN 2 THEN 'Delta Electronics' WHEN 3 THEN 'Kaveri Precision'
            WHEN 4 THEN 'Nexus Semiconductors' WHEN 5 THEN 'Pragati Plastics'
            WHEN 6 THEN 'Sahyadri Metals' WHEN 7 THEN 'Trident Controls'
            WHEN 8 THEN 'Vega Mobility Parts' WHEN 9 THEN 'Western Circuits'
            WHEN 10 THEN 'Indus Powertrain' ELSE 'Apex Sensor Systems' END AS SUPPLIER_NAME,
        CASE MOD(N - 1, 12)
            WHEN 0 THEN 'Battery Module' WHEN 1 THEN 'Motor Controller'
            WHEN 2 THEN 'Power Inverter' WHEN 3 THEN 'Drive Unit'
            WHEN 4 THEN 'BMS Controller' WHEN 5 THEN 'Charging Module'
            WHEN 6 THEN 'Thermal Assembly' WHEN 7 THEN 'DC-DC Converter'
            WHEN 8 THEN 'Vehicle Control Unit' WHEN 9 THEN 'Sensor Module'
            WHEN 10 THEN 'HV Connector' ELSE 'Cooling Pump' END AS PRODUCT_NAME,
        CASE MOD(N - 1, 4)
            WHEN 0 THEN 'Bengaluru Plant' WHEN 1 THEN 'Pune Plant'
            WHEN 2 THEN 'Chennai Plant' ELSE 'Hyderabad Plant' END AS PLANT_NAME,
        20 + MOD(N * 17, 181) AS QUANTITY,
        ROUND((20 + MOD(N * 17, 181)) * (2500 + MOD(N * 1379, 17500)), 2) AS ORDER_VALUE_INR,
        140 + MOD(N * 29, 460) AS BASE_INVENTORY_ON_HAND,
        12 + MOD(N * 11, 48) AS DAILY_DEMAND_UNITS
    FROM base_orders
)
SELECT
    ORDER_ID,
    ORDER_DATE,
    CUSTOMER_NAME,
    SUPPLIER_NAME,
    PRODUCT_NAME,
    PLANT_NAME,
    QUANTITY,
    CASE
        WHEN SCENARIO = 'BASELINE' THEN QUANTITY
        WHEN SCENARIO = 'ARUNA_4D' AND SUPPLIER_NAME = 'Aruna Components' THEN FLOOR(QUANTITY * 0.72)
        WHEN SCENARIO = 'ARUNA_4D' AND MOD(N, 5) = 0 THEN FLOOR(QUANTITY * 0.85)
        WHEN SCENARIO = 'ARUNA_4D_RECOVERY' AND SUPPLIER_NAME = 'Aruna Components' THEN FLOOR(QUANTITY * 0.92)
        WHEN SCENARIO = 'ARUNA_4D_RECOVERY' AND MOD(N, 5) = 0 THEN FLOOR(QUANTITY * 0.96)
        ELSE QUANTITY
    END AS FULFILLED_QUANTITY,
    ORDER_VALUE_INR,
    CASE
        WHEN SCENARIO = 'BASELINE' THEN ROUND(ORDER_VALUE_INR * 0.620, 2)
        WHEN SCENARIO = 'ARUNA_4D' AND SUPPLIER_NAME = 'Aruna Components' THEN ROUND(ORDER_VALUE_INR * 0.685, 2)
        WHEN SCENARIO = 'ARUNA_4D' AND MOD(N, 5) = 0 THEN ROUND(ORDER_VALUE_INR * 0.650, 2)
        WHEN SCENARIO = 'ARUNA_4D_RECOVERY' AND SUPPLIER_NAME = 'Aruna Components' THEN ROUND(ORDER_VALUE_INR * 0.645, 2)
        WHEN SCENARIO = 'ARUNA_4D_RECOVERY' AND MOD(N, 5) = 0 THEN ROUND(ORDER_VALUE_INR * 0.635, 2)
        ELSE ROUND(ORDER_VALUE_INR * 0.620, 2)
    END AS LANDED_COST_INR,
    CASE
        WHEN SCENARIO = 'BASELINE' THEN BASE_INVENTORY_ON_HAND
        WHEN SCENARIO = 'ARUNA_4D' AND SUPPLIER_NAME = 'Aruna Components' THEN FLOOR(BASE_INVENTORY_ON_HAND * 0.58)
        WHEN SCENARIO = 'ARUNA_4D' AND MOD(N, 5) = 0 THEN FLOOR(BASE_INVENTORY_ON_HAND * 0.78)
        WHEN SCENARIO = 'ARUNA_4D_RECOVERY' AND SUPPLIER_NAME = 'Aruna Components' THEN FLOOR(BASE_INVENTORY_ON_HAND * 0.82)
        WHEN SCENARIO = 'ARUNA_4D_RECOVERY' AND MOD(N, 5) = 0 THEN FLOOR(BASE_INVENTORY_ON_HAND * 0.90)
        ELSE BASE_INVENTORY_ON_HAND
    END AS INVENTORY_ON_HAND_UNITS,
    DAILY_DEMAND_UNITS,
    CASE
        WHEN SCENARIO = 'BASELINE' THEN 1
        WHEN SCENARIO = 'ARUNA_4D' AND (SUPPLIER_NAME = 'Aruna Components' OR MOD(N, 5) = 0) THEN 0
        WHEN SCENARIO = 'ARUNA_4D_RECOVERY' AND SUPPLIER_NAME = 'Aruna Components' AND MOD(N, 3) = 0 THEN 0
        ELSE 1
    END AS ON_TIME_DELIVERY_FLAG,
    SCENARIO,
    CASE
        WHEN SCENARIO = 'BASELINE' THEN 0
        WHEN SCENARIO = 'ARUNA_4D' AND SUPPLIER_NAME = 'Aruna Components' THEN 4
        WHEN SCENARIO = 'ARUNA_4D' AND MOD(N, 5) = 0 THEN 2
        WHEN SCENARIO = 'ARUNA_4D_RECOVERY' AND SUPPLIER_NAME = 'Aruna Components' THEN 2
        WHEN SCENARIO = 'ARUNA_4D_RECOVERY' AND MOD(N, 5) = 0 THEN 1
        ELSE 0
    END AS DELAY_DAYS,
    CASE
        WHEN SCENARIO = 'BASELINE' THEN 0
        WHEN SCENARIO = 'ARUNA_4D' AND SUPPLIER_NAME = 'Aruna Components' THEN ROUND(ORDER_VALUE_INR, 2)
        WHEN SCENARIO = 'ARUNA_4D' AND MOD(N, 5) = 0 THEN ROUND(ORDER_VALUE_INR * 0.65, 2)
        WHEN SCENARIO = 'ARUNA_4D_RECOVERY' AND SUPPLIER_NAME = 'Aruna Components' THEN ROUND(ORDER_VALUE_INR * 0.40, 2)
        WHEN SCENARIO = 'ARUNA_4D_RECOVERY' AND MOD(N, 5) = 0 THEN ROUND(ORDER_VALUE_INR * 0.20, 2)
        ELSE 0
    END AS EXPOSED_VALUE_RUPEES,
    CASE
        WHEN SCENARIO = 'BASELINE' THEN 'ON_TIME'
        WHEN SCENARIO = 'ARUNA_4D' AND (SUPPLIER_NAME = 'Aruna Components' OR MOD(N, 5) = 0) THEN 'AT_RISK'
        WHEN SCENARIO = 'ARUNA_4D_RECOVERY' AND (SUPPLIER_NAME = 'Aruna Components' OR MOD(N, 5) = 0) THEN 'MITIGATED'
        ELSE 'ON_TIME'
    END AS STATUS
FROM orders
CROSS JOIN (
    SELECT COLUMN1 AS SCENARIO
    FROM VALUES ('BASELINE'), ('ARUNA_4D'), ('ARUNA_4D_RECOVERY')
);

CREATE OR REPLACE SEMANTIC VIEW ONTOTRAIL_COCO_ANALYST
TABLES (
    demo_orders AS COCO_DEMO_ORDERS PRIMARY KEY (ORDER_ID, SCENARIO)
)
DIMENSIONS (
    demo_orders.order_id AS ORDER_ID WITH SYNONYMS = ('order', 'order number', 'order id'),
    demo_orders.order_date AS ORDER_DATE WITH SYNONYMS = ('date', 'order date'),
    demo_orders.customer_name AS CUSTOMER_NAME WITH SYNONYMS = ('customer', 'client', 'buyer'),
    demo_orders.supplier_name AS SUPPLIER_NAME WITH SYNONYMS = ('supplier', 'vendor', 'tier 1 supplier'),
    demo_orders.product_name AS PRODUCT_NAME WITH SYNONYMS = ('product', 'component', 'part'),
    demo_orders.plant_name AS PLANT_NAME WITH SYNONYMS = ('plant', 'factory', 'location'),
    demo_orders.scenario AS SCENARIO WITH SYNONYMS = ('scenario', 'simulation'),
    demo_orders.status AS STATUS WITH SYNONYMS = ('status', 'risk status')
)
METRICS (
    demo_orders.total_exposure_inr AS SUM(demo_orders.EXPOSED_VALUE_RUPEES)
        WITH SYNONYMS = ('exposure', 'total exposure', 'exposed value', 'risk exposure', 'supplier risk exposure', 'exposed order value'),
    demo_orders.total_order_value_inr AS SUM(demo_orders.ORDER_VALUE_INR)
        WITH SYNONYMS = ('order value', 'total order value', 'revenue value'),
    demo_orders.total_quantity AS SUM(demo_orders.QUANTITY)
        WITH SYNONYMS = ('quantity', 'total quantity', 'units ordered'),
    demo_orders.average_delay_days AS AVG(demo_orders.DELAY_DAYS)
        WITH SYNONYMS = ('delay', 'average delay', 'delay days'),
    demo_orders.order_count AS COUNT(DISTINCT demo_orders.ORDER_ID)
        WITH SYNONYMS = ('orders', 'order count', 'number of orders'),
    demo_orders.on_time_delivery_rate_pct AS AVG(demo_orders.ON_TIME_DELIVERY_FLAG) * 100
        WITH SYNONYMS = ('on time delivery', 'on-time delivery rate', 'otd', 'otd rate', 'delivery performance'),
    demo_orders.fill_rate_pct AS SUM(demo_orders.FULFILLED_QUANTITY) / NULLIF(SUM(demo_orders.QUANTITY), 0) * 100
        WITH SYNONYMS = ('fill rate', 'order fill rate', 'fulfilled quantity rate', 'service level'),
    demo_orders.days_of_inventory AS SUM(demo_orders.INVENTORY_ON_HAND_UNITS) / NULLIF(SUM(demo_orders.DAILY_DEMAND_UNITS), 0)
        WITH SYNONYMS = ('days of inventory', 'inventory days', 'days on hand', 'doi'),
    demo_orders.total_landed_cost_inr AS SUM(demo_orders.LANDED_COST_INR)
        WITH SYNONYMS = ('landed cost', 'total landed cost', 'supply cost', 'procurement landed cost')
)
COMMENT = 'OntoTrail CoCo CLI Hackathon governed supply-chain semantic view with canonical cross-persona metrics';

-- Validation: scenario totals and canonical KPIs.
SELECT
    SCENARIO,
    COUNT(*) AS ROW_COUNT,
    COUNT(DISTINCT ORDER_ID) AS ORDER_COUNT,
    ROUND(SUM(EXPOSED_VALUE_RUPEES), 2) AS TOTAL_EXPOSURE_INR,
    ROUND(AVG(ON_TIME_DELIVERY_FLAG) * 100, 2) AS ON_TIME_DELIVERY_RATE_PCT,
    ROUND(SUM(FULFILLED_QUANTITY) / NULLIF(SUM(QUANTITY), 0) * 100, 2) AS FILL_RATE_PCT,
    ROUND(SUM(INVENTORY_ON_HAND_UNITS) / NULLIF(SUM(DAILY_DEMAND_UNITS), 0), 2) AS DAYS_OF_INVENTORY,
    ROUND(SUM(LANDED_COST_INR), 2) AS TOTAL_LANDED_COST_INR
FROM COCO_DEMO_ORDERS
GROUP BY SCENARIO
ORDER BY SCENARIO;

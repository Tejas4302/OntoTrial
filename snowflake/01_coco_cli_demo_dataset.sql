-- OntoTrail CoCo CLI Hackathon synthetic dataset
-- Creates a separate demo table and semantic view. It does not replace ONTOTRAIL_ANALYST.
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
    ORDER_VALUE_INR NUMBER(18,2),
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
        ROUND((20 + MOD(N * 17, 181)) * (2500 + MOD(N * 1379, 17500)), 2) AS ORDER_VALUE_INR
    FROM base_orders
)
SELECT
    ORDER_ID, ORDER_DATE, CUSTOMER_NAME, SUPPLIER_NAME, PRODUCT_NAME, PLANT_NAME,
    QUANTITY, ORDER_VALUE_INR, SCENARIO,
    CASE
        WHEN SCENARIO = 'BASELINE' THEN 0
        WHEN SCENARIO = 'ARUNA_4D' AND SUPPLIER_NAME = 'Aruna Components' THEN 4
        WHEN SCENARIO = 'ARUNA_4D' AND MOD(N, 5) = 0 THEN 2
        WHEN SCENARIO = 'ARUNA_4D_RECOVERY' AND SUPPLIER_NAME = 'Aruna Components' THEN 2
        WHEN SCENARIO = 'ARUNA_4D_RECOVERY' AND MOD(N, 5) = 0 THEN 1
        ELSE 0 END AS DELAY_DAYS,
    CASE
        WHEN SCENARIO = 'BASELINE' THEN 0
        WHEN SCENARIO = 'ARUNA_4D' AND SUPPLIER_NAME = 'Aruna Components' THEN ROUND(ORDER_VALUE_INR, 2)
        WHEN SCENARIO = 'ARUNA_4D' AND MOD(N, 5) = 0 THEN ROUND(ORDER_VALUE_INR * 0.65, 2)
        WHEN SCENARIO = 'ARUNA_4D_RECOVERY' AND SUPPLIER_NAME = 'Aruna Components' THEN ROUND(ORDER_VALUE_INR * 0.40, 2)
        WHEN SCENARIO = 'ARUNA_4D_RECOVERY' AND MOD(N, 5) = 0 THEN ROUND(ORDER_VALUE_INR * 0.20, 2)
        ELSE 0 END AS EXPOSED_VALUE_RUPEES,
    CASE
        WHEN SCENARIO = 'BASELINE' THEN 'ON_TIME'
        WHEN SCENARIO = 'ARUNA_4D' AND (SUPPLIER_NAME = 'Aruna Components' OR MOD(N, 5) = 0) THEN 'AT_RISK'
        WHEN SCENARIO = 'ARUNA_4D_RECOVERY' AND (SUPPLIER_NAME = 'Aruna Components' OR MOD(N, 5) = 0) THEN 'MITIGATED'
        ELSE 'ON_TIME' END AS STATUS
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
    demo_orders.supplier_name AS SUPPLIER_NAME WITH SYNONYMS = ('supplier', 'vendor'),
    demo_orders.product_name AS PRODUCT_NAME WITH SYNONYMS = ('product', 'component', 'part'),
    demo_orders.plant_name AS PLANT_NAME WITH SYNONYMS = ('plant', 'factory', 'location'),
    demo_orders.scenario AS SCENARIO WITH SYNONYMS = ('scenario', 'simulation'),
    demo_orders.status AS STATUS WITH SYNONYMS = ('status', 'risk status')
)
METRICS (
    demo_orders.total_exposure_inr AS SUM(demo_orders.EXPOSED_VALUE_RUPEES)
        WITH SYNONYMS = ('exposure', 'total exposure', 'exposed value', 'risk exposure'),
    demo_orders.total_order_value_inr AS SUM(demo_orders.ORDER_VALUE_INR)
        WITH SYNONYMS = ('order value', 'total order value', 'revenue value'),
    demo_orders.total_quantity AS SUM(demo_orders.QUANTITY)
        WITH SYNONYMS = ('quantity', 'total quantity', 'units'),
    demo_orders.average_delay_days AS AVG(demo_orders.DELAY_DAYS)
        WITH SYNONYMS = ('delay', 'average delay', 'delay days'),
    demo_orders.order_count AS COUNT(DISTINCT demo_orders.ORDER_ID)
        WITH SYNONYMS = ('orders', 'order count', 'number of orders')
)
COMMENT = 'OntoTrail CoCo CLI Hackathon synthetic supply-chain semantic view';

SELECT
    SCENARIO,
    COUNT(*) AS ROW_COUNT,
    COUNT(DISTINCT ORDER_ID) AS ORDER_COUNT,
    COUNT(DISTINCT SUPPLIER_NAME) AS SUPPLIER_COUNT,
    COUNT(DISTINCT CUSTOMER_NAME) AS CUSTOMER_COUNT,
    COUNT(DISTINCT PRODUCT_NAME) AS PRODUCT_COUNT,
    ROUND(SUM(EXPOSED_VALUE_RUPEES), 2) AS TOTAL_EXPOSURE_INR
FROM COCO_DEMO_ORDERS
GROUP BY SCENARIO
ORDER BY SCENARIO;

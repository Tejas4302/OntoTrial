-- OntoTrail / CoCo CLI Hackathon synthetic demo dataset
-- Run in Snowflake as a role that can create tables and semantic views in ONTOTRAIL.SUPPLY_CHAIN.
USE DATABASE ONTOTRAIL;
USE SCHEMA SUPPLY_CHAIN;

CREATE OR REPLACE TABLE COCO_CLI_ORDER_EXPOSURE (
  ORDER_ID VARCHAR, ORDER_DATE DATE, DUE_DATE DATE, CUSTOMER_NAME VARCHAR,
  SUPPLIER_NAME VARCHAR, SUPPLIER_CITY VARCHAR, PRODUCT_NAME VARCHAR, PRODUCT_FAMILY VARCHAR,
  PLANT_NAME VARCHAR, REGION VARCHAR, SCENARIO VARCHAR, ORDER_QUANTITY NUMBER,
  UNIT_PRICE_INR NUMBER(12,2), ORDER_VALUE_INR NUMBER(14,2), EXPOSED_VALUE_RUPEES NUMBER(14,2),
  DELAY_DAYS NUMBER, RECOVERY_STATUS VARCHAR, PRIORITY VARCHAR, INVENTORY_AVAILABLE NUMBER,
  SHIPMENT_STATUS VARCHAR, TENANT_NAME VARCHAR
);

INSERT INTO COCO_CLI_ORDER_EXPOSURE
WITH base AS (
  SELECT seq4()+1 n FROM TABLE(GENERATOR(ROWCOUNT=>72))
), orders AS (
  SELECT
    'CC-'||LPAD(n,4,'0') order_id,
    DATEADD(day, -MOD(n,18), '2026-09-18'::DATE) order_date,
    DATEADD(day, MOD(n,16)+1, '2026-09-18'::DATE) due_date,
    CASE MOD(n,8) WHEN 0 THEN 'Meridian Mobility' WHEN 1 THEN 'Northstar EV' WHEN 2 THEN 'Aster Automotive' WHEN 3 THEN 'Vector Motors' WHEN 4 THEN 'Nova Transit' WHEN 5 THEN 'Zenith Robotics' WHEN 6 THEN 'Orion Mobility' ELSE 'Prism Auto Systems' END customer_name,
    CASE MOD(n,12) WHEN 0 THEN 'Aruna Components' WHEN 1 THEN 'Kaveri Electronics' WHEN 2 THEN 'Deccan Precision' WHEN 3 THEN 'Sahyadri Cells' WHEN 4 THEN 'Narmada Castings' WHEN 5 THEN 'Vindhya Semiconductors' WHEN 6 THEN 'Malabar Harness' WHEN 7 THEN 'Godavari Bearings' WHEN 8 THEN 'Western Magnetics' WHEN 9 THEN 'Eastern Polymer Works' WHEN 10 THEN 'Himalaya Thermal' ELSE 'Cauvery Connectors' END supplier_name,
    CASE MOD(n,12) WHEN 0 THEN 'Chennai' WHEN 1 THEN 'Bengaluru' WHEN 2 THEN 'Pune' WHEN 3 THEN 'Hyderabad' WHEN 4 THEN 'Ahmedabad' WHEN 5 THEN 'Noida' WHEN 6 THEN 'Kochi' WHEN 7 THEN 'Nashik' WHEN 8 THEN 'Coimbatore' WHEN 9 THEN 'Kolkata' WHEN 10 THEN 'Gurugram' ELSE 'Mysuru' END supplier_city,
    CASE MOD(n,12) WHEN 0 THEN 'Motor Controller' WHEN 1 THEN 'Sensor Assembly' WHEN 2 THEN 'Drive Housing' WHEN 3 THEN 'Battery Module' WHEN 4 THEN 'Inverter Housing' WHEN 5 THEN 'Power Semiconductor' WHEN 6 THEN 'HV Wiring Harness' WHEN 7 THEN 'Rotor Bearing' WHEN 8 THEN 'Permanent Magnet' WHEN 9 THEN 'Thermal Shield' WHEN 10 THEN 'Cooling Plate' ELSE 'HV Connector' END product_name,
    CASE MOD(n,4) WHEN 0 THEN 'Power Electronics' WHEN 1 THEN 'Battery & Energy' WHEN 2 THEN 'Drivetrain' ELSE 'Electrical Systems' END product_family,
    CASE MOD(n,4) WHEN 0 THEN 'Bengaluru Assembly' WHEN 1 THEN 'Chennai EV Plant' WHEN 2 THEN 'Pune Powertrain' ELSE 'Hyderabad Systems' END plant_name,
    CASE MOD(n,4) WHEN 0 THEN 'South' WHEN 1 THEN 'South' WHEN 2 THEN 'West' ELSE 'South' END region,
    35+MOD(n*17,145) order_quantity,
    1800+MOD(n*1375,11200) unit_price_inr,
    CASE WHEN MOD(n,5)=0 THEN 'Critical' WHEN MOD(n,3)=0 THEN 'High' ELSE 'Standard' END priority,
    20+MOD(n*23,180) inventory_available
  FROM base
), scenarios AS (
  SELECT column1 scenario FROM VALUES ('BASELINE'),('ARUNA_4D'),('ARUNA_4D_RECOVERY')
)
SELECT o.order_id,o.order_date,o.due_date,o.customer_name,o.supplier_name,o.supplier_city,o.product_name,o.product_family,o.plant_name,o.region,s.scenario,
 o.order_quantity,o.unit_price_inr,o.order_quantity*o.unit_price_inr order_value_inr,
 CASE
   WHEN s.scenario='BASELINE' THEN 0
   WHEN s.scenario='ARUNA_4D' AND o.supplier_name IN ('Aruna Components','Sahyadri Cells','Vindhya Semiconductors','Malabar Harness') THEN o.order_quantity*o.unit_price_inr
   WHEN s.scenario='ARUNA_4D' AND MOD(TO_NUMBER(RIGHT(o.order_id,4)),7)=0 THEN ROUND(o.order_quantity*o.unit_price_inr*0.45,2)
   WHEN s.scenario='ARUNA_4D_RECOVERY' AND o.supplier_name IN ('Aruna Components','Sahyadri Cells') THEN ROUND(o.order_quantity*o.unit_price_inr*0.35,2)
   WHEN s.scenario='ARUNA_4D_RECOVERY' AND o.supplier_name IN ('Vindhya Semiconductors','Malabar Harness') THEN ROUND(o.order_quantity*o.unit_price_inr*0.20,2)
   ELSE 0 END exposed_value_rupees,
 CASE WHEN s.scenario='BASELINE' THEN 0 WHEN s.scenario='ARUNA_4D' THEN 4 ELSE 2 END delay_days,
 CASE WHEN s.scenario='BASELINE' THEN 'Not required' WHEN s.scenario='ARUNA_4D_RECOVERY' THEN 'Recovery applied' ELSE 'At risk' END recovery_status,
 o.priority,o.inventory_available,
 CASE WHEN s.scenario='BASELINE' THEN 'On plan' WHEN s.scenario='ARUNA_4D_RECOVERY' THEN 'Expedited / alternate' ELSE 'Delayed' END shipment_status,
 'CoCo CLI Hackathon' tenant_name
FROM orders o CROSS JOIN scenarios s;

CREATE OR REPLACE SEMANTIC VIEW ONTOTRAIL_ANALYST
  TABLES (
    exposure AS ONTOTRAIL.SUPPLY_CHAIN.COCO_CLI_ORDER_EXPOSURE
      WITH SYNONYMS ('orders','supply chain exposure','customer orders')
      COMMENT='Synthetic CoCo CLI Hackathon order exposure across baseline, disruption and recovery scenarios'
  )
  DIMENSIONS (
    exposure.order_id AS exposure.order_id COMMENT='Synthetic customer order identifier',
    exposure.order_date AS exposure.order_date,
    exposure.due_date AS exposure.due_date,
    exposure.customer_name AS exposure.customer_name WITH SYNONYMS ('customer','client'),
    exposure.supplier_name AS exposure.supplier_name WITH SYNONYMS ('supplier','vendor'),
    exposure.supplier_city AS exposure.supplier_city,
    exposure.product_name AS exposure.product_name WITH SYNONYMS ('product','component','part'),
    exposure.product_family AS exposure.product_family,
    exposure.plant_name AS exposure.plant_name WITH SYNONYMS ('plant','site','factory'),
    exposure.region AS exposure.region,
    exposure.scenario AS exposure.scenario COMMENT='One of BASELINE, ARUNA_4D, ARUNA_4D_RECOVERY',
    exposure.recovery_status AS exposure.recovery_status,
    exposure.priority AS exposure.priority,
    exposure.shipment_status AS exposure.shipment_status,
    exposure.tenant_name AS exposure.tenant_name
  )
  METRICS (
    exposure.total_exposure_inr AS SUM(exposure.exposed_value_rupees) WITH SYNONYMS ('exposure','value at risk','exposed value') COMMENT='Full order value exposed to the active scenario in INR',
    exposure.total_order_value_inr AS SUM(exposure.order_value_inr) WITH SYNONYMS ('order value','revenue value'),
    exposure.total_order_quantity AS SUM(exposure.order_quantity) WITH SYNONYMS ('units','quantity'),
    exposure.average_delay_days AS AVG(exposure.delay_days) WITH SYNONYMS ('delay','average delay'),
    exposure.orders_count AS COUNT(DISTINCT exposure.order_id) WITH SYNONYMS ('orders','order count'),
    exposure.total_inventory_available AS SUM(exposure.inventory_available) WITH SYNONYMS ('inventory','available stock')
  )
  COMMENT='OntoTrail semantic view for the CoCo CLI Hackathon synthetic supply-chain tenant'
  AI_SQL_GENERATION 'This is synthetic supply-chain planning data for a fixed 18 Sep 2026 snapshot. Always keep scenarios separate. If the user does not name a scenario, use ARUNA_4D and include scenario in the output. Never aggregate BASELINE, ARUNA_4D and ARUNA_4D_RECOVERY into one grand total. Exposure is full order value at risk, not lost revenue. Valid scenarios are BASELINE, ARUNA_4D and ARUNA_4D_RECOVERY. Prefer concise result sets suitable for business charts. For rankings, sort descending and return at most 10 rows.';

-- Sanity checks
SELECT scenario, COUNT(DISTINCT order_id) orders, ROUND(SUM(exposed_value_rupees),2) total_exposure_inr
FROM COCO_CLI_ORDER_EXPOSURE GROUP BY scenario ORDER BY scenario;
SHOW SEMANTIC VIEWS LIKE 'ONTOTRAIL_ANALYST' IN SCHEMA ONTOTRAIL.SUPPLY_CHAIN;

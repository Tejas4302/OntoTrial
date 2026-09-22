-- OntoTrail Marketplace trade + weather semantic view
-- Requires ONTOTRAIL.SUPPLY_CHAIN.INDIA_TRADE_RISK_ENRICHED.
-- TradePrism rows are annual bilateral trade flows / forecasts, not shipments.
-- WEATHER_RISK_SCORE is an OntoTrail heuristic derived from Pelmorex forecasts.

USE ROLE ACCOUNTADMIN;
USE WAREHOUSE ONTOTRAIL_WH;
USE DATABASE ONTOTRAIL;
USE SCHEMA SUPPLY_CHAIN;

CREATE OR REPLACE SEMANTIC VIEW ONTOTRAIL_TRADE_RISK_ANALYST
TABLES (
    trade_risk AS ONTOTRAIL.SUPPLY_CHAIN.INDIA_TRADE_RISK_ENRICHED
)
DIMENSIONS (
    trade_risk.TRADE_YEAR AS trade_risk.trade_year WITH SYNONYMS = ('year', 'forecast year', 'trade year'),
    trade_risk.TRADE_DIRECTION AS trade_risk.trade_direction WITH SYNONYMS = ('direction', 'import or export', 'trade direction'),
    trade_risk.ORIGIN_ISO AS trade_risk.origin_iso WITH SYNONYMS = ('origin code', 'source country code', 'exporter code'),
    trade_risk.ORIGIN_COUNTRY AS trade_risk.origin_country WITH SYNONYMS = ('origin', 'source country', 'exporter', 'origin country'),
    trade_risk.DESTINATION_ISO AS trade_risk.destination_iso WITH SYNONYMS = ('destination', 'destination country', 'importer code'),
    trade_risk.HS4_CODE AS trade_risk.hs4_str WITH SYNONYMS = ('hs4', 'hs code', 'commodity code', 'product code'),
    trade_risk.COMMODITY_SECTION AS trade_risk.section WITH SYNONYMS = ('section', 'commodity section', 'product section'),
    trade_risk.COMMODITY_CHAPTER AS trade_risk.chapter WITH SYNONYMS = ('chapter', 'commodity group', 'product group', 'category'),
    trade_risk.COMMODITY_HEADING AS trade_risk.heading WITH SYNONYMS = ('heading', 'commodity', 'product', 'commodity heading'),
    trade_risk.MODAL_SUBGROUP AS trade_risk.modal_subgroup WITH SYNONYMS = ('goods type', 'product stage', 'trade category'),
    trade_risk.MODE AS trade_risk.mode WITH SYNONYMS = ('transport mode', 'shipping mode', 'mode of transport'),
    trade_risk.WEATHER_RISK_LEVEL AS trade_risk.weather_risk_level WITH SYNONYMS = ('weather risk', 'weather severity', 'external weather risk'),
    trade_risk.weather_coverage_status AS IFF(trade_risk.WEATHER_DATA_AVAILABLE, 'AVAILABLE', 'NOT_AVAILABLE') WITH SYNONYMS = ('weather coverage', 'weather data available', 'external signal coverage'),
    trade_risk.WEATHER_FORECAST_START_DATE AS trade_risk.forecast_start_date WITH SYNONYMS = ('weather forecast start', 'forecast start'),
    trade_risk.WEATHER_FORECAST_END_DATE AS trade_risk.forecast_end_date WITH SYNONYMS = ('weather forecast end', 'forecast end')
)
METRICS (
    trade_risk.total_nominal_trade_value_usd AS SUM(trade_risk.NOMINAL_TRADE_VALUE)
        WITH SYNONYMS = ('trade value', 'nominal trade value', 'total trade value', 'exposure', 'trade exposure', 'import exposure', 'export exposure')
        COMMENT = 'Sum of nominal bilateral trade value in USD for the selected flows.',
    trade_risk.total_real_trade_value_usd AS SUM(trade_risk.REAL_TRADE_VALUE)
        WITH SYNONYMS = ('real trade value', 'constant dollar trade value', 'inflation adjusted trade value')
        COMMENT = 'Sum of real bilateral trade value in constant USD.',
    trade_risk.total_trade_weight_tonnes AS SUM(trade_risk.NET_WEIGHT)
        WITH SYNONYMS = ('trade weight', 'net weight', 'tonnes', 'trade mass'),
    trade_risk.total_air_trade_value_usd AS SUM(trade_risk.NOMINAL_BY_AIR)
        WITH SYNONYMS = ('air trade value', 'air freight value', 'value by air'),
    trade_risk.total_land_trade_value_usd AS SUM(trade_risk.NOMINAL_BY_LAND)
        WITH SYNONYMS = ('land trade value', 'road rail trade value', 'value by land'),
    trade_risk.total_sea_trade_value_usd AS SUM(trade_risk.NOMINAL_BY_SEA)
        WITH SYNONYMS = ('sea trade value', 'ocean trade value', 'maritime trade value', 'value by sea'),
    trade_risk.air_dependency_pct AS SUM(trade_risk.NOMINAL_BY_AIR) / NULLIF(SUM(trade_risk.NOMINAL_TRADE_VALUE), 0) * 100
        WITH SYNONYMS = ('air dependency', 'air share', 'air transport dependency'),
    trade_risk.land_dependency_pct AS SUM(trade_risk.NOMINAL_BY_LAND) / NULLIF(SUM(trade_risk.NOMINAL_TRADE_VALUE), 0) * 100
        WITH SYNONYMS = ('land dependency', 'land share', 'road rail dependency'),
    trade_risk.sea_dependency_pct AS SUM(trade_risk.NOMINAL_BY_SEA) / NULLIF(SUM(trade_risk.NOMINAL_TRADE_VALUE), 0) * 100
        WITH SYNONYMS = ('sea dependency', 'sea share', 'maritime dependency', 'ocean dependency'),
    trade_risk.import_value_usd AS SUM(IFF(trade_risk.TRADE_DIRECTION = 'IMPORT', trade_risk.NOMINAL_TRADE_VALUE, 0))
        WITH SYNONYMS = ('India import value', 'imports', 'import exposure', 'inbound trade value'),
    trade_risk.export_value_usd AS SUM(IFF(trade_risk.TRADE_DIRECTION = 'EXPORT', trade_risk.NOMINAL_TRADE_VALUE, 0))
        WITH SYNONYMS = ('India export value', 'exports', 'export exposure', 'outbound trade value'),
    trade_risk.weather_covered_trade_value_usd AS SUM(IFF(trade_risk.WEATHER_DATA_AVAILABLE, trade_risk.NOMINAL_TRADE_VALUE, 0))
        WITH SYNONYMS = ('weather covered trade value', 'trade value with weather data', 'weather intelligence coverage value'),
    trade_risk.weather_coverage_pct AS SUM(IFF(trade_risk.WEATHER_DATA_AVAILABLE, trade_risk.NOMINAL_TRADE_VALUE, 0)) / NULLIF(SUM(trade_risk.NOMINAL_TRADE_VALUE), 0) * 100
        WITH SYNONYMS = ('weather coverage percentage', 'weather data coverage', 'external signal coverage percentage'),
    trade_risk.elevated_weather_risk_trade_value_usd AS SUM(IFF(trade_risk.WEATHER_RISK_LEVEL IN ('MEDIUM','HIGH'), trade_risk.NOMINAL_TRADE_VALUE, 0))
        WITH SYNONYMS = ('weather exposed trade value', 'elevated weather risk exposure', 'trade value at weather risk'),
    trade_risk.trade_weighted_weather_risk_score AS
        SUM(IFF(trade_risk.WEATHER_DATA_AVAILABLE, trade_risk.NOMINAL_TRADE_VALUE * trade_risk.WEATHER_RISK_SCORE, 0))
        / NULLIF(SUM(IFF(trade_risk.WEATHER_DATA_AVAILABLE, trade_risk.NOMINAL_TRADE_VALUE, 0)), 0)
        WITH SYNONYMS = ('weighted weather risk', 'trade weighted weather risk', 'weather risk score')
        COMMENT = 'OntoTrail heuristic: country weather risk weighted by selected nominal trade value.',
    trade_risk.trade_weighted_affected_location_pct AS
        SUM(IFF(trade_risk.WEATHER_DATA_AVAILABLE, trade_risk.NOMINAL_TRADE_VALUE * trade_risk.AFFECTED_LOCATION_PCT, 0))
        / NULLIF(SUM(IFF(trade_risk.WEATHER_DATA_AVAILABLE, trade_risk.NOMINAL_TRADE_VALUE, 0)), 0)
        WITH SYNONYMS = ('affected weather locations', 'affected location percentage', 'weather affected locations'),
    trade_risk.origin_country_count AS COUNT(DISTINCT trade_risk.ORIGIN_ISO)
        WITH SYNONYMS = ('origin countries', 'source country count', 'number of origins'),
    trade_risk.commodity_count AS COUNT(DISTINCT trade_risk.HS4_STR)
        WITH SYNONYMS = ('commodity count', 'number of commodities', 'hs4 count')
)
COMMENT = 'OntoTrail governed India trade-risk semantic view combining Oxford Economics TradePrism bilateral trade intelligence with Pelmorex weather signals.'
AI_SQL_GENERATION 'TradePrism rows represent annual bilateral trade flows and forecasts, not individual shipments or purchase orders. Use TRADE_YEAR whenever the user gives a year. For India imports use TRADE_DIRECTION = IMPORT or DESTINATION_ISO = IND. For India exports use TRADE_DIRECTION = EXPORT or ORIGIN_ISO = IND. Only compare weather risk for rows where WEATHER_COVERAGE_STATUS = AVAILABLE unless the user explicitly asks to include uncovered countries. Never invent weather risk for uncovered countries. WEATHER_RISK_SCORE and affected-location measures are OntoTrail-derived heuristics based on Pelmorex forecasts. Trade value metrics are USD. Prefer semantic metrics instead of re-deriving their formulas. When ranking countries, use ORIGIN_COUNTRY when available and retain ORIGIN_ISO for traceability.'
AI_QUESTION_CATEGORIZATION 'This semantic view answers questions about India bilateral trade flows, import and export exposure, commodities, HS4 categories, transport-mode dependency, annual forecasts, weather-data coverage and weather-linked trade risk. If a question asks about individual suppliers, purchase orders, exact shipments, plants, delivery dates or supplier-specific operational events, explain that those entities are outside this Marketplace trade-flow dataset rather than fabricating them.';

CREATE ROLE IF NOT EXISTS ONTOTRAIL_APP_ROLE;
GRANT USAGE ON WAREHOUSE ONTOTRAIL_WH TO ROLE ONTOTRAIL_APP_ROLE;
GRANT USAGE ON DATABASE ONTOTRAIL TO ROLE ONTOTRAIL_APP_ROLE;
GRANT USAGE ON SCHEMA ONTOTRAIL.SUPPLY_CHAIN TO ROLE ONTOTRAIL_APP_ROLE;
GRANT SELECT ON VIEW ONTOTRAIL.SUPPLY_CHAIN.INDIA_TRADE_RISK_ENRICHED TO ROLE ONTOTRAIL_APP_ROLE;
GRANT REFERENCES, SELECT ON SEMANTIC VIEW ONTOTRAIL.SUPPLY_CHAIN.ONTOTRAIL_TRADE_RISK_ANALYST TO ROLE ONTOTRAIL_APP_ROLE;
GRANT DATABASE ROLE SNOWFLAKE.CORTEX_ANALYST_USER TO ROLE ONTOTRAIL_APP_ROLE;

DESC SEMANTIC VIEW ONTOTRAIL.SUPPLY_CHAIN.ONTOTRAIL_TRADE_RISK_ANALYST;

SELECT *
FROM SEMANTIC_VIEW(
    ONTOTRAIL.SUPPLY_CHAIN.ONTOTRAIL_TRADE_RISK_ANALYST
    METRICS trade_risk.import_value_usd,
            trade_risk.sea_dependency_pct,
            trade_risk.weather_coverage_pct
    DIMENSIONS trade_risk.trade_year
    WHERE trade_risk.trade_year = 2026
);

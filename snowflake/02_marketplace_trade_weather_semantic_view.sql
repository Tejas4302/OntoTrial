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
    trade_risk.trade_year AS trade_risk.TRADE_YEAR
        WITH SYNONYMS = ('year', 'forecast year', 'trade year'),
    trade_risk.trade_direction AS trade_risk.TRADE_DIRECTION
        WITH SYNONYMS = ('direction', 'import or export', 'trade direction'),
    trade_risk.origin_iso AS trade_risk.ORIGIN_ISO
        WITH SYNONYMS = ('origin code', 'source country code', 'exporter code'),
    trade_risk.origin_country AS trade_risk.ORIGIN_COUNTRY
        WITH SYNONYMS = ('origin', 'source country', 'exporter', 'origin country'),
    trade_risk.destination_iso AS trade_risk.DESTINATION_ISO
        WITH SYNONYMS = ('destination', 'destination country', 'importer code'),
    trade_risk.hs4_code AS trade_risk.HS4_STR
        WITH SYNONYMS = ('hs4', 'hs code', 'commodity code', 'product code'),
    trade_risk.commodity_section AS trade_risk.SECTION
        WITH SYNONYMS = ('section', 'commodity section', 'product section'),
    trade_risk.commodity_chapter AS trade_risk.CHAPTER
        WITH SYNONYMS = ('chapter', 'commodity group', 'product group', 'category'),
    trade_risk.commodity_heading AS trade_risk.HEADING
        WITH SYNONYMS = ('heading', 'commodity', 'product', 'commodity heading'),
    trade_risk.modal_subgroup AS trade_risk.MODAL_SUBGROUP
        WITH SYNONYMS = ('goods type', 'product stage', 'trade category'),
    trade_risk.mode AS trade_risk.MODE
        WITH SYNONYMS = ('transport mode', 'shipping mode', 'mode of transport'),
    trade_risk.weather_risk_level AS trade_risk.WEATHER_RISK_LEVEL
        WITH SYNONYMS = ('weather risk', 'weather severity', 'external weather risk'),
    trade_risk.weather_coverage_status AS IFF(trade_risk.WEATHER_DATA_AVAILABLE, 'AVAILABLE', 'NOT_AVAILABLE')
        WITH SYNONYMS = ('weather coverage', 'weather data available', 'external signal coverage'),
    trade_risk.weather_forecast_start_date AS trade_risk.FORECAST_START_DATE
        WITH SYNONYMS = ('weather forecast start', 'forecast start'),
    trade_risk.weather_forecast_end_date AS trade_risk.FORECAST_END_DATE
        WITH SYNONYMS = ('weather forecast end', 'forecast end')
)
METRICS (
    trade_risk.total_nominal_trade_value_usd AS SUM(trade_risk.NOMINAL_TRADE_VALUE)
        WITH SYNONYMS = ('trade value', 'nominal trade value', 'total trade value', 'exposure', 'trade exposure', 'import exposure', 'export exposure')
        COMMENT = 'Sum of nominal bilateral trade value in USD for the selected flows. Apply TRADE_DIRECTION = IMPORT for India import analysis and EXPORT for India export analysis.',
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
        WITH SYNONYMS = ('sea dependency', 'sea share', 'maritime dependency', 'ocean dependency')
        COMMENT = 'Share of nominal trade value carried by sea within the currently filtered trade flows. For India import sea dependency, filter TRADE_DIRECTION = IMPORT.',
    trade_risk.import_value_usd AS SUM(IFF(trade_risk.TRADE_DIRECTION = 'IMPORT', trade_risk.NOMINAL_TRADE_VALUE, 0))
        WITH SYNONYMS = ('India import value', 'imports', 'import exposure', 'inbound trade value'),
    trade_risk.export_value_usd AS SUM(IFF(trade_risk.TRADE_DIRECTION = 'EXPORT', trade_risk.NOMINAL_TRADE_VALUE, 0))
        WITH SYNONYMS = ('India export value', 'exports', 'export exposure', 'outbound trade value'),
    trade_risk.weather_covered_trade_value_usd AS SUM(IFF(trade_risk.WEATHER_DATA_AVAILABLE, trade_risk.NOMINAL_TRADE_VALUE, 0))
        WITH SYNONYMS = ('weather covered trade value', 'trade value with weather data', 'weather intelligence coverage value'),
    trade_risk.weather_coverage_pct AS SUM(IFF(trade_risk.WEATHER_DATA_AVAILABLE, trade_risk.NOMINAL_TRADE_VALUE, 0)) / NULLIF(SUM(trade_risk.NOMINAL_TRADE_VALUE), 0) * 100
        WITH SYNONYMS = ('weather coverage percentage', 'weather data coverage', 'external signal coverage percentage')
        COMMENT = 'Share of nominal trade value with Pelmorex origin-country coverage within the currently filtered trade flows. For India import weather coverage, filter TRADE_DIRECTION = IMPORT.',
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
AI_SQL_GENERATION 'TradePrism rows represent annual bilateral trade flows and forecasts, not individual shipments or purchase orders. Use TRADE_YEAR whenever the user gives a year. For any India import question, explicitly filter TRADE_DIRECTION = IMPORT so trade value, transport dependency and weather coverage are calculated on imports only. For India export questions, explicitly filter TRADE_DIRECTION = EXPORT. Interpret the business phrase Rest of World and the label ROW as the aggregate origin where ORIGIN_ISO = ROW. If the user asks about Rest of World, explicitly filter ORIGIN_ISO = ROW and do not rank or substitute other origin countries. Rest of World is an aggregate geography, not a single country. If the user asks to explain a geography including commodity concentration, include a commodity breakdown using COMMODITY_CHAPTER, COMMODITY_HEADING or HS4_CODE rather than returning only COMMODITY_COUNT. Only compare weather risk for rows where WEATHER_COVERAGE_STATUS = AVAILABLE unless the user explicitly asks to include uncovered geographies. Never invent weather risk for uncovered geographies. For aggregate geographies such as ROW, report weather only if coverage exists on the aggregate row itself; do not infer constituent-country weather. WEATHER_RISK_SCORE and affected-location measures are OntoTrail-derived heuristics based on Pelmorex forecasts. Trade value metrics are USD. Prefer semantic metrics instead of re-deriving their formulas. When ranking countries, use ORIGIN_COUNTRY when available and retain ORIGIN_ISO for traceability.'
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
    DIMENSIONS trade_risk.trade_year,
               trade_risk.trade_direction
    WHERE trade_risk.trade_year = 2026
      AND trade_risk.trade_direction = 'IMPORT'
);


-- Validation: Rest of World must resolve to the ROW aggregate, not a country ranking.
SELECT *
FROM SEMANTIC_VIEW(
    ONTOTRAIL.SUPPLY_CHAIN.ONTOTRAIL_TRADE_RISK_ANALYST
    METRICS trade_risk.import_value_usd,
            trade_risk.sea_dependency_pct,
            trade_risk.air_dependency_pct,
            trade_risk.land_dependency_pct,
            trade_risk.weather_coverage_pct
    DIMENSIONS trade_risk.origin_country,
               trade_risk.origin_iso,
               trade_risk.trade_year,
               trade_risk.trade_direction
    WHERE trade_risk.trade_year = 2026
      AND trade_risk.trade_direction = 'IMPORT'
      AND trade_risk.origin_iso = 'ROW'
);

-- OntoTrail Marketplace trade + weather enrichment
-- Creates the governed India trade-risk source used by:
--   02_marketplace_trade_weather_semantic_view.sql
--   03_nova_mobility_internal_operations.sql
--
-- Requires Marketplace databases:
--   TRADEPRISM_FULL_DATASET.PUBLIC.TRADEPRISM_DATA
--   PELMOREX_WEATHER_SOURCE_FROSTBYTE.ONPOINT_ID.FORECAST_DAY

USE ROLE ACCOUNTADMIN;
USE WAREHOUSE ONTOTRAIL_WH;
USE DATABASE ONTOTRAIL;
USE SCHEMA SUPPLY_CHAIN;

CREATE OR REPLACE VIEW INDIA_TRADE_RISK_ENRICHED AS
WITH country_map AS (
    SELECT * FROM VALUES
        ('ARE','AE','United Arab Emirates'),('ARG','AR','Argentina'),('AUS','AU','Australia'),
        ('AUT','AT','Austria'),('BEL','BE','Belgium'),('BGD','BD','Bangladesh'),
        ('BRA','BR','Brazil'),('CAN','CA','Canada'),('CHE','CH','Switzerland'),
        ('CHL','CL','Chile'),('CHN','CN','China'),('COL','CO','Colombia'),
        ('CZE','CZ','Czech Republic'),('DEU','DE','Germany'),('DNK','DK','Denmark'),
        ('EGY','EG','Egypt'),('ESP','ES','Spain'),('FIN','FI','Finland'),
        ('FRA','FR','France'),('GBR','GB','United Kingdom'),('GRC','GR','Greece'),
        ('HKG','HK','Hong Kong'),('IDN','ID','Indonesia'),('IND','IN','India'),
        ('IRL','IE','Ireland'),('ITA','IT','Italy'),('JPN','JP','Japan'),
        ('KOR','KR','South Korea'),('MEX','MX','Mexico'),('MYS','MY','Malaysia'),
        ('NLD','NL','Netherlands'),('NOR','NO','Norway'),('NZL','NZ','New Zealand'),
        ('PER','PE','Peru'),('PHL','PH','Philippines'),('POL','PL','Poland'),
        ('PRT','PT','Portugal'),('ROW',NULL,'Rest of World'),('RUS','RU','Russia'),
        ('SAU','SA','Saudi Arabia'),('SGP','SG','Singapore'),('SWE','SE','Sweden'),
        ('THA','TH','Thailand'),('TUR','TR','Turkey'),('USA','US','United States'),
        ('VNM','VN','Vietnam'),('ZAF','ZA','South Africa')
        AS c(ISO3,ISO2,COUNTRY_NAME)
),
latest_weather_run AS (
    SELECT MAX(TIME_INIT_UTC) MAX_TIME_INIT
    FROM PELMOREX_WEATHER_SOURCE_FROSTBYTE.ONPOINT_ID.FORECAST_DAY
),
weather_location AS (
    SELECT
        w.COUNTRY,w.POSTAL_CODE,w.CITY_NAME,
        MIN(w.DATE_VALID_STD) FORECAST_START_DATE,
        MAX(w.DATE_VALID_STD) FORECAST_END_DATE,
        GREATEST(
            IFF(MAX(w.MAX_WIND_SPEED_10M_MPH)>=35,35,0),
            IFF(MAX(w.TOT_PRECIPITATION_IN)>=1,30,0),
            IFF(MAX(w.PROBABILITY_OF_PRECIPITATION_PCT)>=80,20,0),
            IFF(MAX(w.MAX_TEMPERATURE_AIR_2M_F)>=100,20,0),
            IFF(MIN(w.MIN_TEMPERATURE_AIR_2M_F)<=32,20,0)
        ) LOCATION_RISK_SCORE
    FROM PELMOREX_WEATHER_SOURCE_FROSTBYTE.ONPOINT_ID.FORECAST_DAY w
    CROSS JOIN latest_weather_run lr
    WHERE w.TIME_INIT_UTC=lr.MAX_TIME_INIT
    GROUP BY w.COUNTRY,w.POSTAL_CODE,w.CITY_NAME
),
weather_country AS (
    SELECT
        COUNTRY,
        MIN(FORECAST_START_DATE) FORECAST_START_DATE,
        MAX(FORECAST_END_DATE) FORECAST_END_DATE,
        ROUND(AVG(LOCATION_RISK_SCORE),2) WEATHER_RISK_SCORE,
        ROUND(COUNT_IF(LOCATION_RISK_SCORE>=20)/NULLIF(COUNT(*),0)*100,2) AFFECTED_LOCATION_PCT,
        CASE
            WHEN AVG(LOCATION_RISK_SCORE)>=30 THEN 'HIGH'
            WHEN AVG(LOCATION_RISK_SCORE)>=15 THEN 'MEDIUM'
            ELSE 'LOW'
        END WEATHER_RISK_LEVEL
    FROM weather_location
    GROUP BY COUNTRY
),
trade AS (
    SELECT
        TRY_TO_NUMBER(t.YEAR_STR) TRADE_YEAR,
        CASE WHEN t.DESTINATION_ISO='IND' THEN 'IMPORT'
             WHEN t.ORIGIN_ISO='IND' THEN 'EXPORT' END TRADE_DIRECTION,
        t.ORIGIN_ISO,
        COALESCE(oc.COUNTRY_NAME,t.ORIGIN_ISO) ORIGIN_COUNTRY,
        t.DESTINATION_ISO,
        COALESCE(dc.COUNTRY_NAME,t.DESTINATION_ISO) DESTINATION_COUNTRY,
        LPAD(t.HS4_STR::VARCHAR,4,'0') HS4_STR,
        t.SECTION,t.CHAPTER,t.HEADING,t.MODE,t.MODAL_SUBGROUP,
        t.NOMINAL NOMINAL_TRADE_VALUE,
        t.REAL REAL_TRADE_VALUE,
        t.NETWEIGHT NET_WEIGHT,
        t.NOMINAL_BY_AIR,t.NOMINAL_BY_LAND,t.NOMINAL_BY_SEA,
        oc.ISO2 ORIGIN_ISO2
    FROM TRADEPRISM_FULL_DATASET.PUBLIC.TRADEPRISM_DATA t
    LEFT JOIN country_map oc ON t.ORIGIN_ISO=oc.ISO3
    LEFT JOIN country_map dc ON t.DESTINATION_ISO=dc.ISO3
    WHERE t.DESTINATION_ISO='IND' OR t.ORIGIN_ISO='IND'
)
SELECT
    t.TRADE_YEAR,t.TRADE_DIRECTION,
    t.ORIGIN_ISO,t.ORIGIN_COUNTRY,
    t.DESTINATION_ISO,t.DESTINATION_COUNTRY,
    t.HS4_STR,t.SECTION,t.CHAPTER,t.HEADING,t.MODAL_SUBGROUP,t.MODE,
    t.NOMINAL_TRADE_VALUE,t.REAL_TRADE_VALUE,t.NET_WEIGHT,
    t.NOMINAL_BY_AIR,t.NOMINAL_BY_LAND,t.NOMINAL_BY_SEA,
    IFF(w.COUNTRY IS NOT NULL,TRUE,FALSE) WEATHER_DATA_AVAILABLE,
    COALESCE(w.WEATHER_RISK_SCORE,0) WEATHER_RISK_SCORE,
    IFF(w.COUNTRY IS NULL,'NOT_AVAILABLE',w.WEATHER_RISK_LEVEL) WEATHER_RISK_LEVEL,
    COALESCE(w.AFFECTED_LOCATION_PCT,0) AFFECTED_LOCATION_PCT,
    IFF(w.COUNTRY IS NULL,'NOT_AVAILABLE','AVAILABLE') WEATHER_COVERAGE_STATUS,
    w.FORECAST_START_DATE,w.FORECAST_END_DATE
FROM trade t
LEFT JOIN weather_country w ON t.ORIGIN_ISO2=w.COUNTRY;

-- Validation
SELECT
    TRADE_YEAR,TRADE_DIRECTION,
    COUNT(*) ROW_COUNT,
    ROUND(SUM(NOMINAL_TRADE_VALUE),2) TRADE_VALUE_USD
FROM INDIA_TRADE_RISK_ENRICHED
WHERE TRADE_YEAR=2026
GROUP BY TRADE_YEAR,TRADE_DIRECTION
ORDER BY TRADE_DIRECTION;
